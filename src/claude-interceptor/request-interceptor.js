const { PROVIDER_TYPE_CLAUDE_OFFICIAL, PROVIDER_TYPE_THIRD_PARTY } = require('./constants');

/**
 * 请求拦截器
 * 负责拦截和修改HTTP请求
 */
class RequestInterceptor {
    constructor(accountManager) {
        this.accountManager = accountManager;
        this.lastLoggedAuth = null;
        this.lastLoggedAccount = null;
        this.hasLoggedInterception = false;
    }

    /**
     * 获取Authorization头
     */
    getAuthorizationHeader() {
        const accountInfo = this.accountManager.getActiveAccountInfo();
        
        if (!accountInfo) {
            return null;
        }

        if (accountInfo.type === PROVIDER_TYPE_CLAUDE_OFFICIAL) {
            return accountInfo.authorization;
        } else if (accountInfo.type === PROVIDER_TYPE_THIRD_PARTY) {
            return `Bearer ${accountInfo.apiKey}`;
        }

        return null;
    }

    /**
     * 判断是否应该拦截请求
     */
    shouldInterceptRequest(url) {
        const accountInfo = this.accountManager.getActiveAccountInfo();
        
        if (!url || !accountInfo) {
            return false;
        }

        // 对于Claude官方账号，拦截Anthropic官方API请求
        if (accountInfo.type === PROVIDER_TYPE_CLAUDE_OFFICIAL) {
            return url.includes('api.anthropic.com');
        }

        // 对于第三方账号，拦截Anthropic官方API请求（需要重写）或已配置的第三方API请求
        if (accountInfo.type === PROVIDER_TYPE_THIRD_PARTY) {
            // 拦截Anthropic官方API请求（需要重写到第三方API）
            if (url.includes('api.anthropic.com')) {
                return true;
            }
            
            // 拦截已配置的第三方API请求
            if (accountInfo.baseUrl) {
                try {
                    const baseUrlObj = new URL(accountInfo.baseUrl);
                    const requestUrlObj = new URL(url);
                    return baseUrlObj.host === requestUrlObj.host;
                } catch (error) {
                    return url.includes(accountInfo.baseUrl);
                }
            }
        }

        return false;
    }

    /**
     * 拦截fetch请求
     */
    instrumentFetch() {
        if (!global.fetch) {
            return;
        }

        // 检查是否已经被拦截
        if (global.fetch.__claudeIntercepted) {
            return;
        }

        const originalFetch = global.fetch;
        const interceptor = this;

        global.fetch = async function (input, init = {}) {
            const originalUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

            // 检查是否需要拦截请求
            if (interceptor.shouldInterceptRequest(originalUrl)) {
                // 检测并保存原始authorization（仅对Claude官方账号）
                if (init.headers) {
                    const headers = new Headers(init.headers);
                    const authHeader = headers.get('authorization');
                    const accountInfo = interceptor.accountManager.getActiveAccountInfo();
                    
                    if (authHeader && accountInfo?.type === PROVIDER_TYPE_CLAUDE_OFFICIAL &&
                        (!accountInfo.authorization || accountInfo.authorization !== authHeader)) {
                        console.log('[SILENT] [Claude Interceptor] New authorization detected, preparing to save');
                        interceptor.accountManager.updateAuthorizationInConfig(authHeader);
                    }
                }

                // 对于第三方API，需要重写URL
                let finalInput = input;
                const accountInfo = interceptor.accountManager.getActiveAccountInfo();
                
                if (accountInfo?.type === PROVIDER_TYPE_THIRD_PARTY && 
                    accountInfo.baseUrl && originalUrl.includes('api.anthropic.com')) {
                    finalInput = interceptor.rewriteUrlForThirdParty(originalUrl, accountInfo.baseUrl);
                    
                    // 只在首次切换时记录
                    if (interceptor.lastLoggedAccount !== accountInfo?.name) {
                        console.log('[SILENT] [Claude Interceptor] 已切换到第三方API:', new URL(accountInfo.baseUrl).origin);
                        interceptor.lastLoggedAccount = accountInfo?.name;
                    }
                }

                // 动态修改authorization header
                const dynamicAuth = interceptor.getAuthorizationHeader();
                if (dynamicAuth) {
                    // 检查当前请求的authorization是否与目标authorization一致
                    let currentAuth = null;
                    if (init.headers instanceof Headers) {
                        currentAuth = init.headers.get('authorization');
                    } else if (typeof init.headers === 'object' && init.headers) {
                        currentAuth = init.headers.authorization;
                    }

                    // 如果当前token与目标token一致，无需修改
                    if (currentAuth !== dynamicAuth) {
                         if (!init.headers) {
                            init.headers = {};
                        }

                        if (init.headers instanceof Headers) {
                            init.headers.set('authorization', dynamicAuth);
                        } else if (typeof init.headers === 'object') {
                            init.headers.authorization = dynamicAuth;
                        }

                        // 只在authorization发生变化时记录
                        if (interceptor.lastLoggedAuth !== dynamicAuth) {
                            console.log('[SILENT] [Claude Interceptor] Dynamic authorization set:', '...' + dynamicAuth.slice(-20));
                            interceptor.lastLoggedAuth = dynamicAuth;
                        }
                    }
                }
                
                return originalFetch(finalInput, init);
            }

            return originalFetch(input, init);
        };

        global.fetch.__claudeIntercepted = true;
        console.log('[SILENT] [Claude Interceptor] Fetch intercepted');
    }

