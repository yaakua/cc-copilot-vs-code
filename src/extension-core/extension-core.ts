import * as vscode from 'vscode'
import { ClaudeSessionProvider } from '../treeProvider'
import { SettingsManager } from '../settings'
import { SessionManager } from '../session-manager'
import { TerminalService } from '../terminal-service'
import { logger } from '../logger'
import { CommandRegistry } from './command-registry'

export class ExtensionCore {
  private settingsManager!: SettingsManager
  private sessionManager!: SessionManager
  private terminalService!: TerminalService
  private sessionProvider!: ClaudeSessionProvider
  private commandRegistry!: CommandRegistry

  constructor(private context: vscode.ExtensionContext) {
    this.initializeServices()
    this.setupTreeView()
    this.setupEventListeners()
    this.registerCommands()
  }

  private initializeServices(): void {
    logger.setContext(this.context)
    logger.info('Claude Companion extension activated', 'extension')
    
    this.settingsManager = new SettingsManager(this.context)
    this.sessionManager = new SessionManager(this.context, this.settingsManager)
    this.terminalService = new TerminalService(this.context, this.settingsManager)
    this.sessionProvider = new ClaudeSessionProvider(this.sessionManager, this.settingsManager)
  }

  private setupTreeView(): void {
    vscode.window.registerTreeDataProvider('claude-sessions-view', this.sessionProvider)
  }

  private setupEventListeners(): void {
    this.setupWorkspaceWatcher()
    this.setupFileWatcher()
    this.setupSettingsWatcher()
  }

  private setupWorkspaceWatcher(): void {
    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      logger.info('Workspace folders changed, refreshing sessions...', 'extension')
      this.sessionProvider.refresh()
    })
    this.context.subscriptions.push(workspaceWatcher)
  }

  private setupFileWatcher(): void {
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.jsonl')
    
    fileWatcher.onDidCreate(() => {
      logger.debug('JSONL file created, refreshing sessions...', 'extension')
      setTimeout(() => this.sessionProvider.refresh(), 500)
    })
    
    fileWatcher.onDidChange(() => {
      logger.debug('JSONL file changed, refreshing sessions...', 'extension')
      setTimeout(() => this.sessionProvider.refresh(), 500)
    })
    
    fileWatcher.onDidDelete(() => {
      logger.debug('JSONL file deleted, refreshing sessions...', 'extension')
      setTimeout(() => this.sessionProvider.refresh(), 500)
    })

    this.context.subscriptions.push(fileWatcher)
  }

  private setupSettingsWatcher(): void {
    this.settingsManager.on('claude-accounts:discovered', () => {
      logger.info('New Claude accounts discovered, refreshing tree view...', 'extension')
      this.sessionProvider.refresh()
    })

    this.settingsManager.on('service-providers:updated', () => {
      logger.info('Service providers updated, refreshing tree view...', 'extension')
      this.sessionProvider.refresh()
    })

    this.settingsManager.on('active-service-provider:changed', () => {
      logger.info('Active service provider changed, refreshing tree view...', 'extension')
      this.sessionProvider.refresh()
    })
  }

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

  public startInterceptorDiscoveryTimer(): void {
    const intervalMs = 10000
    const intervalId = setInterval(async () => {
      try {
        await this.settingsManager.processInterceptorDiscoveredAccounts()
      } catch (error) {
        logger.debug('Error in interceptor discovery timer:', 'extension', error as Error)
      }
    }, intervalMs)

    this.context.subscriptions.push({
      dispose: () => clearInterval(intervalId)
    })

    logger.info(`Started interceptor discovery timer (${intervalMs}ms interval)`, 'extension')
  }
}