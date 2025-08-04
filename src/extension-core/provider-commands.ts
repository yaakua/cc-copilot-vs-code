import * as vscode from 'vscode'
import { UnifiedConfigManager } from '../shared/config-manager'

export class ProviderCommands {
  constructor(
    private context: vscode.ExtensionContext,
    private configManager: UnifiedConfigManager
  ) {}

  registerCommands(): void {
    this.registerAddThirdPartyProviderCommand()
    this.registerSelectActiveProviderCommand()
  }

  private registerAddThirdPartyProviderCommand(): void {
    const addThirdPartyProviderCommand = vscode.commands.registerCommand('cc-copilot.addThirdPartyProvider', async () => {
      const providerName = await vscode.window.showInputBox({
        prompt: 'Enter the provider name (e.g., "OpenAI", "Anthropic Compatible")',
        placeHolder: 'Provider Name'
      })
      
      if (!providerName) return

      const accountName = await vscode.window.showInputBox({
        prompt: 'Enter the account name',
        placeHolder: 'Account Name'
      })
      
      if (!accountName) return

      const baseUrl = await vscode.window.showInputBox({
        prompt: 'Enter the base URL for the API',
        placeHolder: 'https://api.example.com/v1'
      })
      
      if (!baseUrl) return

      const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter the API key',
        placeHolder: 'your-api-key-here',
        password: true
      })
      
      if (!apiKey) return

      const description = await vscode.window.showInputBox({
        prompt: 'Enter an optional description',
        placeHolder: 'Optional description'
      })

      try {
        const account = {
          id: `account_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          name: accountName,
          apiKey: apiKey,
          baseUrl: baseUrl,
          description: description || ''
        }

        await this.configManager.createThirdPartyProvider(providerName, account)
        vscode.window.showInformationMessage(`Third party provider "${providerName}" added successfully!`)
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to add provider: ${(error as Error).message}`)
      }
    })
    this.context.subscriptions.push(addThirdPartyProviderCommand)
  }

  private registerSelectActiveProviderCommand(): void {
    const selectActiveProviderCommand = vscode.commands.registerCommand('cc-copilot.selectActiveProvider', async () => {
      const options = this.configManager.getAllProviderOptions()
      
      if (options.length === 0) {
        const action = await vscode.window.showInformationMessage(
          'No AI providers configured. Please add a third-party provider or configure Claude Official first.',
          'Discover Claude Accounts',
          'Add Third Party Provider'
        )
        
        if (action === 'Discover Claude Accounts') {
          vscode.commands.executeCommand('cc-copilot.discoverClaudeAccounts')
        } else if (action === 'Add Third Party Provider') {
          vscode.commands.executeCommand('cc-copilot.addThirdPartyProvider')
        }
        return
      }

      const currentActiveId = this.configManager.getCurrentActiveCompositeId()
      
      const quickPickItems = options.map((option: any) => ({
        label: option.label,
        description: option.description,
        detail: option.id === currentActiveId ? '• Currently Active' : '',
        id: option.id
      })) as any[]

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select an AI provider to activate'
      })

      if (selected) {
        try {
          await this.configManager.setActiveProviderByCompositeId((selected as any).id)
          vscode.window.showInformationMessage(`Active provider set to: ${(selected as any).label}`)
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to set active provider: ${(error as Error).message}`)
        }
      }
    })
    this.context.subscriptions.push(selectActiveProviderCommand)
  }
}