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
    this.registerRefreshSessionsCommand()
    this.registerOpenSessionCommand()
    this.registerDeleteSessionCommand()
    this.registerSyncWithClaudeCommand()
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
      })

      if (!sessionType) return

      if (sessionType.label === 'Standard Session') {
        await this.terminalService.createNewClaudeSession()
      } else {
        await this.terminalService.createClaudeSessionWithInterceptor()
      }
    })
    this.context.subscriptions.push(newSessionCommand)
  }

  private registerRefreshSessionsCommand(): void {
    const refreshSessionsCommand = vscode.commands.registerCommand('cc-copilot.refreshSessions', () => {
      this.sessionProvider.refresh()
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

  private registerSyncWithClaudeCommand(): void {
    const syncWithClaudeCommand = vscode.commands.registerCommand('cc-copilot.syncWithClaude', async () => {
      await this.sessionProvider.syncWithClaudeDirectory()
      vscode.window.showInformationMessage('Synced with Claude directory')
    })
    this.context.subscriptions.push(syncWithClaudeCommand)
  }
}