/**
 * 代理管理器
 * 负责处理上游代理设置
 */
class ProxyManager {
    constructor(configManager) {
        this.configManager = configManager;
    }

    /**
     * 获取代理配置
     */
    getProxyConfig() {
        try {
            const settingsData = this.configManager.loadSettingsFromStore();
            if (settingsData) {
                const proxyConfig = settingsData.proxyConfig || { enabled: false };
                const shouldUseProxy = this.configManager.shouldUseProxyForCurrentProvider(settingsData);

                return {
                    enabled: proxyConfig.enabled && shouldUseProxy,
                    url: proxyConfig.url,
                    auth: proxyConfig.auth
                };
            }
            return { enabled: false };
        } catch (error) {
            console.warn('[SILENT] Unable to get proxy config:', error.message);
            return { enabled: false };
        }
    }

    /**
     * 设置上游代理
     */
    setupUpstreamProxy(proxyConfig) {
        if (!proxyConfig.enabled || !proxyConfig.url) {
            return;
        }

        try {
            // 设置代理环境变量
            let proxyUrl = proxyConfig.url;
            if (proxyConfig.auth && proxyConfig.auth.username && proxyConfig.auth.password) {
                const url = new URL(proxyConfig.url);
                url.username = proxyConfig.auth.username;
                url.password = proxyConfig.auth.password;
                proxyUrl = url.toString();
            }

            process.env.HTTP_PROXY = proxyUrl;
            process.env.HTTPS_PROXY = proxyUrl;
            process.env.http_proxy = proxyUrl;
            process.env.https_proxy = proxyUrl;

            console.log('[SILENT] [Claude Interceptor] Upstream proxy configured:', proxyUrl.replace(/\/\/.*@/, '//***@'));
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] Failed to setup upstream proxy:', error.message);
        }
    }
}

module.exports = ProxyManager;