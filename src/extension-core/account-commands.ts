import * as vscode from 'vscode'
import { SettingsManager } from '../settings'
import { TerminalService } from '../terminal-service'

export class AccountCommands {
  constructor(
    private context: vscode.ExtensionContext,
    private settingsManager: SettingsManager,
    private terminalService: TerminalService
  ) {}

  registerCommands(): void {
    this.registerDiscoverClaudeAccountsCommand()
    this.registerClaudeLoginCommand()
    this.registerReloginAccountCommand()
  }

  private registerDiscoverClaudeAccountsCommand(): void {
    const discoverClaudeAccountsCommand = vscode.commands.registerCommand('cc-copilot.discoverClaudeAccounts', async () => {
      try {
        vscode.window.showInformationMessage('Discovering Claude accounts...')
        const accounts = await this.settingsManager.refreshClaudeAccounts()
        
        if (accounts.length > 0) {
          vscode.window.showInformationMessage(`Discovered ${accounts.length} Claude account(s): ${accounts.map((a: any) => a.emailAddress).join(', ')}`)
        } else {
          const action = await vscode.window.showInformationMessage(
            'No Claude accounts found. Would you like to login to Claude?',
            'Login to Claude'
          )
          
          if (action === 'Login to Claude') {
            vscode.commands.executeCommand('cc-copilot.claudeLogin')
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to discover Claude accounts: ${(error as Error).message}`)
      }
    })
    this.context.subscriptions.push(discoverClaudeAccountsCommand)
  }

  private registerClaudeLoginCommand(): void {
    const claudeLoginCommand = vscode.commands.registerCommand('cc-copilot.claudeLogin', async () => {
      try {
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

        const action = await vscode.window.showQuickPick([
          {
            label: 'New Login',
            description: 'Login with a new Claude account',
            detail: 'This will open Claude login in a new terminal'
          },
          {
            label: 'Switch Account',
            description: 'Switch to a different Claude account',
            detail: 'Login with a different account than the current one'
          }
        ], {
          placeHolder: 'Choose login type'
        })

        if (!action) return

        await this.terminalService.executeClaudeLogin()
        
        setTimeout(async () => {
          try {
            const accounts = await this.settingsManager.refreshClaudeAccounts()
            if (accounts.length > 0) {
              vscode.window.showInformationMessage(`Login successful! Found account: ${accounts[accounts.length - 1].emailAddress}`)
            }
          } catch (error) {
            console.warn('Failed to refresh accounts after login:', error)
          }
        }, 3000)
        
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to execute Claude login: ${(error as Error).message}`)
      }
    })
    this.context.subscriptions.push(claudeLoginCommand)
  }

  private registerReloginAccountCommand(): void {
    const reloginAccountCommand = vscode.commands.registerCommand('cc-copilot.reloginAccount', async (emailAddress?: string) => {
      try {
        if (!emailAddress) {
          const providers = this.settingsManager.getServiceProviders()
          const claudeProvider = providers.find((p: any) => p.type === 'claude_official')
          
          if (!claudeProvider || claudeProvider.accounts.length === 0) {
            vscode.window.showInformationMessage('No Claude accounts found to re-login.')
            return
          }

          const accounts = claudeProvider.accounts as any[]
          const quickPickItems = accounts.map((account: any) => ({
            label: account.emailAddress,
            description: account.organizationName || 'Unknown organization',
            detail: account.authorization ? 'Has token' : 'No token - needs re-login',
            emailAddress: account.emailAddress
          }))

          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select account to re-login'
          })

          if (!selected) return
          emailAddress = selected.emailAddress
        }

        const isAvailable = await this.terminalService.checkClaudeAvailability()
        if (!isAvailable) {
          vscode.window.showErrorMessage('Claude CLI is not available.')
          return
        }

        vscode.window.showInformationMessage(`Re-logging in to account: ${emailAddress}`)
        
        await this.terminalService.executeClaudeLogin()
        
        setTimeout(async () => {
          try {
            const accounts = await this.settingsManager.refreshClaudeAccounts()
            const account = accounts.find((a: any) => a.emailAddress === emailAddress)
            if (account && account.authorization) {
              vscode.window.showInformationMessage(`Re-login successful for account: ${emailAddress}`)
            }
          } catch (error) {
            console.warn('Failed to refresh accounts after re-login:', error)
          }
        }, 3000)
        
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to re-login account: ${(error as Error).message}`)
      }
    })
    this.context.subscriptions.push(reloginAccountCommand)
  }
}