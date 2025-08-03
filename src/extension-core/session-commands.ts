import * as vscode from 'vscode'
import { SettingsManager } from '../settings'
import { SessionManager } from '../session-manager'
import { TerminalService } from '../terminal-service'
import { ClaudeSessionProvider } from '../treeProvider'

export class SessionCommands {
  constructor(
    private context: vscode.ExtensionContext,
    private settingsManager: SettingsManager,
    private sessionManager: SessionManager,
    private terminalService: TerminalService,
    private sessionProvider: ClaudeSessionProvider
  ) {}

  registerCommands(): void {
    this.registerNewSessionCommand()
    this.registerNewSessionForProjectCommand()
    this.registerRefreshSessionsCommand()
    this.registerOpenSessionCommand()
    this.registerDeleteSessionCommand()
    this.registerLoadMoreSessionsCommand()
  }

  private registerNewSessionCommand(): void {
    const newSessionCommand = vscode.commands.registerCommand('cc-copilot.newSession', async () => {
      const isAvailable = await this.terminalService.checkClaudeAvailability()
      if (!isAvailable) {
        const result = await vscode.window.showErrorMessage(
          'Claude CLI is not installed or not found in PATH.',
          'Open Installation Guide'
        )
        if (result === 'Open Installation Guide') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/anthropics/claude-code'))
        }
        return
      }

      // 直接创建标准会话，不显示选择对话框
      await this.terminalService.createNewClaudeSession()
    })
    this.context.subscriptions.push(newSessionCommand)
  }

  private registerNewSessionForProjectCommand(): void {
    const newSessionForProjectCommand = vscode.commands.registerCommand('cc-copilot.newSessionForProject', async (item) => {
      // 检查Claude CLI可用性
      const isAvailable = await this.terminalService.checkClaudeAvailability()
      if (!isAvailable) {
        const result = await vscode.window.showErrorMessage(
          'Claude CLI is not installed or not found in PATH.',
          'Open Installation Guide'
        )
        if (result === 'Open Installation Guide') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/anthropics/claude-code'))
        }
        return
      }

      // 获取项目信息
      let projectPath = ''
      let projectName = 'Unknown'
      
      if (item && item.project) {
        projectPath = item.project.path
        projectName = item.project.name
      } else {
        // 如果没有传递项目信息，使用当前工作区
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (workspaceFolder) {
          projectPath = workspaceFolder.uri.fsPath
          projectName = workspaceFolder.name
        }
      }

      // 直接创建标准会话，不显示选择对话框
      await this.terminalService.createNewClaudeSession()

      // 刷新会话列表
      setTimeout(() => {
        this.sessionProvider.refresh()
      }, 1000)
    })
    this.context.subscriptions.push(newSessionForProjectCommand)
  }

  private registerRefreshSessionsCommand(): void {
    const refreshSessionsCommand = vscode.commands.registerCommand('cc-copilot.refreshSessions', async () => {
      await this.sessionProvider.syncWithClaudeDirectory()
      vscode.window.showInformationMessage('Sessions refreshed')
    })
    this.context.subscriptions.push(refreshSessionsCommand)
  }

  private registerOpenSessionCommand(): void {
    const openSessionCommand = vscode.commands.registerCommand('cc-copilot.openSession', async (item) => {
      if (item && item.sessionId && item.session?.filePath) {
        const isAvailable = await this.terminalService.checkClaudeAvailability()
        if (!isAvailable) {
          vscode.window.showErrorMessage('Claude CLI is not available.')
          return
        }

        await this.terminalService.resumeClaudeSession(item.session.filePath)
      } else {
        vscode.window.showErrorMessage('Session file path not found.')
      }
    })
    this.context.subscriptions.push(openSessionCommand)
  }

  private registerDeleteSessionCommand(): void {
    const deleteSessionCommand = vscode.commands.registerCommand('cc-copilot.deleteSession', async (item) => {
      if (item && item.sessionId) {
        const result = await vscode.window.showWarningMessage(
          `Are you sure you want to delete session "${item.session?.name || item.sessionId}"?`,
          { modal: true },
          'Delete'
        )
        
        if (result === 'Delete') {
          this.sessionProvider.deleteSession(item.sessionId)
          vscode.window.showInformationMessage('Session deleted')
        }
      }
    })
    this.context.subscriptions.push(deleteSessionCommand)
  }


  private registerLoadMoreSessionsCommand(): void {
    const loadMoreSessionsCommand = vscode.commands.registerCommand('cc-copilot.loadMoreSessions', async (item) => {
      if (item && item.projectId) {
        this.sessionProvider.loadMoreSessions(item.projectId)
      }
    })
    this.context.subscriptions.push(loadMoreSessionsCommand)
  }
}