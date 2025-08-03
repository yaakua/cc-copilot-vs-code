import * as vscode from 'vscode'
import { SettingsManager } from '../settings'
import { SessionManager } from '../session-manager'
import { TerminalService } from '../terminal-service'
import { ClaudeSessionProvider } from '../treeProvider'
import { SessionCommands } from './session-commands'
import { ProviderCommands } from './provider-commands'
import { AccountCommands } from './account-commands'

export class CommandRegistry {
  private sessionCommands: SessionCommands
  private providerCommands: ProviderCommands
  private accountCommands: AccountCommands

  constructor(
    private context: vscode.ExtensionContext,
    private settingsManager: SettingsManager,
    private sessionManager: SessionManager,
    private terminalService: TerminalService,
    private sessionProvider: ClaudeSessionProvider
  ) {
    this.sessionCommands = new SessionCommands(
      context,
      settingsManager,
      sessionManager,
      terminalService,
      sessionProvider
    )
    
    this.providerCommands = new ProviderCommands(
      context,
      settingsManager
    )
    
    this.accountCommands = new AccountCommands(
      context,
      settingsManager,
      terminalService
    )
  }

  registerAllCommands(): void {
    this.sessionCommands.registerCommands()
    this.providerCommands.registerCommands()
    this.accountCommands.registerCommands()

    // Settings command
    const openSettingsCommand = vscode.commands.registerCommand('cc-copilot.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'ccCopilot')
    })
    this.context.subscriptions.push(openSettingsCommand)

    // More Actions dropdown command
    const showMoreActionsCommand = vscode.commands.registerCommand('cc-copilot.showMoreActions', async () => {
      const items: vscode.QuickPickItem[] = [
        {
          label: '$(refresh) Refresh Sessions',
          description: 'Refresh the session list',
          detail: 'cc-copilot.refreshSessions'
        },
        {
          label: '$(sync) Sync with Claude Directory',
          description: 'Sync sessions with Claude directory',
          detail: 'cc-copilot.syncWithClaude'
        },
        {
          label: '$(settings-gear) Open Settings',
          description: 'Open extension settings',
          detail: 'cc-copilot.openSettings'
        },
        {
          label: '$(add) Add Third Party AI Provider',
          description: 'Add a new third-party AI provider',
          detail: 'cc-copilot.addThirdPartyProvider'
        },
        {
          label: '$(account) Select Active AI Provider',
          description: 'Choose which AI provider to use',
          detail: 'cc-copilot.selectActiveProvider'
        },
        {
          label: '$(search) Discover Claude Accounts',
          description: 'Discover available Claude accounts',
          detail: 'cc-copilot.discoverClaudeAccounts'
        }
      ]

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an action to perform',
        title: 'Claude Copilot Actions'
      })

      if (selected && selected.detail) {
        await vscode.commands.executeCommand(selected.detail)
      }
    })
    this.context.subscriptions.push(showMoreActionsCommand)
  }
}