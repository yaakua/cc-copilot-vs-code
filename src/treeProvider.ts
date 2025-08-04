import * as vscode from 'vscode';
import { SessionManager } from './session-manager';
import { UnifiedConfigManager } from './shared/config-manager';
import { Project, Session } from './shared/types';
import { logger } from './logger';

/**
 * Claude会话树形视图提供器
 * 实现VSCode的TreeDataProvider接口，为侧边栏提供分层的会话管理视图
 * 包含账号选择器、项目列表和会话列表
 */
export class ClaudeSessionProvider implements vscode.TreeDataProvider<ClaudeSessionItem> {
    /** 树形数据变化事件发射器 */
    private _onDidChangeTreeData: vscode.EventEmitter<ClaudeSessionItem | undefined | null | void> = new vscode.EventEmitter<ClaudeSessionItem | undefined | null | void>();
    /** 树形数据变化事件 */
    readonly onDidChangeTreeData: vscode.Event<ClaudeSessionItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    /** 每个项目显示的初始会话数量 */
    private readonly DEFAULT_SESSIONS_LIMIT = 50;
    /** 记录每个项目已加载的会话数量 */
    private projectSessionLimits: Map<string, number> = new Map();

    /**
     * 构造函数
     * @param sessionManager - 会话管理器实例
     * @param configManager - 统一配置管理器实例
     */
    constructor(
        private sessionManager: SessionManager,
        private configManager: UnifiedConfigManager
    ) {
        // 监听设置变化，自动刷新视图
        this.configManager.on('config:changed', () => {
            this.refresh();
        });

        // 监听服务提供方变化
        this.configManager.on('serviceProvider:updated', () => {
            this.refresh();
        });

        // 监听活动服务提供方变化
        this.configManager.on('serviceProvider:activated', () => {
            this.refresh();
        });

        // 监听活动账号变化
        this.configManager.on('claudeAccount:activated', () => {
            this.refresh();
        });
    }

    /**
     * 刷新树形视图
     * 触发视图重新渲染
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * 获取树形项目的显示信息
     * @param element - 树形项目元素
     * @returns VSCode树形项目
     */
    getTreeItem(element: ClaudeSessionItem): vscode.TreeItem {
        return element;
    }

    /**
     * 获取指定元素的子项
     * @param element - 父级元素，如果为undefined则返回根级元素
     * @returns 子项数组的Promise
     */
    getChildren(element?: ClaudeSessionItem): Thenable<ClaudeSessionItem[]> {
        if (!element) {
            // 返回根级别项目：账号管理区域 + 项目列表
            const children: ClaudeSessionItem[] = [];

            // 添加账号管理区域
            children.push(this.getAccountManagementSection());

            // 添加分隔符
            children.push(this.getSeparator());

            // 添加项目列表
            children.push(...this.getProjects());

            return Promise.resolve(children);
        } else if (element.contextValue === 'accountManagement') {
            // 返回账号管理区域的子项
            return Promise.resolve(this.getAccountManagementChildren());
        } else if (element.contextValue === 'project') {
            // 返回项目下的会话
            return Promise.resolve(this.getSessions(element.projectId!));
        } else {
            // 会话没有子项
            return Promise.resolve([]);
        }
    }

    /**
     * 创建账号管理区域
     * 显示账号管理的可折叠区域，标题右侧带刷新按钮
     * @returns 账号管理区域树形项目
     */
    private getAccountManagementSection(): ClaudeSessionItem {
        const activeProvider = this.configManager.getActiveServiceProvider();
        const currentActive = activeProvider ? { provider: activeProvider, account: null } : null;
        let label = 'Account Management';
        let description = '';
        let tooltip = 'Click to expand account management options';

        if (currentActive) {
            if (currentActive.provider.type === 'claude_official') {
                const account = currentActive.account as any;
                description = `Active: ${account.emailAddress} (Claude Official)`;
            } else {
                const account = currentActive.account as any;
                description = `Active: ${account.name} (${currentActive.provider.name})`;
            }
            tooltip = `Current active account: ${description}\n\nClick to expand and manage accounts`;
        } else {
            description = 'No active account selected';
            tooltip = 'No account is currently selected. Click to expand and select an account.';
        }

        const item = new ClaudeSessionItem(
            label,
            vscode.TreeItemCollapsibleState.Expanded,
            'accountManagement',
            new vscode.ThemeIcon('account'),
            undefined,
            undefined,
            undefined,
            undefined,
            tooltip
        );

        item.description = description;
        
        return item;
    }

