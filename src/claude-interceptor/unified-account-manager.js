const UnifiedInterceptorConfig = require('./unified-config');

/**
 * 统一账号管理器 - 拦截器端
 * 使用统一配置系统，简化账号管理逻辑
 * 直接操作配置项，减少中间概念
 */
class UnifiedAccountManager {
    constructor() {
        this.config = new UnifiedInterceptorConfig();
    }

    /**
     * 获取当前活动账号信息
     */
    getActiveAccountInfo() {
        return this.config.getActiveAccountInfo();
    }

    /**
     * 处理拦截到的授权令牌
     * 这是拦截器的核心功能：将拦截到的token更新到配置中
     */
    processInterceptedAuthorization(authorization) {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔑 Processing intercepted authorization...`);
            
            // 使用统一配置处理
            const result = this.config.handleInterceptedAuthorization(authorization);
            
            if (result.updated) {
                console.log(`[DEBUG] [Claude Interceptor] ✅ Authorization processed successfully for: ${result.emailAddress}`);
                
                // 可以在这里添加额外的处理逻辑，比如验证token
                this.validateAndNotifyAuthorization(authorization, result.emailAddress);
            } else if (result.error) {
                console.error(`[DEBUG] [Claude Interceptor] ❌ Failed to process authorization: ${result.error}`);
            }
            
            return result;
        } catch (error) {
            console.error('[DEBUG] [Claude Interceptor] ❌ Error processing intercepted authorization:', error.message);
            return {
                updated: false,
                error: error.message
            };
        }
    }

    /**
     * 验证并通知授权令牌更新
     */
    async validateAndNotifyAuthorization(authorization, emailAddress) {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔍 Validating authorization for: ${emailAddress}`);
            
            const validationResult = await this.config.validateAuthorization(authorization);
            
            if (validationResult.valid) {
                console.log(`[DEBUG] [Claude Interceptor] ✅ Authorization validated successfully`);
                
                // 如果验证成功，可以获取更多用户信息
                if (validationResult.userInfo && validationResult.userInfo.email) {
                    const detectedEmail = validationResult.userInfo.email;
                    if (emailAddress === 'unknown' || emailAddress !== detectedEmail) {
                        console.log(`[DEBUG] [Claude Interceptor] 🔍 Detected email from token: ${detectedEmail}`);
                        
                        // 通知主进程更新正确的邮箱
                        this.config.notifyAuthorizationUpdate(detectedEmail, authorization);
                    }
                }
            } else {
                console.warn(`[DEBUG] [Claude Interceptor] ⚠️ Authorization validation failed: ${validationResult.reason}`);
                
                if (validationResult.reason === 'invalid_or_expired') {
                    // 通知主进程token已过期
                    this.notifyTokenExpired(emailAddress, authorization);
                }
            }
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to validate authorization:', error.message);
        }
    }

    /**
     * 通知token过期
     */
    notifyTokenExpired(emailAddress, expiredAuthorization) {
        try {
            console.log(`[DEBUG] [Claude Interceptor] ⚠️ Notifying token expiration for: ${emailAddress}`);
            
            const expiredData = {
                type: 'TOKEN_EXPIRED',
                emailAddress: emailAddress,
                expiredAuthorization: expiredAuthorization,
                timestamp: Date.now()
            };
            
            // 输出到stdout，主进程可以监听
            console.log(`[IPC_MESSAGE] ${JSON.stringify(expiredData)}`);
            
            console.log(`[DEBUG] [Claude Interceptor] ✅ Token expiration notification sent`);
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to notify token expiration:', error.message);
        }
    }

    /**
     * 检查是否需要获取token
     * 在启动时或手动检测时调用
     */
    checkAndRefreshToken() {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔄 Checking token status...`);
            
            const accountInfo = this.getActiveAccountInfo();
            
            if (!accountInfo) {
                console.log(`[DEBUG] [Claude Interceptor] 📂 No active account found, trying to load from Claude CLI...`);
                
                // 尝试从Claude CLI获取账号信息
                const cliAccount = this.config.getClaudeAccountFromCLI();
                if (cliAccount) {
                    console.log(`[DEBUG] [Claude Interceptor] ✅ Found Claude CLI account: ${cliAccount.emailAddress}`);
                    
                    // 通知主进程发现了新账号
                    this.notifyAccountDiscovered(cliAccount);
                    
                    if (cliAccount.authorization) {
                        // 如果有authorization，也一并更新
                        this.config.notifyAuthorizationUpdate(cliAccount.emailAddress, cliAccount.authorization);
                    }
                } else {
                    console.log(`[DEBUG] [Claude Interceptor] ⚠️ No Claude CLI account found`);
                }
                
                return false;
            }

            if (!accountInfo.authorization) {
                console.log(`[DEBUG] [Claude Interceptor] 🔑 Active account ${accountInfo.emailAddress} has no authorization token`);
                console.log(`[DEBUG] [Claude Interceptor] 📝 Will wait for API request to capture token`);
                return false;
            }

            console.log(`[DEBUG] [Claude Interceptor] ✅ Active account ${accountInfo.emailAddress} has valid token`);
            return true;
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to check token status:', error.message);
            return false;
        }
    }

    /**
     * 通知主进程发现了新账号
     */
    notifyAccountDiscovered(account) {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 📝 Notifying account discovery: ${account.emailAddress}`);
            
            const discoveryData = {
                type: 'ACCOUNT_DISCOVERED',
                account: account,
                timestamp: Date.now()
            };
            
            // 输出到stdout，主进程可以监听
            console.log(`[IPC_MESSAGE] ${JSON.stringify(discoveryData)}`);
            
            console.log(`[DEBUG] [Claude Interceptor] ✅ Account discovery notification sent`);
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to notify account discovery:', error.message);
        }
    }

    /**
     * 获取代理配置信息
     */
    getProxyInfo() {
        try {
            const proxyConfig = this.config.getProxyConfig();
            const shouldUseProxy = this.config.shouldUseProxy();
            
            return {
                enabled: shouldUseProxy,
                config: proxyConfig
            };
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to get proxy info:', error.message);
            return {
                enabled: true, // 默认启用代理
                config: {
                    enabled: false,
                    url: 'http://127.0.0.1:1087'
                }
            };
        }
    }

    /**
     * 初始化账号管理器
     * 在拦截器启动时调用
     */
    async initialize() {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🚀 Initializing account manager...`);
            
            // 检查token状态
            const hasValidToken = this.checkAndRefreshToken();
            
            // 获取代理信息
            const proxyInfo = this.getProxyInfo();
            console.log(`[DEBUG] [Claude Interceptor] 🌐 Proxy enabled: ${proxyInfo.enabled}`);
            
            console.log(`[DEBUG] [Claude Interceptor] ✅ Account manager initialized successfully`);
            
            return {
                hasValidToken: hasValidToken,
                proxyEnabled: proxyInfo.enabled
            };
        } catch (error) {
            console.error('[DEBUG] [Claude Interceptor] ❌ Failed to initialize account manager:', error.message);
            return {
                hasValidToken: false,
                proxyEnabled: true,
                error: error.message
            };
        }
    }
}

module.exports = UnifiedAccountManager;