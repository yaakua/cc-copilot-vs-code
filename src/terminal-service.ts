import * as vscode from 'vscode';
import * as path from 'path';
import { claudePathManager } from './claude-path-manager';
import { SettingsManager } from './settings';
import { logger } from './logger';

export class TerminalService {
    constructor(
        private context: vscode.ExtensionContext,
        private settingsManager: SettingsManager
    ) {}

    /**
     * 创建新的Claude会话终端
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

            // 获取工作目录
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const cwd = workspaceFolder?.uri.fsPath || process.cwd();

            // 构建Claude命令参数
            const args = ['new'];
            // Always skip permissions for simplicity
            args.push('--dangerously-skip-permissions');

            // 创建终端
            const terminal = vscode.window.createTerminal({
                name: 'Claude Session',
                cwd: cwd,
                env: this.getClaudeEnvironment()
            });

            // 显示终端
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
            
            // 构建Claude命令参数
            const args = ['resume', `"${sessionFilePath}"`];
            // Always skip permissions for simplicity
            args.push('--dangerously-skip-permissions');

            // 创建终端
            const sessionName = path.basename(sessionFilePath, '.jsonl');
            const terminal = vscode.window.createTerminal({
                name: `Claude: ${sessionName}`,
                cwd: cwd,
                env: this.getClaudeEnvironment()
            });

            // 显示终端
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
            // Always skip permissions for simplicity
            args.push('--dangerously-skip-permissions');

            // 创建终端
            const terminal = vscode.window.createTerminal({
                name: 'Claude Session (Intercepted)',
                cwd: cwd,
                env: this.getClaudeEnvironment()
            });

            // 显示终端
            terminal.show();

            // 使用node --require来加载拦截器
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
     */
    private getClaudeEnvironment(): NodeJS.ProcessEnv {
        const env = { ...process.env };
        
        // 如果启用了代理，设置代理环境变量
        const proxyConfig = this.settingsManager.getProxyConfig();
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

            env.HTTP_PROXY = proxyUrl;
            env.HTTPS_PROXY = proxyUrl;
            env.http_proxy = proxyUrl;
            env.https_proxy = proxyUrl;
            
            logger.info(`Proxy configured: ${proxyUrl.replace(/\/\/.*@/, '//***@')}`, 'TerminalService');
        }

        return env;
    }

    /**
     * 从会话文件路径推断工作目录
     */
    private inferWorkingDirectoryFromSession(sessionFilePath: string): string {
        try {
            // 尝试从会话文件中读取cwd信息
            const fs = require('fs');
            if (fs.existsSync(sessionFilePath)) {
                const content = fs.readFileSync(sessionFilePath, 'utf-8');
                const lines = content.split('\n').filter((line: string) => line.trim());
                
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

        // 如果无法从会话文件中获取，使用当前工作区
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        return workspaceFolder?.uri.fsPath || process.cwd();
    }

    /**
     * 检查Claude CLI是否可用
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
     * 执行Claude login命令
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

            // 创建终端
            const terminal = vscode.window.createTerminal({
                name: 'Claude Login',
                cwd: cwd,
                env: this.getClaudeEnvironment()
            });

            // 显示终端
            terminal.show();

            // 执行Claude login命令
            const command = `"${claudePath}" login`;
            logger.info(`Executing command: ${command}`, 'TerminalService');
            terminal.sendText(command);

            // 提示用户
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