const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * 统一配置接口 - 拦截器端
 * 直接读取Claude CLI配置和VSCode配置，移除临时文件IPC机制
 * 通过进程间通信或直接读取配置文件方式获取设置
 */
class UnifiedInterceptorConfig {
    constructor() {
        this.configurationSection = 'ccCopilot';
        this.PROVIDER_TYPES = {
            CLAUDE_OFFICIAL: 'claude_official',
            THIRD_PARTY: 'third_party'
        };
        this.CLAUDE_PROVIDER_ID = 'claude_official';
    }

    // =============================================================================
    // Claude CLI账号发现
    // =============================================================================

    /**
     * 从Claude CLI配置文件读取账号信息
     */
    getClaudeAccountFromCLI() {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔍 Reading Claude CLI config...`);
            
            const claudeConfigPath = path.join(os.homedir(), '.claude.json');
            
            if (!fs.existsSync(claudeConfigPath)) {
                console.log(`[DEBUG] [Claude Interceptor] ⚠️ Claude CLI config file not found: ${claudeConfigPath}`);
                return null;
            }

            const configData = fs.readFileSync(claudeConfigPath, 'utf-8');
            const config = JSON.parse(configData);

            if (config.oauthAccount) {
                const account = {
                    accountUuid: config.oauthAccount.accountUuid || '',
                    emailAddress: config.oauthAccount.emailAddress || '',
                    organizationUuid: config.oauthAccount.organizationUuid || '',
                    organizationRole: config.oauthAccount.organizationRole || 'member',
                    workspaceRole: config.oauthAccount.workspaceRole || null,
                    organizationName: config.oauthAccount.organizationName || 'Unknown',
                    authorization: config.oauthAccount.authorization
                };
                
                console.log(`[DEBUG] [Claude Interceptor] ✅ Found Claude account: ${account.emailAddress}`);
                console.log(`[DEBUG] [Claude Interceptor] 🔑 Has authorization: ${!!account.authorization}`);
                
                return account;
            }

            console.log(`[DEBUG] [Claude Interceptor] ⚠️ No oauthAccount found in Claude CLI config`);
            return null;
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to read Claude CLI config:', error.message);
            return null;
        }
    }

    // =============================================================================
    // VSCode配置操作（通过进程间通信或环境变量）
    // =============================================================================

    /**
     * 获取VSCode配置信息
     * 优先从环境变量获取，备用从VSCode settings.json文件读取
     */
    getVSCodeConfig() {
        try {
            // 方案1: 通过环境变量传递配置（启动时设置）
            const configEnv = process.env.CC_COPILOT_CONFIG;
            if (configEnv) {
                const config = JSON.parse(configEnv);
                console.log(`[DEBUG] [Claude Interceptor] 📁 Got VSCode config from environment`);
                return {
                    proxyConfig: config.proxyConfig || { enabled: false, url: 'http://127.0.0.1:1087' },
                    serviceProviders: config.serviceProviders || [],
                    activeServiceProviderId: config.activeServiceProviderId || ''
                };
            }

            // 方案2: 读取VSCode settings.json文件（如果可访问）
            const settingsPath = this.getVSCodeSettingsPath();
            if (settingsPath && fs.existsSync(settingsPath)) {
                const settingsData = fs.readFileSync(settingsPath, 'utf-8');
                const settings = JSON.parse(settingsData);
                const ccCopilotConfig = settings[this.configurationSection];
                
                if (ccCopilotConfig) {
                    console.log(`[DEBUG] [Claude Interceptor] 📁 Got VSCode config from settings file`);
                    return {
                        proxyConfig: ccCopilotConfig.proxyConfig || { enabled: false, url: 'http://127.0.0.1:1087' },
                        serviceProviders: ccCopilotConfig.serviceProviders || [],
                        activeServiceProviderId: ccCopilotConfig.activeServiceProviderId || ''
                    };
                }
            }

            console.log(`[DEBUG] [Claude Interceptor] ⚠️ No VSCode config available, using defaults`);
            return {
                proxyConfig: { enabled: false, url: 'http://127.0.0.1:1087' },
                serviceProviders: [],
                activeServiceProviderId: ''
            };
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to get VSCode config:', error.message);
            return {
                proxyConfig: { enabled: false, url: 'http://127.0.0.1:1087' },
                serviceProviders: [],
                activeServiceProviderId: ''
            };
        }
    }

    /**
     * 获取VSCode settings.json路径
     */
    getVSCodeSettingsPath() {
        try {
            const platform = os.platform();
            let settingsPath;

            if (platform === 'win32') {
                settingsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'settings.json');
            } else if (platform === 'darwin') {
                settingsPath = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
            } else {
                settingsPath = path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
            }

            return settingsPath;
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to get VSCode settings path:', error.message);
            return null;
        }
    }

    // =============================================================================
    // 账号管理
    // =============================================================================

    /**
     * 获取当前活动账号信息
     * 优先从VSCode配置获取，备用从Claude CLI获取
     */
    getActiveAccountInfo() {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔍 Getting active account info...`);
            