    /**
     * 拦截Node HTTP请求
     */
    instrumentNodeHTTP() {
        try {
            const http = require("http");
            const https = require("https");
            const interceptor = this;

            // 拦截http.request
            if (http.request && !http.request.__claudeIntercepted) {
                const originalHttpRequest = http.request;
                http.request = function (options, callback) {
                    return interceptor.interceptNodeRequest(originalHttpRequest, options, callback, false);
                };
                http.request.__claudeIntercepted = true;
            }

            // 拦截https.request
            if (https.request && !https.request.__claudeIntercepted) {
                const originalHttpsRequest = https.request;
                https.request = function (options, callback) {
                    return interceptor.interceptNodeRequest(originalHttpsRequest, options, callback, true);
                };
                https.request.__claudeIntercepted = true;
            }

            console.log('[SILENT] [Claude Interceptor] Node HTTP intercepted');
        } catch (error) {
            console.error('[TERMINAL] [Claude Interceptor] Failed to intercept Node HTTP:', error.message);
        }
    }

    /**
     * 拦截Node请求
     */
    interceptNodeRequest(originalRequest, options, callback, isHttps) {
        const originalUrl = this.parseNodeRequestURL(options, isHttps);

        // 检查是否需要拦截请求
        const shouldIntercept = this.shouldInterceptRequest(originalUrl);
        
        if (shouldIntercept) {
            // 只在首次拦截时记录
            if (!this.hasLoggedInterception) {
                console.log('[TERMINAL] [Claude Interceptor] 拦截到Node HTTP API请求:', originalUrl);
                this.hasLoggedInterception = true;
            }

            // 检测并保存原始authorization
            if (options.headers && options.headers.authorization) {
                const authHeader = options.headers.authorization;
                const accountInfo = this.accountManager.getActiveAccountInfo();
                
                if (accountInfo?.type === PROVIDER_TYPE_CLAUDE_OFFICIAL &&
                    (!accountInfo.authorization || accountInfo.authorization !== authHeader)) {
                    console.log('[SILENT] [Claude Interceptor] New authorization detected, preparing to save');
                    this.accountManager.updateAuthorizationInConfig(authHeader);
                }
            }

            // 对于第三方API，需要重写URL
            const accountInfo = this.accountManager.getActiveAccountInfo();
            if (accountInfo?.type === PROVIDER_TYPE_THIRD_PARTY && accountInfo.baseUrl) {
                const rewrittenOptions = this.rewriteRequestForThirdParty(options, originalUrl, isHttps);
                if (rewrittenOptions) {
                    options = rewrittenOptions;
                    // 只在首次切换时记录
                    if (this.lastLoggedAccount !== accountInfo?.name) {
                        console.log('[SILENT] [Claude Interceptor] Switched to third-party API');
                        this.lastLoggedAccount = accountInfo?.name;
                    }
                }
            }

            // 动态修改authorization header
            const dynamicAuth = this.getAuthorizationHeader();
            if (dynamicAuth) {
                const currentAuth = options.headers?.authorization;

                if (currentAuth !== dynamicAuth) {
                    if (!options.headers) {
                        options.headers = {};
                    }
                    options.headers.authorization = dynamicAuth;
                    
                    // 只在authorization发生变化时记录
                    if (this.lastLoggedAuth !== dynamicAuth) {
                        console.log('[SILENT] [Claude Interceptor] 已设置动态authorization:', '...' + dynamicAuth.slice(-20));
                        this.lastLoggedAuth = dynamicAuth;
                    }
                }
            }
        }

        return originalRequest.call(this, options, callback);
    }

