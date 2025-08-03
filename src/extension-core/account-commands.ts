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
    this.registerRefreshAccountsCommand()
    this.registerSelectAccountCommand()
    this.registerDebugAccountStatusCommand()
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

  private registerRefreshAccountsCommand(): void {
    const refreshAccountsCommand = vscode.commands.registerCommand('cc-copilot.refreshAccounts', async () => {
      try {
        vscode.window.showInformationMessage('Refreshing all accounts...')
        
        // 刷新Claude官方账号
        const claudeAccounts = await this.settingsManager.refreshClaudeAccounts()
        
        // 获取所有服务提供商信息
        const allProviders = this.settingsManager.getServiceProviders()
        const claudeProvider = allProviders.find((p: any) => p.type === 'claude_official')
        const thirdPartyProviders = allProviders.filter((p: any) => p.type === 'third_party')
        
        let totalAccounts = claudeAccounts.length
        let providersCount = thirdPartyProviders.length
        
        if (claudeProvider && claudeAccounts.length > 0) {
          providersCount += 1
        }
        
        // 计算第三方账号总数
        thirdPartyProviders.forEach((provider: any) => {
          totalAccounts += provider.accounts?.length || 0
        })
        
        vscode.window.showInformationMessage(
          `Account refresh completed! Found ${totalAccounts} account(s) across ${providersCount} provider(s).`
        )
        
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to refresh accounts: ${(error as Error).message}`)
      }
    })
    this.context.subscriptions.push(refreshAccountsCommand)
  }

  private registerSelectAccountCommand(): void {
    const selectAccountCommand = vscode.commands.registerCommand('cc-copilot.selectAccount', async (args?: { providerId: string, accountId: string }) => {
      try {
        if (!args) {
          vscode.window.showErrorMessage('Invalid account selection parameters')
          return
        }

        const { providerId, accountId } = args
        
        // 保存当前活动账号，以便失败时回退
        const previousActiveAccount = this.settingsManager.getCurrentActiveAccount()
        
        // 获取目标账号信息
        const providers = this.settingsManager.getServiceProviders()
        const provider = providers.find((p: any) => p.id === providerId)
        
        if (!provider) {
          vscode.window.showErrorMessage('Provider not found')
          return
        }

        let targetAccount: any = null
        let accountDisplayName = ''
        
        if (provider.type === 'claude_official') {
          const claudeAccounts = provider.accounts as any[]
          targetAccount = claudeAccounts.find((a: any) => a.emailAddress === accountId)
          accountDisplayName = targetAccount ? targetAccount.emailAddress : accountId
        } else {
          const thirdPartyAccounts = provider.accounts as any[]
          targetAccount = thirdPartyAccounts.find((a: any) => a.id === accountId)
          accountDisplayName = targetAccount ? targetAccount.name : accountId
        }

        if (!targetAccount) {
          vscode.window.showErrorMessage('Target account not found')
          return
        }

        // 打印调试信息
        console.log('🔄 Account switch requested:', { providerId, accountId, accountDisplayName });
        console.log('🔄 Target account info:', targetAccount);
        console.log('🔄 Previous active account:', previousActiveAccount);

        // 显示切换进度
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Switching to ${accountDisplayName}...`,
          cancellable: false
        }, async (progress) => {
          
          progress.report({ increment: 20, message: 'Setting active account...' })
          console.log('🔄 Step 1: Setting active account...');
          
          // 设置新的活动账号
          await this.settingsManager.setActiveAccount(providerId, accountId)
          console.log('✅ Active account set successfully');
          
          // 验证账号是否已经切换
          const newActiveAccount = this.settingsManager.getCurrentActiveAccount();
          console.log('🔍 New active account after switch:', newActiveAccount);
          
          // 检查是否为Claude官方账号且没有token
          if (provider.type === 'claude_official' && !targetAccount.authorization) {
            progress.report({ increment: 30, message: 'Verifying account token...' })
            console.log('🔍 Step 2: Claude official account without token, starting verification...');
            console.log('🔍 Target account authorization status:', !!targetAccount.authorization);
            
            // 创建隐藏会话来获取token
            console.log('🚀 Creating hidden test session...');
            const tokenObtained = await this.terminalService.createHiddenTestSession('hi')
            console.log('🔍 Token obtained result:', tokenObtained);
            
            if (tokenObtained) {
              progress.report({ increment: 100, message: 'Account switch successful!' })
              console.log('✅ Token verification successful!');
              
              // 再次验证最终状态
              const finalAccount = this.settingsManager.getCurrentActiveAccount();
              console.log('🔍 Final account state:', finalAccount);
              
              setTimeout(() => {
                vscode.window.showInformationMessage(
                  `✅ Successfully switched to ${accountDisplayName}!\n\nToken obtained and ready to use.`
                )
              }, 500)
            } else {
              progress.report({ increment: 50, message: 'Token verification failed, reverting...' })
              console.log('❌ Token verification failed, reverting to previous account...');
              
              // 回退到原来的账号
              if (previousActiveAccount) {
                console.log('🔄 Reverting to previous account:', previousActiveAccount);
                await this.settingsManager.setActiveAccount(
                  previousActiveAccount.provider.id, 
                  previousActiveAccount.provider.type === 'claude_official' 
                    ? (previousActiveAccount.account as any).emailAddress 
                    : (previousActiveAccount.account as any).id
                )
                console.log('✅ Successfully reverted to previous account');
              }
              
              progress.report({ increment: 100, message: 'Account switch failed' })
              
              setTimeout(() => {
                vscode.window.showErrorMessage(
                  `❌ Failed to switch to ${accountDisplayName}!\n\nThe account may not be logged in or token is invalid. Please try logging in again.`,
                  'Login to Claude'
                ).then(action => {
                  if (action === 'Login to Claude') {
                    vscode.commands.executeCommand('cc-copilot.claudeLogin')
                  }
                })
              }, 500)
            }
          } else {
            // 第三方账号或已有token的Claude账号，直接切换成功
            progress.report({ increment: 100, message: 'Account switch successful!' })
            console.log('✅ Account switch successful (third-party or has existing token)');
            console.log('🔍 Account has token:', !!targetAccount.authorization);
            
            setTimeout(() => {
              vscode.window.showInformationMessage(
                `✅ Successfully switched to ${provider.type === 'claude_official' ? 'Claude Official' : provider.name}: ${accountDisplayName}`
              )
            }, 500)
          }
        })
        
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to select account: ${(error as Error).message}`)
      }
    })
    this.context.subscriptions.push(selectAccountCommand)
  }

  private registerDebugAccountStatusCommand(): void {
    const debugCommand = vscode.commands.registerCommand('cc-copilot.debugAccountStatus', async () => {
      try {
        console.log('🔍 ===== Account Status Debug Report =====');
        
        // 1. 检查当前活动账号
        const currentAccount = this.settingsManager.getCurrentActiveAccount();
        console.log('📋 Current Active Account:', currentAccount);
        
        if (currentAccount) {
          const account = currentAccount.account as any;
          console.log(`📧 Account: ${account.emailAddress || account.name}`);
          console.log(`🔑 Has Token: ${!!account.authorization}`);
          if (account.authorization) {
            console.log(`🔑 Token Preview: ${account.authorization.substring(0, 30)}...`);
          }
        }

        // 2. 检查所有账号
        const providers = this.settingsManager.getServiceProviders();
        console.log('🔍 All Service Providers:', providers.length);
        
        providers.forEach((provider: any, index: number) => {
          console.log(`\n📦 Provider ${index + 1}:`);
          console.log(`  - ID: ${provider.id}`);
          console.log(`  - Type: ${provider.type}`);
          console.log(`  - Name: ${provider.name}`);
          console.log(`  - Active Account ID: ${provider.activeAccountId}`);
          console.log(`  - Accounts Count: ${provider.accounts?.length || 0}`);
          
          if (provider.accounts) {
            provider.accounts.forEach((acc: any, accIndex: number) => {
              console.log(`    Account ${accIndex + 1}:`);
              console.log(`      - Email/Name: ${acc.emailAddress || acc.name}`);
              console.log(`      - Has Token: ${!!acc.authorization}`);
              if (acc.authorization) {
                console.log(`      - Token Preview: ${acc.authorization.substring(0, 30)}...`);
              }
            });
          }
        });

        // 3. 检查Claude CLI配置
        const os = require('os');
        const path = require('path');
        const fs = require('fs');
        
        const claudeConfigPath = path.join(os.homedir(), '.anthropic', 'claude-cli', 'config.json');
        console.log(`\n📁 Claude CLI Config Path: ${claudeConfigPath}`);
        console.log(`📁 Config Exists: ${fs.existsSync(claudeConfigPath)}`);
        
        if (fs.existsSync(claudeConfigPath)) {
          try {
            const configContent = fs.readFileSync(claudeConfigPath, 'utf-8');
            const config = JSON.parse(configContent);
            console.log(`📧 CLI Account Email: ${config.account?.email || 'none'}`);
            console.log(`🔑 CLI Has Session Key: ${!!config.account?.session_key}`);
            if (config.account?.session_key) {
              console.log(`🔑 CLI Session Key Preview: ${config.account.session_key.substring(0, 30)}...`);
            }
          } catch (error) {
            console.log(`❌ Error reading CLI config: ${error.message}`);
          }
        }

        // 4. 检查扩展配置文件
        const userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'CC Copilot');
        const settingsPath = path.join(userDataPath, 'settings.json');
        console.log(`\n📁 Extension Settings Path: ${settingsPath}`);
        console.log(`📁 Settings Exists: ${fs.existsSync(settingsPath)}`);

        console.log('\n🔍 ===== Debug Report Complete =====');
        
        vscode.window.showInformationMessage('Account debug information has been logged to the console. Check the Developer Console for details.');
        
      } catch (error) {
        console.error('❌ Error in debug command:', error);
        vscode.window.showErrorMessage(`Debug command failed: ${(error as Error).message}`);
      }
    });
    
    this.context.subscriptions.push(debugCommand);
  }
}