            // 先尝试从VSCode配置获取
            const vscodeConfig = this.getVSCodeConfig();
            if (vscodeConfig && vscodeConfig.serviceProviders) {
                const activeProviderId = vscodeConfig.activeServiceProviderId;
                const activeProvider = vscodeConfig.serviceProviders.find(p => p.id === activeProviderId);
                
                if (activeProvider && activeProvider.type === this.PROVIDER_TYPES.CLAUDE_OFFICIAL) {
                    const activeAccount = activeProvider.accounts.find(acc => 
                        acc.emailAddress === activeProvider.activeAccountId
                    );
                    
                    if (activeAccount) {
                        console.log(`[DEBUG] [Claude Interceptor] ✅ Found active account from VSCode: ${activeAccount.emailAddress}`);
                        console.log(`[DEBUG] [Claude Interceptor] 🔑 Has authorization: ${!!activeAccount.authorization}`);
                        
                        return {
                            type: this.PROVIDER_TYPES.CLAUDE_OFFICIAL,
                            emailAddress: activeAccount.emailAddress,
                            authorization: activeAccount.authorization,
                            organizationName: activeAccount.organizationName,
                            useProxy: activeProvider.useProxy !== false
                        };
                    }
                }
            }

            // 备用方案：从Claude CLI获取
            const cliAccount = this.getClaudeAccountFromCLI();
            if (cliAccount) {
                console.log(`[DEBUG] [Claude Interceptor] 📂 Using Claude CLI account as fallback: ${cliAccount.emailAddress}`);
                
                return {
                    type: this.PROVIDER_TYPES.CLAUDE_OFFICIAL,
                    emailAddress: cliAccount.emailAddress,
                    authorization: cliAccount.authorization,
                    organizationName: cliAccount.organizationName,
                    useProxy: true // 默认使用代理
                };
            }

