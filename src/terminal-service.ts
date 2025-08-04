import * as vscode from 'vscode';
import * as path from 'path';
import { claudePathManager } from './claude-path-manager';
import { UnifiedConfigManager } from './shared/config-manager';
import { SessionManager } from './session-manager';
import { logger } from './logger';

/**
 * 终端服务类
 * 负责管理Claude CLI终端会话的创建、恢复和配置
 * 提供与Claude CLI交互的统一接口
 */
export class TerminalService {
    /**
     * 构造函数
     * @param context - VSCode扩展上下文
     * @param configManager - 统一配置管理器实例
     * @param sessionManager - 会话管理器实例
     */
    constructor(
        private context: vscode.ExtensionContext,
        private configManager: UnifiedConfigManager,
        private sessionManager?: SessionManager
    ) {
        // 拦截器通信现在通过UnifiedConfigManager处理
        console.log('TerminalService initialized with UnifiedConfigManager');
    }


    /**
     * 创建新的Claude会话终端
     * 启动一个新的Claude CLI会话，自动跳过权限检查
     */
    public async createNewClaudeSession(): Promise<void> {
        try {
            logger.info('Creating new Claude session...', 'TerminalService');

            // 检测Claude CLI路径
            const claudePath = await claudePathManager.getClaudePath();
            if (!claudePath) {
                const message = 'Claude CLI not found. Please install Claude CLI first.';
                logger.error(message, 'TerminalService');
                vscode.window.showErrorMessage(message);
                return;
            }

            logger.info(`Using Claude CLI at: ${claudePath}`, 'TerminalService');

            // 获取工作目录，优先使用当前工作区
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const cwd = workspaceFolder?.uri.fsPath || process.cwd();

            // 构建Claude命令参数
            const args = [''];
            // 为简化操作，始终跳过权限检查
            args.push('--dangerously-skip-permissions');

            // 生成会话名称（基于当前时间）
            const now = new Date();
            const sessionName = `Claude ${now.getMonth() + 1}-${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
            
            // 创建终端实例
            const terminal = vscode.window.createTerminal({
                name: sessionName,
                cwd: cwd,
                env: this.getClaudeEnvironment()
            });

            // 显示终端窗口
            terminal.show();

            // 执行Claude命令
            const command = `"${claudePath}" ${args.join(' ')}`;
            logger.info(`Executing command: ${command}`, 'TerminalService');
            terminal.sendText(command);

            logger.info('New Claude session created successfully', 'TerminalService');

        } catch (error) {
            const message = `Failed to create Claude session: ${(error as Error).message}`;
            logger.error(message, 'TerminalService', error as Error);
            vscode.window.showErrorMessage(message);
        }
    }

    /**
     * 恢复现有Claude会话
     * 根据会话文件路径恢复之前保存的Claude会话
     * @param sessionFilePath - 会话文件的完整路径
     */
    public async resumeClaudeSession(sessionFilePath: string): Promise<void> {
        try {
            logger.info(`Resuming Claude session from: ${sessionFilePath}`, 'TerminalService');

            // 检测Claude CLI路径
            const claudePath = await claudePathManager.getClaudePath();
            if (!claudePath) {
                const message = 'Claude CLI not found. Please install Claude CLI first.';
                logger.error(message, 'TerminalService');
                vscode.window.showErrorMessage(message);
                return;
            }

            // 从会话文件路径推断工作目录
            const cwd = this.inferWorkingDirectoryFromSession(sessionFilePath);

            // 从文件路径提取会话ID（去除.jsonl扩展名）
            const sessionId = path.basename(sessionFilePath, '.jsonl');

            // 尝试从会话管理器获取会话名称
            let sessionDisplayName = sessionId;
            if (this.sessionManager) {
                const session = this.sessionManager.getSessionById(sessionId);
                if (session) {
                    sessionDisplayName = session.name;
                }
            }

            // 构建Claude恢复命令参数
            const args = ['--resume', sessionId];
            // 为简化操作，始终跳过权限检查
            args.push('--dangerously-skip-permissions');

            // 创建终端实例，使用会话名称作为标题
            const terminal = vscode.window.createTerminal({
                name: `Claude: ${sessionDisplayName}`,
                cwd: cwd,
                env: this.getClaudeEnvironment()
            });

            // 显示终端窗口
            terminal.show();

            // 执行Claude resume命令
            const command = `"${claudePath}" ${args.join(' ')}`;
            logger.info(`Executing command: ${command}`, 'TerminalService');
            terminal.sendText(command);

            logger.info('Claude session resumed successfully', 'TerminalService');

        } catch (error) {
            const message = `Failed to resume Claude session: ${(error as Error).message}`;
            logger.error(message, 'TerminalService', error as Error);
            vscode.window.showErrorMessage(message);
        }
    }

    /**
     * 创建带有拦截器的Claude会话
     * 使用Node.js的require机制加载拦截器脚本，用于监控和修改Claude CLI的行为
     */
    public async createClaudeSessionWithInterceptor(): Promise<void> {
        try {
            logger.info('Creating Claude session with interceptor...', 'TerminalService');

            // 检测Claude CLI路径
            const claudePath = await claudePathManager.getClaudePath();
            if (!claudePath) {
                const message = 'Claude CLI not found. Please install Claude CLI first.';
                logger.error(message, 'TerminalService');
                vscode.window.showErrorMessage(message);
                return;
            }

            // 获取工作目录
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const cwd = workspaceFolder?.uri.fsPath || process.cwd();

            // 获取拦截器脚本路径
            const interceptorPath = path.join(this.context.extensionPath, 'src', 'claude-interceptor.js');

            // 构建Claude命令参数
            const args = [''];
            // 为简化操作，始终跳过权限检查
            args.push('--dangerously-skip-permissions');

            // 创建终端实例，标明使用了拦截器
            const terminal = vscode.window.createTerminal({
                name: 'Claude Session (Intercepted)',
                cwd: cwd,
                env: this.getClaudeEnvironment()
            });

            // 显示终端窗口
            terminal.show();

            // 使用node --require来预加载拦截器脚本
            const command = `node --require "${interceptorPath}" "${claudePath}" ${args.join(' ')}`;
            logger.info(`Executing command with interceptor: ${command}`, 'TerminalService');
            terminal.sendText(command);

            logger.info('Claude session with interceptor created successfully', 'TerminalService');

        } catch (error) {
            const message = `Failed to create Claude session with interceptor: ${(error as Error).message}`;
            logger.error(message, 'TerminalService', error as Error);
            vscode.window.showErrorMessage(message);
        }
    }

    /**
     * 获取Claude运行环境变量
     * 配置Claude CLI运行时需要的环境变量，包括代理设置
     * @returns 配置好的环境变量对象
     */
    private getClaudeEnvironment(): NodeJS.ProcessEnv {
        const env = { ...process.env };

        // 如果启用了代理，设置代理环境变量
        const proxyConfig = this.configManager.getProxyConfig();
        if (proxyConfig.enabled && proxyConfig.url) {
            let proxyUrl = proxyConfig.url;

            // 如果有认证信息，添加到URL中
            if (proxyConfig.auth?.username && proxyConfig.auth?.password) {
                try {
                    const url = new URL(proxyConfig.url);
                    url.username = proxyConfig.auth.username;
                    url.password = proxyConfig.auth.password;
                    proxyUrl = url.toString();
                } catch (error) {
                    logger.warn('Failed to add auth to proxy URL', 'TerminalService', error as Error);
                }
            }

            // 设置所有常见的代理环境变量
            env.HTTP_PROXY = proxyUrl;
            env.HTTPS_PROXY = proxyUrl;
            env.http_proxy = proxyUrl;
            env.https_proxy = proxyUrl;

            // 记录代理配置（隐藏认证信息）
            logger.info(`Proxy configured: ${proxyUrl.replace(/\/\/.*@/, '//***@')}`, 'TerminalService');
        }

        return env;
    }

    /**
     * 从会话文件路径推断工作目录
     * 尝试从会话文件中读取原始工作目录信息，如果失败则使用当前工作区
     * @param sessionFilePath - 会话文件的完整路径
     * @returns 推断出的工作目录路径
     */
    private inferWorkingDirectoryFromSession(sessionFilePath: string): string {
        try {
            // 尝试从会话文件中读取cwd信息
            const fs = require('fs');
            if (fs.existsSync(sessionFilePath)) {
                const content = fs.readFileSync(sessionFilePath, 'utf-8');
                const lines = content.split('\n').filter((line: string) => line.trim());

                // 逐行解析JSON，查找cwd字段
                for (const line of lines as string[]) {
                    try {
                        const entry = JSON.parse(line);
                        if (entry.cwd) {
                            logger.debug(`Found cwd in session file: ${entry.cwd}`, 'TerminalService');
                            return entry.cwd;
                        }
                    } catch (error) {
                        // 忽略解析错误，继续下一行
                    }
                }
            }
        } catch (error) {
            logger.warn('Failed to read session file for cwd', 'TerminalService', error as Error);
        }

        // 如果无法从会话文件中获取，使用当前工作区作为后备方案
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        return workspaceFolder?.uri.fsPath || process.cwd();
    }

    /**
     * 检查Claude CLI是否可用
     * 检测系统中是否安装了Claude CLI工具
     * @returns 如果Claude CLI可用返回true，否则返回false
     */
    public async checkClaudeAvailability(): Promise<boolean> {
        try {
            const result = await claudePathManager.detectClaudePath();
            return result.isFound;
        } catch (error) {
            logger.error('Failed to check Claude availability', 'TerminalService', error as Error);
            return false;
        }
    }

    /**
     * 获取Claude CLI信息
     * 获取Claude CLI的安装路径和版本信息
     * @returns Claude CLI信息对象，包含路径和版本；如果未找到则返回null
     */
    public async getClaudeInfo(): Promise<{ path: string; version?: string } | null> {
        try {
            const result = await claudePathManager.detectClaudePath();
            if (result.isFound && result.path) {
                return {
                    path: result.path,
                    version: result.version
                };
            }
        } catch (error) {
            logger.error('Failed to get Claude info', 'TerminalService', error as Error);
        }
        return null;
    }

    /**
     * 创建隐藏的Claude测试会话
     * 用于验证账号token是否有效，通过发送简单消息触发拦截器获取token
     * @param testMessage - 测试消息，默认为"hi"
     * @returns Promise<boolean> - 是否成功获取到token
     */
    public async createHiddenTestSession(testMessage: string = 'hi'): Promise<boolean> {
        try {
            logger.info('🔍 Creating hidden test session to verify account token...', 'TerminalService');

            // 记录当前活动账号状态  
            const currentAccount = this.configManager.getCurrentActiveClaudeAccount();
            if (currentAccount) {
                logger.info(`📋 Current active account: ${currentAccount.emailAddress}`, 'TerminalService');
                logger.info(`🔑 Current token status: ${currentAccount.authorization ? 'Has token' : 'No token'}`, 'TerminalService');
                if (currentAccount.authorization) {
                    logger.info(`🔑 Token preview: ${currentAccount.authorization.substring(0, 20)}...`, 'TerminalService');
                }
            } else {
                logger.warn('⚠️ No active account found', 'TerminalService');
                return false;
            }

            // 检测Claude CLI路径
            const claudePath = await claudePathManager.getClaudePath();
            if (!claudePath) {
                logger.error('❌ Claude CLI not found', 'TerminalService');
                return false;
            }
            logger.info(`✅ Claude CLI found at: ${claudePath}`, 'TerminalService');

            // 检查Claude CLI配置文件
            const os = require('os');
            const path = require('path');
            const fs = require('fs');
            const claudeConfigPath = path.join(os.homedir(), '.anthropic', 'claude-cli', 'config.json');
            
            if (fs.existsSync(claudeConfigPath)) {
                try {
                    const configContent = fs.readFileSync(claudeConfigPath, 'utf-8');
                    const config = JSON.parse(configContent);
                    logger.info(`📁 Claude CLI config exists`, 'TerminalService');
                    logger.info(`📧 CLI config account: ${config.account?.email || 'none'}`, 'TerminalService');
                    logger.info(`🔑 CLI config has session_key: ${!!config.account?.session_key}`, 'TerminalService');
                } catch (error) {
                    logger.warn('⚠️ Failed to read Claude CLI config', 'TerminalService');
                }
            } else {
                logger.warn(`⚠️ Claude CLI config not found at: ${claudeConfigPath}`, 'TerminalService');
            }

            // 获取工作目录
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const cwd = workspaceFolder?.uri.fsPath || process.cwd();
            logger.info(`📂 Working directory: ${cwd}`, 'TerminalService');

            // 构建Claude命令参数
            const args = [''];
            args.push('--dangerously-skip-permissions');

            // 创建隐藏终端（不显示在UI中）
            const terminal = vscode.window.createTerminal({
                name: 'Claude Token Test (Hidden)',
                cwd: cwd,
                env: this.getClaudeEnvironment(),
                hideFromUser: true // 隐藏终端
            });

            // 执行Claude命令
            const command = `"${claudePath}" ${args.join(' ')}`;
            logger.info(`🚀 Executing hidden test command: ${command}`, 'TerminalService');
            terminal.sendText(command);

            // 等待Claude启动后发送测试消息
            logger.info('⏳ Waiting 3 seconds for Claude to start...', 'TerminalService');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            logger.info(`💬 Sending test message: "${testMessage}"`, 'TerminalService');
            terminal.sendText(testMessage);

            // 等待拦截器捕获token
            let attempts = 0;
            const maxAttempts = 15; // 增加等待时间到15秒
            
            logger.info(`⏱️ Waiting for token capture (max ${maxAttempts} seconds)...`, 'TerminalService');
            
            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;

                // 检查当前账号是否已获取到token
                const currentAccount = this.configManager.getCurrentActiveClaudeAccount();
                if (currentAccount && currentAccount.authorization) {
                    logger.info(`✅ Token successfully obtained through test session! (attempt ${attempts}/${maxAttempts})`, 'TerminalService');
                    logger.info(`🔑 New token preview: ${currentAccount.authorization.substring(0, 20)}...`, 'TerminalService');
                    terminal.dispose(); // 清理隐藏终端
                    return true;
                }
                
                if (attempts % 3 === 0) {
                    logger.info(`⏳ Still waiting for token... (${attempts}/${maxAttempts})`, 'TerminalService');
                }
            }

            logger.warn(`⚠️ Failed to obtain token through test session after ${maxAttempts} seconds`, 'TerminalService');
            terminal.dispose(); // 清理隐藏终端
            return false;

        } catch (error) {
            logger.error('❌ Failed to create hidden test session', 'TerminalService', error as Error);
            return false;
        }
    }

    /**
     * 执行Claude login命令
     * 在终端中启动Claude CLI的登录流程，用户需要按照终端提示完成认证
     */
    public async executeClaudeLogin(): Promise<void> {
        try {
            logger.info('Executing Claude login...', 'TerminalService');

            // 检测Claude CLI路径
            const claudePath = await claudePathManager.getClaudePath();
            if (!claudePath) {
                const message = 'Claude CLI not found. Please install Claude CLI first.';
                logger.error(message, 'TerminalService');
                vscode.window.showErrorMessage(message);
                return;
            }

            logger.info(`Using Claude CLI at: ${claudePath}`, 'TerminalService');

            // 获取工作目录
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const cwd = workspaceFolder?.uri.fsPath || process.cwd();

            // 创建专用的登录终端
            const terminal = vscode.window.createTerminal({
                name: 'Claude Login',
                cwd: cwd,
                env: this.getClaudeEnvironment()
            });

            // 显示终端窗口
            terminal.show();

            // 执行Claude /login命令
            const command = `"${claudePath}" /login`;
            logger.info(`Executing command: ${command}`, 'TerminalService');
            terminal.sendText(command);

            // 向用户显示友好提示
            vscode.window.showInformationMessage(
                'Claude login initiated. Please follow the instructions in the terminal to complete the login process.',
                'OK'
            );

            logger.info('Claude login command executed successfully', 'TerminalService');

        } catch (error) {
            const message = `Failed to execute Claude login: ${(error as Error).message}`;
            logger.error(message, 'TerminalService', error as Error);
            vscode.window.showErrorMessage(message);
        }
    }
}