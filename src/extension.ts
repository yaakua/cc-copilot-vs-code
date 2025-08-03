import * as vscode from 'vscode';
import { ClaudeSessionProvider } from './treeProvider';
import { SettingsManager } from './settings';
import { SessionManager } from './session-manager';
import { TerminalService } from './terminal-service';
import { logger } from './logger';

export function activate(context: vscode.ExtensionContext) {
    try {
        // 初始化日志系统
        logger.setContext(context);
        logger.info('Claude Companion extension activated', 'extension');
        
        // 初始化设置管理器
        const settingsManager = new SettingsManager(context);
        
        // 初始化会话管理器
        const sessionManager = new SessionManager(context, settingsManager);
        
        // 初始化终端服务
        const terminalService = new TerminalService(context, settingsManager);
        
        // 初始化树视图提供者
        const sessionProvider = new ClaudeSessionProvider(sessionManager, settingsManager);
    
    // 注册树视图
    vscode.window.registerTreeDataProvider('claude-sessions-view', sessionProvider);
    
    // 注册命令
    
    // 新建会话命令
    const newSessionCommand = vscode.commands.registerCommand('cc-copilot.newSession', async () => {
        // 检查Claude CLI是否可用
        const isAvailable = await terminalService.checkClaudeAvailability();
        if (!isAvailable) {
            const result = await vscode.window.showErrorMessage(
                'Claude CLI is not installed or not found in PATH.',
                'Open Installation Guide'
            );
            if (result === 'Open Installation Guide') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/anthropics/claude-code'));
            }
            return;
        }

        // 询问用户选择会话类型
        const sessionType = await vscode.window.showQuickPick([
            {
                label: 'Standard Session',
                description: 'Create a new Claude session',
                detail: 'Basic Claude session without request interception'
            },
            {
                label: 'Intercepted Session',
                description: 'Create a session with request monitoring',
                detail: 'Advanced session with API request interception for account management'
            }
        ], {
            placeHolder: 'Select session type'
        });

        if (!sessionType) return;

        if (sessionType.label === 'Standard Session') {
            await terminalService.createNewClaudeSession();
        } else {
            await terminalService.createClaudeSessionWithInterceptor();
        }
    });

    // 刷新会话命令
    const refreshSessionsCommand = vscode.commands.registerCommand('cc-copilot.refreshSessions', () => {
        sessionProvider.refresh();
        vscode.window.showInformationMessage('Sessions refreshed');
    });

    // 打开会话命令
    const openSessionCommand = vscode.commands.registerCommand('cc-copilot.openSession', async (item) => {
        if (item && item.sessionId && item.session?.filePath) {
            // 检查Claude CLI是否可用
            const isAvailable = await terminalService.checkClaudeAvailability();
            if (!isAvailable) {
                vscode.window.showErrorMessage('Claude CLI is not available.');
                return;
            }

            await terminalService.resumeClaudeSession(item.session.filePath);
        } else {
            vscode.window.showErrorMessage('Session file path not found.');
        }
    });

    // 删除会话命令
    const deleteSessionCommand = vscode.commands.registerCommand('cc-copilot.deleteSession', async (item) => {
        if (item && item.sessionId) {
            const result = await vscode.window.showWarningMessage(
                `Are you sure you want to delete session "${item.session?.name || item.sessionId}"?`,
                { modal: true },
                'Delete'
            );
            
            if (result === 'Delete') {
                sessionProvider.deleteSession(item.sessionId);
                vscode.window.showInformationMessage('Session deleted');
            }
        }
    });

    // 同步Claude目录命令
    const syncWithClaudeCommand = vscode.commands.registerCommand('cc-copilot.syncWithClaude', async () => {
        await sessionProvider.syncWithClaudeDirectory();
        vscode.window.showInformationMessage('Synced with Claude directory');
    });

    // 打开设置命令
    const openSettingsCommand = vscode.commands.registerCommand('cc-copilot.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'ccCopilot');
    });

    // 添加第三方AI提供方命令
    const addThirdPartyProviderCommand = vscode.commands.registerCommand('cc-copilot.addThirdPartyProvider', async () => {
        const providerName = await vscode.window.showInputBox({
            prompt: 'Enter the provider name (e.g., "OpenAI", "Anthropic Compatible")',
            placeHolder: 'Provider Name'
        });
        
        if (!providerName) return;

        const accountName = await vscode.window.showInputBox({
            prompt: 'Enter the account name',
            placeHolder: 'Account Name'
        });
        
        if (!accountName) return;

        const baseUrl = await vscode.window.showInputBox({
            prompt: 'Enter the base URL for the API',
            placeHolder: 'https://api.example.com/v1'
        });
        
        if (!baseUrl) return;

        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter the API key',
            placeHolder: 'your-api-key-here',
            password: true
        });
        
        if (!apiKey) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Enter an optional description',
            placeHolder: 'Optional description'
        });

        try {
            const account = {
                id: `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: accountName,
                apiKey: apiKey,
                baseUrl: baseUrl,
                description: description || ''
            };

            await settingsManager.createThirdPartyProvider(providerName, account);
            vscode.window.showInformationMessage(`Third party provider "${providerName}" added successfully!`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add provider: ${(error as Error).message}`);
        }
    });

    // 选择活动AI提供方命令
    const selectActiveProviderCommand = vscode.commands.registerCommand('cc-copilot.selectActiveProvider', async () => {
        const options = settingsManager.getAllProviderOptions();
        
        if (options.length === 0) {
            vscode.window.showInformationMessage('No AI providers configured. Please add a third-party provider or configure Claude Official first.');
            return;
        }

        const currentActiveId = settingsManager.getCurrentActiveCompositeId();
        
        const quickPickItems = options.map(option => ({
            label: option.label,
            description: option.description,
            detail: option.id === currentActiveId ? '• Currently Active' : '',
            id: option.id
        }));

        const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select an AI provider to activate'
        });

        if (selected) {
            try {
                await settingsManager.setActiveProviderByCompositeId(selected.id);
                vscode.window.showInformationMessage(`Active provider set to: ${selected.label}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to set active provider: ${(error as Error).message}`);
            }
        }
    });

    // 注册所有命令
    context.subscriptions.push(
        newSessionCommand,
        refreshSessionsCommand,
        openSessionCommand,
        deleteSessionCommand,
        syncWithClaudeCommand,
        openSettingsCommand,
        addThirdPartyProviderCommand,
        selectActiveProviderCommand
    );
    
    // 监听工作区变化
    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        logger.info('Workspace folders changed, refreshing sessions...', 'extension');
        sessionProvider.refresh();
    });

    // 监听文件系统变化（Claude会话文件）
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.jsonl');
    
    fileWatcher.onDidCreate(() => {
        logger.debug('JSONL file created, refreshing sessions...', 'extension');
        setTimeout(() => sessionProvider.refresh(), 500); // 延迟刷新避免频繁更新
    });
    
    fileWatcher.onDidChange(() => {
        logger.debug('JSONL file changed, refreshing sessions...', 'extension');
        setTimeout(() => sessionProvider.refresh(), 500);
    });
    
    fileWatcher.onDidDelete(() => {
        logger.debug('JSONL file deleted, refreshing sessions...', 'extension');
        setTimeout(() => sessionProvider.refresh(), 500);
    });

    // 定期自动同步Claude目录（每30秒）
    const autoSyncInterval = setInterval(() => {
        logger.debug('Auto-syncing with Claude directory...', 'extension');
        sessionProvider.syncWithClaudeDirectory().catch(error => {
            logger.warn('Auto-sync failed', 'extension', error as Error);
        });
    }, 30000);

    // 启动时自动同步一次Claude目录
    setTimeout(() => {
        sessionProvider.syncWithClaudeDirectory();
    }, 1000);

    // 注册清理资源
    context.subscriptions.push(
        workspaceWatcher,
        fileWatcher,
        { dispose: () => clearInterval(autoSyncInterval) }
    );
    
        logger.info('Claude Companion extension initialization completed', 'extension');
        
    } catch (error) {
        const message = `Failed to activate Claude Companion extension: ${(error as Error).message}`;
        logger.error(message, 'extension', error as Error);
        vscode.window.showErrorMessage(message);
        throw error;
    }
}

export function deactivate() {
    try {
        logger.info('Claude Companion extension deactivated', 'extension');
    } catch (error) {
        console.error('Error during extension deactivation:', error);
    }
}