    /**
     * 解析Node请求URL
     */
    parseNodeRequestURL(options, isHttps) {
        if (typeof options === "string") {
            return options;
        }

        const protocol = isHttps ? "https:" : "http:";
        const hostname = options.hostname || options.host || "localhost";
        const port = options.port ? `:${options.port}` : "";
        const path = options.path || "/";

        return `${protocol}//${hostname}${port}${path}`;
    }

    /**
     * 为第三方API重写URL
     */
    rewriteUrlForThirdParty(originalUrl, baseUrl) {
        try {
            const baseUrlObj = new URL(baseUrl);
            const originalUrlObj = new URL(originalUrl);
            
            let newPath = originalUrlObj.pathname;
            if (baseUrlObj.pathname && baseUrlObj.pathname !== '/') {
                newPath = baseUrlObj.pathname.replace(/\/$/, '') + newPath;
            }
            
            return baseUrlObj.origin + newPath + (originalUrlObj.search || '');
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] URL rewrite failed:', error.message);
            return originalUrl;
        }
    }

    /**
     * 为第三方API重写请求选项
     */
    rewriteRequestForThirdParty(options, originalUrl, isHttps) {
        try {
            const accountInfo = this.accountManager.getActiveAccountInfo();
            if (!accountInfo?.baseUrl) {
                return null;
            }

            // 只重写Anthropic官方API请求
            if (!originalUrl.includes('api.anthropic.com')) {
                return options;
            }

            const baseUrl = new URL(accountInfo.baseUrl);
            const originalUrlObj = new URL(originalUrl);

            // 创建新的请求选项
            const newOptions = { ...options };
            
            // 更新hostname和port
            newOptions.hostname = baseUrl.hostname;
            newOptions.host = baseUrl.host;
            
            if (baseUrl.port) {
                newOptions.port = baseUrl.port;
            } else {
                delete newOptions.port;
            }

            // 保持原始路径，但可能需要添加API路径前缀
            let newPath = originalUrlObj.pathname;
            if (baseUrl.pathname && baseUrl.pathname !== '/') {
                newPath = baseUrl.pathname.replace(/\/$/, '') + newPath;
            }
            
            newOptions.path = newPath + (originalUrlObj.search || '');

            console.log('[SILENT] [Claude Interceptor] 已切换到第三方API:', baseUrl.origin);

            return newOptions;
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] Failed to rewrite request:', error.message);
            return null;
        }
    }

    /**
     * 重置状态
     */
    resetLoggingState() {
        this.lastLoggedAuth = null;
        this.lastLoggedAccount = null;
        this.hasLoggedInterception = false;
    }
}

module.exports = RequestInterceptor;