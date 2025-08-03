const fs = require("fs");
const path = require("path");
const os = require("os");
const { PROVIDER_TYPE_CLAUDE_OFFICIAL, PROVIDER_TYPE_THIRD_PARTY } = require('./constants');

/**
 * 配置管理器
 * 负责从electron-store配置文件读取和保存设置
 */
class ConfigManager {
    constructor() {
        this.lastConfigHash = null;
        this.lastConfigCheck = 0;
    }

    /**
     * 获取配置文件路径
     */
    getSettingsPath() {
        try {
            let userDataPath;
            const platform = process.platform;

            if (platform === 'darwin') {
                userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'CC Copilot');
            } else if (platform === 'win32') {
                userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'CC Copilot');
            } else {
                userDataPath = path.join(os.homedir(), '.config', 'CC Copilot');
            }

            return path.join(userDataPath, 'settings.json');
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to get config path:', error.message);
            return null;
        }
    }

    /**
     * 从electron-store配置文件加载设置
     */
    loadSettingsFromStore() {
        try {
            let userDataPath;

            const platform = process.platform;
            if (platform === 'darwin') {
                userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'CC Copilot');
            } else if (platform === 'win32') {
                userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'CC Copilot');
            } else {
                userDataPath = path.join(os.homedir(), '.config', 'CC Copilot');
            }

            if (!userDataPath) {
                console.warn('[SILENT] [Claude Interceptor] Unable to determine user data directory');
                return null;
            }

            const settingsPath = path.join(userDataPath, 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const data = fs.readFileSync(settingsPath, 'utf-8');
                return JSON.parse(data);
            }

            return null;
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to load settings file:', error.message);
            return null;
        }
    }

    /**
     * 保存设置到electron-store配置文件
     */
    saveSettingsToStore(settingsData) {
        try {
            let userDataPath;
            const platform = process.platform;

            // 支持测试模式
            if (process.env.NODE_ENV === 'test' || process.env.CC_COPILOT_TEST_MODE) {
                if (platform === 'darwin') {
                    userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'cc-copilot-test');
                } else if (platform === 'win32') {
                    userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'cc-copilot-test');
                } else {
                    userDataPath = path.join(os.homedir(), '.config', 'cc-copilot-test');
                }
            } else {
                if (platform === 'darwin') {
                    userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'CC Copilot');
                } else if (platform === 'win32') {
                    userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'CC Copilot');
                } else {
                    userDataPath = path.join(os.homedir(), '.config', 'CC Copilot');
                }
            }

            if (!userDataPath) {
                console.warn('[SILENT] [Claude Interceptor] Unable to determine user data directory');
                return false;
            }

            // 确保目录存在
            if (!fs.existsSync(userDataPath)) {
                fs.mkdirSync(userDataPath, { recursive: true });
            }

            const settingsPath = path.join(userDataPath, 'settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(settingsData, null, 2));
            return true;
        } catch (error) {
            console.error('[SILENT] [Claude Interceptor] Failed to save settings file:', error.message);
            return false;
        }
    }

    /**
     * 从设置中获取当前活动账号
     */
    getCurrentActiveAccountFromSettings(settingsData) {
        try {
            const activeServiceProviderId = settingsData.activeServiceProviderId;
            const serviceProviders = settingsData.serviceProviders || [];

            const activeProvider = serviceProviders.find(p => p.id === activeServiceProviderId);
            if (!activeProvider || !activeProvider.activeAccountId) {
                return null;
            }

            const account = activeProvider.accounts.find(acc => {
                if (activeProvider.type === PROVIDER_TYPE_CLAUDE_OFFICIAL) {
                    return acc.emailAddress === activeProvider.activeAccountId;
                } else {
                    return acc.id === activeProvider.activeAccountId;
                }
            });

            if (!account) return null;

            return { provider: activeProvider, account };
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to get active account:', error.message);
            return null;
        }
    }

    /**
     * 判断当前服务提供方是否应该使用代理
     */
    shouldUseProxyForCurrentProvider(settingsData) {
        try {
            const activeResult = this.getCurrentActiveAccountFromSettings(settingsData);
            if (!activeResult) {
                return true; // 默认使用代理
            }
            return activeResult.provider.useProxy !== false; // 默认true
        } catch (error) {
            return true; // 默认使用代理
        }
    }

    /**
     * 简单哈希函数
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return hash;
    }

    /**
     * 设置配置文件监听器
     */
    setupConfigWatcher(onConfigChanged) {
        try {
            const settingsPath = this.getSettingsPath();
            if (!settingsPath || !fs.existsSync(settingsPath)) {
                console.warn('[SILENT] [Claude Interceptor] Config file does not exist, skipping monitor setup');
                return null;
            }

            // 监听配置文件变化
            const watcher = fs.watchFile(settingsPath, (curr, prev) => {
                if (curr.mtime > prev.mtime) {
                    console.log('[SILENT] [Claude Interceptor] Config file updated, reloading configuration');
                    onConfigChanged();
                }
            });

            console.log('[SILENT] [Claude Interceptor] Config file monitoring started:', settingsPath);
            return watcher;
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to setup config file monitoring:', error.message);
            return null;
        }
    }

    /**
     * 停止配置文件监听
     */
    stopConfigWatcher() {
        try {
            const settingsPath = this.getSettingsPath();
            if (settingsPath) {
                fs.unwatchFile(settingsPath);
                console.log('[SILENT] [Claude Interceptor] Config file monitoring stopped');
            }
        } catch (error) {
            console.warn('[SILENT] [Claude Interceptor] Failed to cleanup monitor:', error.message);
        }
    }
}

module.exports = ConfigManager;