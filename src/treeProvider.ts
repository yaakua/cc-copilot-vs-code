import * as vscode from 'vscode';
import * as path from 'path';
import { SessionManager } from './session-manager';
import { SettingsManager } from './settings';
import { Project, Session } from './shared/types';
import { logger } from './logger';

export class ClaudeSessionProvider implements vscode.TreeDataProvider<ClaudeSessionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ClaudeSessionItem | undefined | null | void> = new vscode.EventEmitter<ClaudeSessionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ClaudeSessionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private sessionManager: SessionManager,
        private settingsManager: SettingsManager
    ) {
        // 监听设置变化，自动刷新视图
        this.settingsManager.on('settings:updated', () => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ClaudeSessionItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ClaudeSessionItem): Thenable<ClaudeSessionItem[]> {
        if (!element) {
            // 返回根项目
            return Promise.resolve(this.getProjects());
        } else if (element.contextValue === 'project') {
            // 返回项目下的会话
            return Promise.resolve(this.getSessions(element.projectId!));
        } else {
            // 会话没有子项
            return Promise.resolve([]);
        }
    }

    private getProjects(): ClaudeSessionItem[] {
        try {
            const projects = this.sessionManager.getProjects();
            logger.debug(`Found ${projects.length} projects`, 'ClaudeSessionProvider');
            
            return projects.map(project => {
                const sessions = this.sessionManager.getSessions(project.id);
                const label = `${project.name} (${sessions.length})`;
                
                return new ClaudeSessionItem(
                    label,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'project',
                    new vscode.ThemeIcon('folder'),
                    project.id,
                    undefined,
                    project
                );
            });
        } catch (error) {
            logger.error('Failed to get projects', 'ClaudeSessionProvider', error as Error);
            return [];
        }
    }

    private getSessions(projectId: string): ClaudeSessionItem[] {
        try {
            const sessions = this.sessionManager.getSessions(projectId);
            logger.debug(`Found ${sessions.length} sessions for project ${projectId}`, 'ClaudeSessionProvider');
            
            return sessions
                .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
                .map(session => {
                    const label = this.formatSessionLabel(session);
                    const tooltip = this.formatSessionTooltip(session);
                    
                    return new ClaudeSessionItem(
                        label,
                        vscode.TreeItemCollapsibleState.None,
                        'session',
                        new vscode.ThemeIcon('terminal'),
                        undefined,
                        session.id,
                        undefined,
                        session,
                        tooltip
                    );
                });
        } catch (error) {
            logger.error(`Failed to get sessions for project ${projectId}`, 'ClaudeSessionProvider', error as Error);
            return [];
        }
    }

    private formatSessionLabel(session: Session): string {
        const date = new Date(session.lastActiveAt);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString();
        
        // 限制名称长度
        const maxNameLength = 30;
        let displayName = session.name;
        if (displayName.length > maxNameLength) {
            displayName = displayName.substring(0, maxNameLength) + '...';
        }
        
        return `${displayName} (${timeStr})`;
    }

    private formatSessionTooltip(session: Session): string {
        const createdAt = new Date(session.createdAt).toLocaleString();
        const lastActiveAt = new Date(session.lastActiveAt).toLocaleString();
        
        let tooltip = `Name: ${session.name}\n`;
        tooltip += `Created: ${createdAt}\n`;
        tooltip += `Last Active: ${lastActiveAt}`;
        
        if (session.claudeSessionId) {
            tooltip += `\nClaude Session ID: ${session.claudeSessionId}`;
        }
        
        if (session.filePath) {
            tooltip += `\nFile Path: ${session.filePath}`;
        }
        
        return tooltip;
    }

    // 同步Claude目录的方法
    public async syncWithClaudeDirectory(): Promise<void> {
        try {
            logger.info('Starting sync with Claude directory...', 'ClaudeSessionProvider');
            this.sessionManager.syncWithClaudeDirectory();
            this.refresh();
            logger.info('Sync with Claude directory completed', 'ClaudeSessionProvider');
        } catch (error) {
            logger.error('Failed to sync with Claude directory', 'ClaudeSessionProvider', error as Error);
            vscode.window.showErrorMessage(`Failed to sync with Claude directory: ${(error as Error).message}`);
        }
    }

    // 删除会话的方法
    public deleteSession(sessionId: string): void {
        try {
            this.sessionManager.deleteSession(sessionId);
            this.refresh();
            logger.info(`Session ${sessionId} deleted`, 'ClaudeSessionProvider');
        } catch (error) {
            logger.error(`Failed to delete session ${sessionId}`, 'ClaudeSessionProvider', error as Error);
            vscode.window.showErrorMessage(`Failed to delete session: ${(error as Error).message}`);
        }
    }

    // 获取会话详情的方法
    public getSession(sessionId: string): Session | undefined {
        return this.sessionManager.getSessionById(sessionId);
    }
}

export class ClaudeSessionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly iconPath?: string | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon,
        public readonly projectId?: string,
        public readonly sessionId?: string,
        public readonly project?: Project,
        public readonly session?: Session,
        public readonly tooltip?: string,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        
        this.tooltip = tooltip || this.label;
        this.contextValue = contextValue;
        
        // 为会话项目设置点击命令
        if (contextValue === 'session' && sessionId) {
            this.command = {
                command: 'claude-companion.openSession',
                title: 'Open Session',
                arguments: [this]
            };
        }
        
        // 设置图标
        if (iconPath) {
            this.iconPath = iconPath;
        } else if (contextValue === 'project') {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (contextValue === 'session') {
            this.iconPath = new vscode.ThemeIcon('terminal');
        }
    }
}

// 保持向后兼容的别名
export const CCCopilotProvider = ClaudeSessionProvider;
export const TreeItem = ClaudeSessionItem;