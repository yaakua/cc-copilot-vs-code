const fs = require("fs");
const path = require("path");
const os = require("os");
const { PROVIDER_TYPE_CLAUDE_OFFICIAL, PROVIDER_TYPE_THIRD_PARTY } = require('./constants');

/**
 * 账号管理器
 * 负责处理Claude账号的认证、切换和管理
 */
class AccountManager {
    constructor(configManager) {
        this.configManager = configManager;
    }

    /**
     * 获取活动账号信息
     */
    getActiveAccountInfo() {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔍 Getting active account info...`);
            const settingsData = this.configManager.loadSettingsFromStore();
            if (settingsData) {
                console.log(`[DEBUG] [Claude Interceptor] 📁 Settings data loaded successfully`);
                console.log(`[DEBUG] [Claude Interceptor] 📋 Active service provider ID: ${settingsData.activeServiceProviderId}`);
                
                const activeResult = this.configManager.getCurrentActiveAccountFromSettings(settingsData);
                if (activeResult) {
                    const { provider, account } = activeResult;
                    console.log(`[DEBUG] [Claude Interceptor] 🔍 Found active account - Provider: ${provider.type}, Account: ${account.emailAddress || account.name}`);

                    if (provider.type === PROVIDER_TYPE_CLAUDE_OFFICIAL) {
                        const accountInfo = {
                            type: PROVIDER_TYPE_CLAUDE_OFFICIAL,
                            emailAddress: account.emailAddress,
                            authorization: account.authorization
                        };
                        
                        console.log(`[DEBUG] [Claude Interceptor] 🔑 Claude account token status: ${account.authorization ? 'Has token' : 'No token'}`);
                        if (account.authorization) {
                            console.log(`[DEBUG] [Claude Interceptor] 🔑 Token preview: ${account.authorization.substring(0, 20)}...`);
                        }
                        
                        // 如果新切换的账号没有token，尝试主动获取
                        if (!account.authorization && account.emailAddress) {
                            console.log(`[DEBUG] [Claude Interceptor] 🔄 New account without token, attempting to retrieve: ${account.emailAddress}`);
                            this.attemptToRetrieveTokenForAccount(account.emailAddress);
                        }
                        
                        return accountInfo;
                    } else {
                        console.log(`[DEBUG] [Claude Interceptor] 🔶 Third-party account: ${account.name}`);
                        return {
                            type: PROVIDER_TYPE_THIRD_PARTY,
                            name: account.name,
                            apiKey: account.apiKey,
                            baseUrl: account.baseUrl
                        };
                    }
                }
            }
            console.log('[DEBUG] [Claude Interceptor] ⚠️ No available account found');
            return null;
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Unable to get account config:', error.message);
            return null;
        }
    }

    /**
     * 尝试为账号获取token
     * 通过检查Claude CLI的配置文件来获取已有的token
     */
    attemptToRetrieveTokenForAccount(emailAddress) {
        try {
            const os = require('os');
            const path = require('path');
            
            // Claude CLI配置文件路径
            const claudeConfigPath = path.join(os.homedir(), '.anthropic', 'claude-cli', 'config.json');
            
            if (fs.existsSync(claudeConfigPath)) {
                const configContent = fs.readFileSync(claudeConfigPath, 'utf-8');
                const config = JSON.parse(configContent);
                
                // 查找匹配的账号
                if (config.account && config.account.email === emailAddress && config.account.session_key) {
                    console.log(`[SILENT] [Claude Interceptor] Found existing token for account: ${emailAddress}`);
                    
                    // 构建authorization header
                    const authorization = `Bearer ${config.account.session_key}`;
                    
                    // 更新配置
                    this.updateAuthorizationInConfig(authorization);
                    
                    return authorization;
                }
            }
        } catch (error) {
            console.warn(`[SILENT] [Claude Interceptor] Failed to retrieve token for account ${emailAddress}:`, error.message);
        }
        return null;
    }

    /**
     * 更新配置中的authorization
     */
    updateAuthorizationInConfig(authorization) {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔄 Updating authorization in config...`);
            console.log(`[DEBUG] [Claude Interceptor] 🔑 Authorization preview: ${authorization.substring(0, 30)}...`);
            
            const accountInfo = this.getActiveAccountInfo();
            console.log(`[DEBUG] [Claude Interceptor] 📋 Current account info:`, accountInfo);
            