    /**
     * 获取账号管理区域的子项
     * 包含所有可用账号列表
     * @returns 账号管理子项数组
     */
    private getAccountManagementChildren(): ClaudeSessionItem[] {
        // 直接返回所有可用账号，刷新按钮已移到标题右侧
        return this.getAllAvailableAccounts();
    }

    /**
     * 创建刷新账号按钮
     * @returns 刷新按钮树形项目
     */
    private getRefreshAccountsButton(): ClaudeSessionItem {
        return new ClaudeSessionItem(
            '$(refresh) Refresh Accounts',
            vscode.TreeItemCollapsibleState.None,
            'refreshAccounts',
            new vscode.ThemeIcon('refresh'),
            undefined,
            undefined,
            undefined,
            undefined,
            'Click to refresh and discover all available accounts',
            {
                command: 'cc-copilot.refreshAccounts',
                title: 'Refresh Accounts'
            }
        );
    }

    /**
     * 获取所有可用账号列表
     * 包含Claude官方账号和第三方服务提供商账号
     * @returns 账号列表树形项目数组
     */
    private getAllAvailableAccounts(): ClaudeSessionItem[] {
        const accounts: ClaudeSessionItem[] = [];
        const providers = this.configManager.getServiceProviders();
        const activeProvider = this.configManager.getActiveServiceProvider();

        // Claude官方账号
        const claudeProvider = providers.find((p: any) => p.type === 'claude_official');
        if (claudeProvider && claudeProvider.accounts && claudeProvider.accounts.length > 0) {
            claudeProvider.accounts.forEach((account: any) => {
                const isActive = activeProvider && 
                    activeProvider.type === 'claude_official' && 
                    activeProvider.activeAccountId === account.emailAddress;

                const label = `${account.emailAddress}`;
                // const label = isActive ? `✓ ${baseLabel}` : baseLabel;
                const description = '🔸 Claude Official';
                
                // 只有选中的账号才显示图标
                const icon = isActive ? 
                    new vscode.ThemeIcon('check', new vscode.ThemeColor('statusBarItem.activeBackground')) :
                    undefined;

                const item = new ClaudeSessionItem(
                    label,
                    vscode.TreeItemCollapsibleState.None,
                    'claudeAccount',
                    icon,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    `Claude Official Account\nEmail: ${account.emailAddress}\nOrganization: ${account.organizationName || 'Unknown'}\n\nClick to select this account`,
                    {
                        command: 'cc-copilot.selectAccount',
                        title: 'Select Account',
                        arguments: [{ providerId: claudeProvider.id, accountId: account.emailAddress }]
                    }
                );
                
                item.description = description;
                accounts.push(item);
            });
        }

        // 第三方服务提供商账号
        const thirdPartyProviders = providers.filter((p: any) => p.type === 'third_party');
        thirdPartyProviders.forEach((provider: any) => {
            if (provider.accounts && provider.accounts.length > 0) {
                provider.accounts.forEach((account: any) => {
                    const isActive = activeProvider && 
                        activeProvider.id === provider.id && 
                        activeProvider.activeAccountId === account.id;

                    const baseLabel = account.name;
                    const label = isActive ? `✓ ${baseLabel}` : baseLabel;
                    const description = `🔶 ${provider.name}`;
                    
                    // 只有选中的账号才显示图标
                    const icon = isActive ? 
                        new vscode.ThemeIcon('check', new vscode.ThemeColor('statusBarItem.activeBackground')) :
                        undefined;

                    const item = new ClaudeSessionItem(
                        label,
                        vscode.TreeItemCollapsibleState.None,
                        'thirdPartyAccount',
                        icon,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        `Third Party Provider: ${provider.name}\nAccount: ${account.name}\nBase URL: ${account.baseUrl}\n\nClick to select this account`,
                        {
                            command: 'cc-copilot.selectAccount',
                            title: 'Select Account',
                            arguments: [{ providerId: provider.id, accountId: account.id }]
                        }
                    );
                    
                    item.description = description;
                    accounts.push(item);
                });
            }
        });

        return accounts;
    }

