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
            const settingsData = this.configManager.loadSettingsFromStore();
            if (settingsData) {
                const activeResult = this.configManager.getCurrentActiveAccountFromSettings(settingsData);
                if (activeResult) {
                    const { provider, account } = activeResult;

                    if (provider.type === PROVIDER_TYPE_CLAUDE_OFFICIAL) {
                        return {
                            type: PROVIDER_TYPE_CLAUDE_OFFICIAL,
                            emailAddress: account.emailAddress,
                            authorization: account.authorization
                        };
                    } else {
                        return {
                            type: PROVIDER_TYPE_THIRD_PARTY,
                            name: account.name,
                            apiKey: account.apiKey,
                            baseUrl: account.baseUrl
                        };
                    }
                }
            }
            console.log('No available account found');
            return null;
        } catch (error) {
            console.warn('[SILENT] Unable to get account config:', error.message);
            return null;
        }
    }

    /**
     * 更新配置中的authorization
     */
    updateAuthorizationInConfig(authorization) {
        try {
            const accountInfo = this.getActiveAccountInfo();
            
            // 检查当前账号的authorization是否需要更新
            if (!accountInfo?.authorization || accountInfo.authorization !== authorization) {
                const settingsData = this.configManager.loadSettingsFromStore();
                if (settingsData) {
                    // 首先检查这个authorization是否已被其他Claude账号使用
                    const existingAccount = this.findClaudeAccountByAuthorization(settingsData, authorization);
                    
                    if (existingAccount) {
                        // 如果已存在该authorization的账号，切换到该账号
                        console.log(`[SILENT] [Claude Interceptor] Found existing account for authorization: ${existingAccount.emailAddress}`);
                        this.switchToExistingAccount(settingsData, existingAccount.emailAddress);
                        return;
                    }

                    // 如果当前有账号配置，更新其authorization
                    if (accountInfo?.emailAddress) {
                        console.log(`[SILENT] [Claude Interceptor] Updating authorization for account: ${accountInfo.emailAddress}`);
                        this.updateClaudeAccountAuthorization(settingsData, accountInfo.emailAddress, authorization);
                        this.configManager.saveSettingsToStore(settingsData);
                        console.log('[SILENT] [Claude Interceptor] Authorization saved to config file');
                    } else {
                        // 尝试从API请求中识别账号信息
                        this.identifyAccountFromAuthorization(authorization);
                    }
                }
            }
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] Failed to save authorization:', error.message);
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