            console.log('[DEBUG] [Claude Interceptor] ⚠️ No available account found');
            return null;
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Unable to get account config:', error.message);
            return null;
        }
    }

    /**
     * 通知主进程更新授权令牌
     * 通过环境变量或其他IPC机制通知主进程
     */
    notifyAuthorizationUpdate(emailAddress, authorization) {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔔 Notifying authorization update for: ${emailAddress}`);
            
            // 方案1: 通过标准输出通知主进程（需要主进程监听）
            const updateData = {
                type: 'AUTHORIZATION_UPDATE',
                emailAddress: emailAddress,
                authorization: authorization,
                timestamp: Date.now()
            };
            
            // 输出到stdout，主进程可以监听
            console.log(`[IPC_MESSAGE] ${JSON.stringify(updateData)}`);
            
            // 方案2: 写入临时文件（简化版，只在必要时使用）
            const tempDir = path.join(os.homedir(), '.cc-copilot-auth-updates');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const updateFile = path.join(tempDir, `auth_update_${Date.now()}.json`);
            fs.writeFileSync(updateFile, JSON.stringify(updateData));
            
            console.log(`[DEBUG] [Claude Interceptor] ✅ Authorization update notification sent`);
            return true;
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to notify authorization update:', error.message);
            return false;
        }
    }

    /**
     * 处理拦截到的授权令牌
     */
    handleInterceptedAuthorization(authorization) {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔑 Processing intercepted authorization...`);
            console.log(`[DEBUG] [Claude Interceptor] 🔑 Authorization preview: ${authorization.substring(0, 30)}...`);
            
            const accountInfo = this.getActiveAccountInfo();
            
            if (accountInfo && accountInfo.emailAddress) {
                // 检查是否需要更新
                if (!accountInfo.authorization || accountInfo.authorization !== authorization) {
                    console.log(`[DEBUG] [Claude Interceptor] 🔄 Authorization needs update for: ${accountInfo.emailAddress}`);
                    
                    // 通知主进程更新
                    this.notifyAuthorizationUpdate(accountInfo.emailAddress, authorization);
                    
                    return {
                        updated: true,
                        emailAddress: accountInfo.emailAddress,
                        authorization: authorization
                    };
                } else {
                    console.log(`[DEBUG] [Claude Interceptor] ✅ Authorization already up to date`);
                    return {
                        updated: false,
                        emailAddress: accountInfo.emailAddress,
                        authorization: authorization
                    };
                }
            } else {
                console.log(`[DEBUG] [Claude Interceptor] 🔍 No account context, storing authorization for later identification`);
                
                // 如果没有账号上下文，仍然通知主进程，让其尝试识别账号
                this.notifyAuthorizationUpdate('unknown', authorization);
                
                return {
                    updated: true,
                    emailAddress: 'unknown',
                    authorization: authorization
                };
            }
        } catch (error) {
            console.error('[DEBUG] [Claude Interceptor] ❌ Failed to handle intercepted authorization:', error.message);
            return {
                updated: false,
                error: error.message
            };
        }
    }

    /**
     * 验证授权令牌是否有效
     */
    async validateAuthorization(authorization) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/account', {
                method: 'GET',
                headers: {
                    'authorization': authorization,
                    'content-type': 'application/json'
                }
            });

            if (response.ok) {
                const userInfo = await response.json();
                console.log(`[DEBUG] [Claude Interceptor] ✅ Authorization valid for: ${userInfo.email}`);
                return {
                    valid: true,
                    userInfo: userInfo
                };
            } else if (response.status === 401) {
                console.warn('[DEBUG] [Claude Interceptor] ❌ Authorization token invalid or expired');
                return {
                    valid: false,
                    reason: 'invalid_or_expired'
                };
            } else {
                console.warn(`[DEBUG] [Claude Interceptor] ⚠️ Unexpected response status: ${response.status}`);
                return {
                    valid: false,
                    reason: 'unexpected_response'
                };
            }
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to validate authorization:', error.message);
            return {
                valid: false,
                reason: 'network_error',
                error: error.message
            };
        }
    }

    // =============================================================================
    // 代理配置
    // =============================================================================

    /**
     * 获取代理配置
     */
    getProxyConfig() {
        try {
            const vscodeConfig = this.getVSCodeConfig();
            if (vscodeConfig && vscodeConfig.proxyConfig) {
                return vscodeConfig.proxyConfig;
            }

            // 默认代理配置
            return {
                enabled: false,
                url: 'http://127.0.0.1:1087'
            };
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to get proxy config:', error.message);
            return {
                enabled: false,
                url: 'http://127.0.0.1:1087'
            };
        }
    }

    /**
     * 判断当前是否应该使用代理
     */
    shouldUseProxy() {
        try {
            const accountInfo = this.getActiveAccountInfo();
            if (accountInfo && accountInfo.useProxy !== undefined) {
                return accountInfo.useProxy;
            }

            const proxyConfig = this.getProxyConfig();
            return proxyConfig.enabled;
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to determine proxy usage:', error.message);
            return true; // 默认使用代理
        }
    }
}

module.exports = UnifiedInterceptorConfig;