    /**
     * 创建账号选择器项目（保留原有功能作为备用）
     * 显示当前活动的AI服务提供商和账号信息，点击可切换
     * @returns 账号选择器树形项目
     */
    private getAccountSelector(): ClaudeSessionItem {
        const activeProvider = this.configManager.getActiveServiceProvider();
        let label = '🔄 Select AI Provider';
        let description = 'Click to choose an AI provider';
        let tooltip = 'No AI provider is currently selected. Click to choose one.';
        let icon = new vscode.ThemeIcon('account', new vscode.ThemeColor('statusBarItem.warningBackground'));

        // 根据当前活动账号设置显示信息
        if (activeProvider) {
            if (activeProvider.type === 'claude_official') {
                // Claude官方服务
                const claudeAccounts = activeProvider.accounts as any[];
                const activeAccount = claudeAccounts.find((acc: any) => acc.emailAddress === activeProvider.activeAccountId);
                if (activeAccount) {
                    label = `✓ ${activeAccount.emailAddress}`;
                    description = `Claude Official`;
                    tooltip = `Active: Claude Official\nAccount: ${activeAccount.emailAddress}\nOrganization: ${activeAccount.organizationName}\n\nClick to switch providers`;
                    icon = new vscode.ThemeIcon('check-all', new vscode.ThemeColor('statusBarItem.activeBackground'));
                }
            } else {
                // 第三方服务提供商
                const thirdPartyAccounts = activeProvider.accounts as any[];
                const activeAccount = thirdPartyAccounts.find((acc: any) => acc.id === activeProvider.activeAccountId);
                if (activeAccount) {
                    label = `✓ ${activeAccount.name}`;
                    description = `${activeProvider.name}`;
                    tooltip = `Active: ${activeProvider.name}\nAccount: ${activeAccount.name}\nBase URL: ${activeAccount.baseUrl}\n\nClick to switch providers`;
                    icon = new vscode.ThemeIcon('check-all', new vscode.ThemeColor('statusBarItem.activeBackground'));
                }
            }
        }

        const item = new ClaudeSessionItem(
            label,
            vscode.TreeItemCollapsibleState.None,
            'accountSelector',
            icon,
            undefined,
            undefined,
            undefined,
            undefined,
            tooltip,
            {
                command: 'cc-copilot.selectActiveProvider',
                title: 'Select Active AI Provider'
            }
        );

        // 设置描述文本
        item.description = description;

        return item;
    }

    /**
     * 创建分隔符项目
     * 用于在视图中分隔不同的区域
     * @returns 分隔符树形项目
     */
    private getSeparator(): ClaudeSessionItem {
        return new ClaudeSessionItem(
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            vscode.TreeItemCollapsibleState.None,
            'separator',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            'Projects and Sessions'
        );
    }

