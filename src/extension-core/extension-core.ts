import * as vscode from 'vscode'
import { ClaudeSessionProvider } from '../treeProvider'
import { SettingsManager } from '../settings'
import { SessionManager } from '../session-manager'
import { TerminalService } from '../terminal-service'
import { logger } from '../logger'
import { CommandRegistry } from './command-registry'

/**
 * 扩展核心类
 * 负责协调和管理扩展的所有核心服务和功能
 * 包括服务初始化、事件监听、命令注册等
 */
export class ExtensionCore {
  /** 设置管理器实例 */
  private settingsManager!: SettingsManager
  /** 会话管理器实例 */
  private sessionManager!: SessionManager
  /** 终端服务实例 */
  private terminalService!: TerminalService
  /** 会话树形视图提供器实例 */
  private sessionProvider!: ClaudeSessionProvider
  /** 命令注册器实例 */
  private commandRegistry!: CommandRegistry

  /**
   * 构造函数
   * @param context - VSCode扩展上下文
   */
  constructor(private context: vscode.ExtensionContext) {
    this.initializeServices()
    this.setupTreeView()
    this.setupEventListeners()
    this.registerCommands()
  }

  /**
   * 初始化所有核心服务
   * 按依赖顺序创建各个服务实例
   */
  private initializeServices(): void {
    // 设置日志上下文
    logger.setContext(this.context)
    logger.info('Claude Companion extension activated', 'extension')

    // 初始化设置管理器
    console.log('Initializing SettingsManager...')
    console.log('SettingsManager type:', typeof SettingsManager)
    this.settingsManager = new SettingsManager(this.context)
    console.log('SettingsManager initialized successfully')

    // 初始化会话管理器
    console.log('Initializing SessionManager...')
    this.sessionManager = new SessionManager(this.context, this.settingsManager)
    console.log('SessionManager initialized successfully')

    // 初始化终端服务
    console.log('Initializing TerminalService...')
    this.terminalService = new TerminalService(this.context, this.settingsManager, this.sessionManager)
    console.log('TerminalService initialized successfully')

    // 初始化会话树形视图提供器
    console.log('Initializing ClaudeSessionProvider...')
    this.sessionProvider = new ClaudeSessionProvider(this.sessionManager, this.settingsManager)
    console.log('ClaudeSessionProvider initialized successfully')
  }

  /**
   * 设置树形视图
   * 注册会话树形视图提供器到VSCode
   */
  private setupTreeView(): void {
    vscode.window.registerTreeDataProvider('claude-sessions-view', this.sessionProvider)
  }

  /**
   * 设置事件监听器
   * 配置各种文件和设置变化的监听器
   */
  private setupEventListeners(): void {
    this.setupWorkspaceWatcher()
    this.setupFileWatcher()
    this.setupSettingsWatcher()
  }

  /**
   * 设置工作区监听器
   * 监听工作区文件夹变化，自动刷新会话视图
   */
  private setupWorkspaceWatcher(): void {
    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      logger.info('Workspace folders changed, refreshing sessions...', 'extension')
      this.sessionProvider.refresh()
    })
    this.context.subscriptions.push(workspaceWatcher)
  }

  /**
   * 设置文件监听器
   * 监听JSONL文件变化，自动刷新会话视图
   */
  private setupFileWatcher(): void {
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.jsonl')

    // 监听文件创建
    fileWatcher.onDidCreate(() => {
      logger.debug('JSONL file created, refreshing sessions...', 'extension')
      setTimeout(() => this.sessionProvider.refresh(), 500)
    })

    // 监听文件修改
    fileWatcher.onDidChange(() => {
      logger.debug('JSONL file changed, refreshing sessions...', 'extension')
      setTimeout(() => this.sessionProvider.refresh(), 500)
    })

    // 监听文件删除
    fileWatcher.onDidDelete(() => {
      logger.debug('JSONL file deleted, refreshing sessions...', 'extension')
      setTimeout(() => this.sessionProvider.refresh(), 500)
    })

    this.context.subscriptions.push(fileWatcher)
  }

  /**
   * 设置设置监听器
   * 监听设置管理器的各种事件，自动刷新视图
   */
  private setupSettingsWatcher(): void {
    // 监听Claude账号发现事件
    this.settingsManager.on('claude-accounts:discovered', () => {
      logger.info('New Claude accounts discovered, refreshing tree view...', 'extension')
      this.sessionProvider.refresh()
    })

    // 监听服务提供商更新事件
    this.settingsManager.on('service-providers:updated', () => {
      logger.info('Service providers updated, refreshing tree view...', 'extension')
      this.sessionProvider.refresh()
    })

    // 监听活动服务提供商变化事件
    this.settingsManager.on('active-service-provider:changed', () => {
      logger.info('Active service provider changed, refreshing tree view...', 'extension')
      this.sessionProvider.refresh()
    })
  }

  /**
   * 注册命令
   * 创建命令注册器并注册所有扩展命令
   */
  private registerCommands(): void {
    this.commandRegistry = new CommandRegistry(
      this.context,
      this.settingsManager,
      this.sessionManager,
      this.terminalService,
      this.sessionProvider
    )
    this.commandRegistry.registerAllCommands()
  }

  /**
   * 启动拦截器发现定时器
   * 定期检查拦截器发现的新账号并处理
   */
  public startInterceptorDiscoveryTimer(): void {
    const intervalMs = 10000 // 10秒间隔
    const intervalId = setInterval(async () => {
      try {
        await this.settingsManager.processInterceptorDiscoveredAccounts()
      } catch (error) {
        logger.debug('Error in interceptor discovery timer:', 'extension', error as Error)
      }
    }, intervalMs)

    // 将定时器添加到扩展订阅中，确保扩展停用时清理
    this.context.subscriptions.push({
      dispose: () => clearInterval(intervalId)
    })

    logger.info(`Started interceptor discovery timer (${intervalMs}ms interval)`, 'extension')
  }
}