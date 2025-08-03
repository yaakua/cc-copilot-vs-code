const fs = require("fs");
const path = require("path");
const os = require("os");
const { PROVIDER_TYPE_CLAUDE_OFFICIAL, PROVIDER_TYPE_THIRD_PARTY } = require('./constants');

/**
 * 配置管理器
 * 通过临时文件与VSCode主进程通信，使用VSCode配置系统存储
 */
class ConfigManager {
    constructor() {
        this.lastConfigHash = null;
        this.lastConfigCheck = 0;
        this.configurationSection = 'ccCopilot';
        this.tempDir = path.join(os.tmpdir(), 'cc-copilot-ipc');
        this.ensureTempDir();
    }

    /**
     * 确保临时目录存在
     */
    ensureTempDir() {
        try {
            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ⚠️ Failed to create temp dir:', error.message);
        }
    }

    /**
     * 从VSCode获取设置（通过临时文件通信）
     */
    loadSettingsFromStore() {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 📞 Requesting settings from VSCode...`);
            
            // 创建设置请求文件
            const requestFile = path.join(this.tempDir, `settings_request_${Date.now()}.json`);
            const requestData = {
                type: 'GET_SETTINGS',
                timestamp: Date.now(),
                configSection: this.configurationSection
            };
            
            fs.writeFileSync(requestFile, JSON.stringify(requestData));
            console.log(`[DEBUG] [Claude Interceptor] 📝 Settings request created: ${requestFile}`);
            
            // 等待响应文件（最多等待3秒）
            const responseFile = requestFile.replace('_request_', '_response_');
            let attempts = 0;
            const maxAttempts = 30; // 3秒，每100ms检查一次
            
            while (attempts < maxAttempts) {
                if (fs.existsSync(responseFile)) {
                    try {
                        const responseData = fs.readFileSync(responseFile, 'utf-8');
                        const settings = JSON.parse(responseData);
                        
                        // 清理文件
                        fs.unlinkSync(requestFile);
                        fs.unlinkSync(responseFile);
                        
                        console.log(`[DEBUG] [Claude Interceptor] ✅ Settings received from VSCode`);
                        return settings;
                    } catch (error) {
                        console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to parse response:', error.message);
                        break;
                    }
                }
                
                // 等待100ms
                require('child_process').execSync('sleep 0.1', { stdio: 'ignore' });
                attempts++;
            }
            
            // 清理请求文件
            if (fs.existsSync(requestFile)) {
                fs.unlinkSync(requestFile);
            }
            
            console.log(`[DEBUG] [Claude Interceptor] ⚠️ No response from VSCode after ${maxAttempts * 100}ms`);
            return null;
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to load settings:', error.message);
            return null;
        }
    }

    /**
     * 保存设置到VSCode（通过临时文件通信）
     */
    saveSettingsToStore(settingsData) {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 💾 Saving settings to VSCode...`);
            
            // 创建设置更新文件
            const updateFile = path.join(this.tempDir, `settings_update_${Date.now()}.json`);
            const updateData = {
                type: 'UPDATE_SETTINGS',
                timestamp: Date.now(),
                configSection: this.configurationSection,
                settings: settingsData
            };
            
            fs.writeFileSync(updateFile, JSON.stringify(updateData));
            console.log(`[DEBUG] [Claude Interceptor] 📝 Settings update created: ${updateFile}`);
            
            return true;
        } catch (error) {
            console.error('[DEBUG] [Claude Interceptor] ❌ Failed to save settings:', error.message);
            return false;
        }
    }

    /**
     * 从设置中获取当前活动账号
     */
    getCurrentActiveAccountFromSettings(settingsData) {
        try {
            console.log(`[DEBUG] [Claude Interceptor] 🔍 Getting active account from settings...`);
            
            // 直接从VSCode设置格式读取数据
            const activeServiceProviderId = settingsData.activeServiceProviderId;
            const serviceProviders = settingsData.serviceProviders || [];

            console.log(`[DEBUG] [Claude Interceptor] 📋 Active provider ID: ${activeServiceProviderId}`);
            console.log(`[DEBUG] [Claude Interceptor] 📦 Total providers: ${serviceProviders.length}`);

            const activeProvider = serviceProviders.find(p => p.id === activeServiceProviderId);
            if (!activeProvider || !activeProvider.activeAccountId) {
                console.log(`[DEBUG] [Claude Interceptor] ⚠️ No active provider or account ID found`);
                return null;
            }

            console.log(`[DEBUG] [Claude Interceptor] 🎯 Found active provider: ${activeProvider.type}, active account: ${activeProvider.activeAccountId}`);

            const account = activeProvider.accounts.find(acc => {
                if (activeProvider.type === PROVIDER_TYPE_CLAUDE_OFFICIAL) {
                    return acc.emailAddress === activeProvider.activeAccountId;
                } else {
                    return acc.id === activeProvider.activeAccountId;
                }
            });

            if (!account) {
                console.log(`[DEBUG] [Claude Interceptor] ⚠️ Active account not found in provider accounts`);
                return null;
            }

            console.log(`[DEBUG] [Claude Interceptor] ✅ Found active account: ${account.emailAddress || account.name}`);
            console.log(`[DEBUG] [Claude Interceptor] 🔑 Account has token: ${!!account.authorization}`);

            return { provider: activeProvider, account };
        } catch (error) {
            console.warn('[DEBUG] [Claude Interceptor] ❌ Failed to get active account:', error.message);
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