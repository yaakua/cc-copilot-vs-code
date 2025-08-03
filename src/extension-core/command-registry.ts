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
  }
}