            // 检查当前账号的authorization是否需要更新
            if (!accountInfo?.authorization || accountInfo.authorization !== authorization) {
                console.log(`[DEBUG] [Claude Interceptor] 🔄 Authorization needs update`);
                
                const settingsData = this.configManager.loadSettingsFromStore();
                if (settingsData) {
                    console.log(`[DEBUG] [Claude Interceptor] 📁 Settings loaded for authorization update`);
                    
                    // 首先检查这个authorization是否已被其他Claude账号使用
                    const existingAccount = this.findClaudeAccountByAuthorization(settingsData, authorization);
                    
                    if (existingAccount) {
                        // 如果已存在该authorization的账号，切换到该账号
                        console.log(`[DEBUG] [Claude Interceptor] ✅ Found existing account for authorization: ${existingAccount.emailAddress}`);
                        this.switchToExistingAccount(settingsData, existingAccount.emailAddress);
                        return;
                    }

                    // 如果当前有账号配置，更新其authorization
                    if (accountInfo?.emailAddress) {
                        console.log(`[DEBUG] [Claude Interceptor] 💾 Updating authorization for account: ${accountInfo.emailAddress}`);
                        this.updateClaudeAccountAuthorization(settingsData, accountInfo.emailAddress, authorization);
                        const saveResult = this.configManager.saveSettingsToStore(settingsData);
                        console.log(`[DEBUG] [Claude Interceptor] 💾 Save result: ${saveResult}`);
                        console.log('[DEBUG] [Claude Interceptor] ✅ Authorization saved to config file');
                        
                        // 触发token更新通知，用于隐藏会话的token验证
                        this.notifyTokenUpdate(accountInfo.emailAddress, authorization);
                    } else {
                        console.log(`[DEBUG] [Claude Interceptor] 🔍 No current account email, identifying from authorization...`);
                        // 尝试从API请求中识别账号信息
                        this.identifyAccountFromAuthorization(authorization);
                    }
                }
            } else {
                console.log(`[DEBUG] [Claude Interceptor] ✅ Authorization already up to date`);
            }
        } catch (error) {
            console.error('[DEBUG] [Claude Interceptor] ❌ Failed to save authorization:', error.message);
        }
    }

    /**
     * 通知token更新
     * 用于通知扩展token已成功获取
     */
    notifyTokenUpdate(emailAddress, authorization) {
        try {
            const os = require('os');
            const path = require('path');
            
            // 创建token更新通知文件
            const tempDir = path.join(os.tmpdir(), 'cc-copilot');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const tokenFile = path.join(tempDir, `token_${Date.now()}.json`);
            const tokenData = {
                emailAddress,
                authorization,
                timestamp: Date.now(),
                type: 'token_update'
            };
            
            fs.writeFileSync(tokenFile, JSON.stringify(tokenData));
            console.log(`[SILENT] [Claude Interceptor] Token update notification created: ${tokenFile}`);
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to create token notification:', error.message);
        }
    }

    /**
     * 切换到已存在的账号
     */
    switchToExistingAccount(settingsData, emailAddress) {
        try {
            const serviceProviders = settingsData.serviceProviders || [];
            const claudeProvider = serviceProviders.find(p => p.type === PROVIDER_TYPE_CLAUDE_OFFICIAL);
            
            if (claudeProvider) {
                claudeProvider.activeAccountId = emailAddress;
                settingsData.activeServiceProviderId = claudeProvider.id;
                this.configManager.saveSettingsToStore(settingsData);
                
                console.log(`[TERMINAL] [Claude Interceptor] Switched to account: ${emailAddress}`);
            }
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] Failed to switch account:', error.message);
        }
    }

    /**
     * 从authorization token识别账号信息
     */
    async identifyAccountFromAuthorization(authorization) {
        try {
            // 通过发送API请求获取账号信息
            const userInfo = await this.fetchUserInfoFromAPI(authorization);
            if (userInfo && userInfo.email) {
                console.log(`[SILENT] [Claude Interceptor] Identified account from token: ${userInfo.email}`);
                
                // 创建或更新账号信息
                const account = {
                    accountUuid: userInfo.id || '',
                    emailAddress: userInfo.email,
                    organizationUuid: userInfo.organization_id || '',
                    organizationRole: userInfo.organization_role || 'member',
                    workspaceRole: userInfo.workspace_role || null,
                    organizationName: userInfo.organization_name || 'Unknown',
                    authorization: authorization
                };

                // 保存到配置
                const settingsData = this.configManager.loadSettingsFromStore();
                if (settingsData) {
                    await this.addOrUpdateClaudeAccount(settingsData, account);
                    this.configManager.saveSettingsToStore(settingsData);
                    
                    // 同时保存到扩展的全局存储中
                    await this.saveAccountToExtensionStorage(account);
                }
            }
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to identify account from authorization:', error.message);
        }
    }

    /**
     * 通过API请求获取用户信息
     */
    async fetchUserInfoFromAPI(authorization) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/account', {
                method: 'GET',
                headers: {
                    'authorization': authorization,
                    'content-type': 'application/json'
                }
            });

            if (response.ok) {
                return await response.json();
            } else if (response.status === 401) {
                console.warn('[SILENT] [Claude Interceptor] Authorization token expired or invalid');
                this.handleTokenExpired(authorization);
                return null;
            }
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to fetch user info:', error.message);
        }
        return null;
    }

    /**
     * 处理token过期
     */
    handleTokenExpired(expiredAuthorization) {
        try {
            const settingsData = this.configManager.loadSettingsFromStore();
            if (settingsData) {
                // 查找使用该token的账号
                const account = this.findClaudeAccountByAuthorization(settingsData, expiredAuthorization);
                if (account) {
                    console.warn(`[TERMINAL] [Claude Interceptor] Token expired for account: ${account.emailAddress}`);
                    // 清除过期的token
                    account.authorization = undefined;
                    this.updateClaudeAccountAuthorization(settingsData, account.emailAddress, undefined);
                    this.configManager.saveSettingsToStore(settingsData);
                    
                    // 触发重新登录提示
                    this.promptRelogin(account.emailAddress);
                }
            }
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] Failed to handle token expiration:', error.message);
        }
    }

    /**
     * 提示用户重新登录
     */
    promptRelogin(emailAddress) {
        console.log(`[TERMINAL] [Claude Interceptor] Account ${emailAddress} needs to re-login. Token has expired.`);
    }

    /**
     * 添加或更新Claude账号
     */
    async addOrUpdateClaudeAccount(settingsData, account) {
        const serviceProviders = settingsData.serviceProviders || [];
        let claudeProvider = serviceProviders.find(p => p.type === PROVIDER_TYPE_CLAUDE_OFFICIAL);

        if (!claudeProvider) {
            claudeProvider = {
                id: 'claude_official',
                type: 'claude_official',
                name: 'Claude Official',
                accounts: [],
                activeAccountId: '',
                useProxy: true
            };
            serviceProviders.push(claudeProvider);
        }

        const accounts = claudeProvider.accounts;
        const existingIndex = accounts.findIndex(acc => acc.emailAddress === account.emailAddress);

        if (existingIndex >= 0) {
            // 更新现有账号
            accounts[existingIndex] = { ...accounts[existingIndex], ...account };
        } else {
            // 添加新账号
            accounts.push(account);
        }

        // 设置为活动账号
        claudeProvider.activeAccountId = account.emailAddress;
        settingsData.activeServiceProviderId = claudeProvider.id;
        settingsData.serviceProviders = serviceProviders;
    }

    /**
     * 保存账号到扩展的全局存储
     */
    async saveAccountToExtensionStorage(account) {
        try {
            console.log(`[SILENT] [Claude Interceptor] Account ready for extension storage: ${account.emailAddress}`);
            
            const tempDir = path.join(os.tmpdir(), 'cc-copilot');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const accountFile = path.join(tempDir, `account_${Date.now()}.json`);
            fs.writeFileSync(accountFile, JSON.stringify(account));
            console.log(`[SILENT] [Claude Interceptor] Account saved to temp file: ${accountFile}`);
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to save account to temp storage:', error.message);
        }
    }

    /**
     * 根据authorization值查找Claude账号
     */
    findClaudeAccountByAuthorization(settingsData, authorization) {
        try {
            const serviceProviders = settingsData.serviceProviders || [];
            const claudeProvider = serviceProviders.find(p => p.type === PROVIDER_TYPE_CLAUDE_OFFICIAL);

            if (!claudeProvider) return null;

            return claudeProvider.accounts.find(acc => acc.authorization === authorization) || null;
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to find account:', error.message);
            return null;
        }
    }

    /**
     * 更新Claude账号的authorization值
     */
    updateClaudeAccountAuthorization(settingsData, emailAddress, authorization) {
        try {
            const serviceProviders = settingsData.serviceProviders || [];
            const claudeProvider = serviceProviders.find(p => p.type === PROVIDER_TYPE_CLAUDE_OFFICIAL);

            if (!claudeProvider) return false;

            const account = claudeProvider.accounts.find(acc => acc.emailAddress === emailAddress);
            if (account) {
                account.authorization = authorization;
                return true;
            }

            return false;
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] Failed to update authorization:', error.message);
            return false;
        }
    }
}

module.exports = AccountManager;