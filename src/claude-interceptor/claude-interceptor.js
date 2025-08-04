const { CONFIG_CHECK_INTERVAL } = require('./constants');
const UnifiedConfigManager = require('./unified-config');
const UnifiedAccountManager = require('./unified-account-manager');
const ProxyManager = require('./proxy-manager');
const RequestInterceptor = require('./request-interceptor');

/**
 * Claude CLI请求拦截器主类
 * 整合各个模块，提供统一的拦截功能
 */
class ClaudeInterceptor {
    constructor() {
        this.configManager = new UnifiedConfigManager();
        this.accountManager = new UnifiedAccountManager();
        this.proxyManager = new ProxyManager(this.configManager);
        this.requestInterceptor = new RequestInterceptor(this.accountManager);

        // 初始化状态
        this.accountInfo = null;
        this.proxyConfig = null;
        this.settingsWatcher = null;
        this.lastConfigHash = null;
        this.lastConfigCheck = 0;

        // 绑定方法
        this.onConfigChanged = this.onConfigChanged.bind(this);

        // 加载配置
        this.refreshConfig();

        // 设置配置文件监听
        this.setupConfigWatcher();
    }

    /**
     * 智能配置检查：只在必要时检查配置变化
     */
    smartConfigCheck() {
        const now = Date.now();

        // 只在以下情况检查配置：
        // 1. 超过检查间隔时间
        // 2. 没有监听器且配置可能已变化
        if (now - this.lastConfigCheck > CONFIG_CHECK_INTERVAL ||
            (!this.settingsWatcher && !this.accountInfo)) {
            this.lastConfigCheck = now;
            this.checkAndRefreshConfig();

            // 如果监听器不存在，尝试重新设置
            if (!this.settingsWatcher) {
                this.setupConfigWatcher();
            }
        }
    }

    /**
     * 获取Authorization头
     */
    getAuthorizationHeader() {
        // 智能配置检查
        this.smartConfigCheck();
        return this.requestInterceptor.getAuthorizationHeader();
    }

    /**
     * 初始化拦截器
     */
    initialize() {
        console.log('[TERMINAL] [Claude Interceptor] Initializing interceptor...');

        if (this.accountInfo) {
            console.log('[TERMINAL] [Claude Interceptor] Current account:',
                this.accountInfo.type === 'claude_official'
                    ? this.accountInfo.emailAddress
                    : this.accountInfo.name
            );
        } else {
            console.warn('[TERMINAL] [Claude Interceptor] Warning: No account configuration found');
        }

        this.requestInterceptor.instrumentFetch();
        this.requestInterceptor.instrumentNodeHTTP();

        console.log('[TERMINAL] [Claude Interceptor] Interceptor initialization completed');
        console.log('[SILENT] [Claude Interceptor] Config file monitoring enabled with hot reload support');
    }

    /**
     * 刷新配置
     */
    refreshConfig() {
        try {
            // 重新读取配置
            this.accountInfo = this.accountManager.getActiveAccountInfo();
            this.proxyConfig = this.proxyManager.getProxyConfig();

            // 更新上游代理设置
            this.proxyManager.setupUpstreamProxy(this.proxyConfig);

            // 计算配置哈希值用于变更检测
            const configData = JSON.stringify({
                account: this.accountInfo,
                proxy: this.proxyConfig
            });
            this.lastConfigHash = this.simpleHash(configData);

            console.log('[TERMINAL] [Claude Interceptor] Configuration refreshed');
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] Failed to refresh config:', error.message);
        }
    }

    /**
     * 检查并刷新配置（轻量级检查）
     */
    checkAndRefreshConfig() {
        try {
            // 读取当前配置并计算哈希
            const currentAccountInfo = this.accountManager.getActiveAccountInfo();
            const currentProxyConfig = this.proxyManager.getProxyConfig();
            const configData = JSON.stringify({
                account: currentAccountInfo,
                proxy: currentProxyConfig
            });
            const currentHash = this.simpleHash(configData);

            // 如果配置发生变化，则更新
            if (currentHash !== this.lastConfigHash) {
                console.log('[TERMINAL] [Claude Interceptor] Config change detected, updating...');
                this.refreshConfig();
                return true;
            }
            return false;
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to check config changes:', error.message);
            return false;
        }
    }

    /**
     * 设置配置文件监听器  
     */
    setupConfigWatcher() {
        try {
            // 由于新的架构使用VSCode配置变更通知，这里暂时不需要文件监听
            // 可以通过定期检查来替代
            console.log('[SILENT] [Claude Interceptor] Config watching setup (using periodic checks)');
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to setup config file monitoring:', error.message);
        }
    }

    /**
     * 配置变更回调
     */
    onConfigChanged() {
        try {
            const oldAccountInfo = this.accountInfo;
            this.refreshConfig();

            // 重置请求拦截器状态
            this.requestInterceptor.resetLoggingState();

            // 通知配置变更
            if (oldAccountInfo?.emailAddress !== this.accountInfo?.emailAddress ||
                oldAccountInfo?.type !== this.accountInfo?.type) {
                console.log('[TERMINAL] [Claude Interceptor] Account configuration changed:',
                    this.accountInfo
                        ? `${this.accountInfo.type} - ${this.accountInfo.emailAddress || this.accountInfo.name}`
                        : 'None'
                );
            }
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] Failed to handle config change:', error.message);
        }
    }

    /**
     * 清理资源
     */
    cleanup() {
        try {
            if (this.settingsWatcher) {
                this.settingsWatcher = null;
                console.log('[SILENT] [Claude Interceptor] Config file monitoring stopped');
            }
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to cleanup monitor:', error.message);
        }
    }

    /**
     * 简单哈希函数
     */
    simpleHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return hash;
    }
}

module.exports = ClaudeInterceptor;