    /**
     * 获取工作区项目列表
     * 从会话管理器获取所有项目，并显示每个项目的会话数量
     * @returns 项目树形项目数组
     */
    private getProjects(): ClaudeSessionItem[] {
        try {
            const projects = this.sessionManager.getWorkspaceProjects();
            logger.debug(`Found ${projects.length} workspace projects`, 'ClaudeSessionProvider');

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

    /**
     * 获取指定项目的会话列表
     * 按创建时间降序排列会话，支持分页显示
     * @param projectId - 项目ID
     * @returns 会话树形项目数组
     */
    private getSessions(projectId: string): ClaudeSessionItem[] {
        try {
            const allSessions = this.sessionManager.getSessions(projectId);
            logger.debug(`Found ${allSessions.length} sessions for project ${projectId}`, 'ClaudeSessionProvider');

            // 按创建时间倒序排列（最新的在前面）
            const sortedSessions = allSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            
            // 获取当前项目的会话显示限制
            const currentLimit = this.projectSessionLimits.get(projectId) || this.DEFAULT_SESSIONS_LIMIT;
            const displaySessions = sortedSessions.slice(0, currentLimit);
            
            const sessionItems = displaySessions.map(session => {
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
            
            // 如果还有更多会话，添加"Load more"项
            if (sortedSessions.length > currentLimit) {
                const remainingCount = sortedSessions.length - currentLimit;
                const loadMoreItem = new ClaudeSessionItem(
                    `Load ${Math.min(remainingCount, this.DEFAULT_SESSIONS_LIMIT)} more sessions...`,
                    vscode.TreeItemCollapsibleState.None,
                    'loadMore',
                    new vscode.ThemeIcon('add'),
                    projectId,
                    undefined,
                    undefined,
                    undefined,
                    `Load ${remainingCount} more sessions for this project`,
                    {
                        command: 'cc-copilot.loadMoreSessions',
                        title: 'Load More Sessions',
                        arguments: [{ projectId }]
                    }
                );
                sessionItems.push(loadMoreItem);
            }
            
            return sessionItems;
        } catch (error) {
            logger.error(`Failed to get sessions for project ${projectId}`, 'ClaudeSessionProvider', error as Error);
            return [];
        }
    }

    /**
     * 格式化会话标签
     * 显示会话名称和相对时间，限制名称长度避免显示过长
     * @param session - 会话对象
     * @returns 格式化后的标签字符串
     */
    private formatSessionLabel(session: Session): string {
        const timeStr = this.formatRelativeTime(session.lastActiveAt);

        // 限制名称长度，避免界面显示过长
        const maxNameLength = 30;
        let displayName = session.name;
        if (displayName.length > maxNameLength) {
            displayName = displayName.substring(0, maxNameLength) + '...';
        }

        return `${displayName} (${timeStr})`;
    }

    /**
     * 格式化相对时间
     * 将时间戳转换为用户友好的相对时间表示
     * @param dateString - 时间戳字符串
     * @returns 相对时间字符串（如"2h ago", "3d ago"等）
     */
    private formatRelativeTime(dateString: string): string {
        const now = new Date();
        const date = new Date(dateString);
        const diffMs = now.getTime() - date.getTime();
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);
        const diffYears = Math.floor(diffDays / 365);

        if (diffSeconds < 60) {
            return 'just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else if (diffWeeks < 4) {
            return `${diffWeeks}w ago`;
        } else if (diffMonths < 12) {
            return `${diffMonths}mo ago`;
        } else {
            return `${diffYears}y ago`;
        }
    }

    /**
     * 格式化会话工具提示
     * 创建包含会话详细信息的工具提示文本
     * @param session - 会话对象
     * @returns 格式化后的工具提示字符串
     */
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

    /**
     * 同步Claude目录
     * 从Claude CLI的本地目录同步会话数据，更新视图显示
     */
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

    /**
     * 删除会话
     * 从会话管理器中删除指定会话并刷新视图
     * @param sessionId - 要删除的会话ID
     */
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

    /**
     * 获取会话详情
     * 根据会话ID获取完整的会话对象
     * @param sessionId - 会话ID
     * @returns 会话对象，如果不存在则返回undefined
     */
    public getSession(sessionId: string): Session | undefined {
        return this.sessionManager.getSessionById(sessionId);
    }

    /**
     * 加载更多会话
     * 增加指定项目的会话显示数量
     * @param projectId - 项目ID
     */
    public loadMoreSessions(projectId: string): void {
        try {
            const currentLimit = this.projectSessionLimits.get(projectId) || this.DEFAULT_SESSIONS_LIMIT;
            const newLimit = currentLimit + this.DEFAULT_SESSIONS_LIMIT;
            this.projectSessionLimits.set(projectId, newLimit);
            this.refresh();
            logger.info(`Loaded more sessions for project ${projectId}, new limit: ${newLimit}`, 'ClaudeSessionProvider');
        } catch (error) {
            logger.error(`Failed to load more sessions for project ${projectId}`, 'ClaudeSessionProvider', error as Error);
        }
    }
}

/**
 * Claude会话树形项目类
 * 扩展VSCode的TreeItem，用于在树形视图中显示会话相关信息
 */
export class ClaudeSessionItem extends vscode.TreeItem {
    /**
     * 构造函数
     * @param label - 显示标签
     * @param collapsibleState - 折叠状态
     * @param contextValue - 上下文值，用于区分不同类型的项目
     * @param iconPath - 图标路径或主题图标
     * @param projectId - 项目ID（仅项目类型项目使用）
     * @param sessionId - 会话ID（仅会话类型项目使用）
     * @param project - 项目对象（仅项目类型项目使用）
     * @param session - 会话对象（仅会话类型项目使用）
     * @param tooltip - 工具提示文本
     * @param command - 点击命令
     */
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
                command: 'cc-copilot.openSession',
                title: 'Open Session',
                arguments: [{ sessionId, session }]
            };
        }

        // 根据上下文设置默认图标
        if (iconPath) {
            this.iconPath = iconPath;
        } else if (contextValue === 'project') {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (contextValue === 'session') {
            this.iconPath = new vscode.ThemeIcon('terminal');
        }
    }
}

/**
 * 向后兼容的别名
 * 保持与旧版本代码的兼容性
 */
export const CCCopilotProvider = ClaudeSessionProvider;
export const TreeItem = ClaudeSessionItem;