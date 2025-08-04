import * as vscode from 'vscode'
import { UnifiedConfigManager } from '../shared/config-manager'
import { SessionManager } from '../session-manager'
import { TerminalService } from '../terminal-service'
import { ClaudeSessionProvider } from '../treeProvider'
import { SessionCommands } from './session-commands'
import { ProviderCommands } from './provider-commands'
import { AccountCommands } from './account-commands'

/**
 * 命令注册器类
 * 负责注册和管理扩展的所有VSCode命令
 * 将命令按功能分组到不同的命令处理器中
 */
export class CommandRegistry {
  /** 会话相关命令处理器 */
  private sessionCommands: SessionCommands
  /** 服务提供商相关命令处理器 */
  private providerCommands: ProviderCommands
  /** 账号相关命令处理器 */
  private accountCommands: AccountCommands

  /**
   * 构造函数
   * @param context - VSCode扩展上下文
   * @param configManager - 统一配置管理器
   * @param sessionManager - 会话管理器
   * @param terminalService - 终端服务
   * @param sessionProvider - 会话树形视图提供器
   */
  constructor(
    private context: vscode.ExtensionContext,
    private configManager: UnifiedConfigManager,
    private sessionManager: SessionManager,
    private terminalService: TerminalService,
    private sessionProvider: ClaudeSessionProvider
  ) {
    // 初始化会话命令处理器
    this.sessionCommands = new SessionCommands(
      context,
      configManager,
      sessionManager,
      terminalService,
      sessionProvider
    )

    // 初始化服务提供商命令处理器
    this.providerCommands = new ProviderCommands(
      context,
      configManager
    )

    // 初始化账号命令处理器
    this.accountCommands = new AccountCommands(
      context,
      configManager,
      terminalService
    )
  }

  /**
   * 注册所有命令
   * 调用各个命令处理器的注册方法，并注册通用命令
   */
  registerAllCommands(): void {
    // 注册各类命令
    this.sessionCommands.registerCommands()
    this.providerCommands.registerCommands()
    this.accountCommands.registerCommands()

    // 注册设置命令
    const openSettingsCommand = vscode.commands.registerCommand('cc-copilot.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'ccCopilot')
    })
    this.context.subscriptions.push(openSettingsCommand)

    // 注册更多操作下拉菜单命令
    const showMoreActionsCommand = vscode.commands.registerCommand('cc-copilot.showMoreActions', async () => {
      const items: vscode.QuickPickItem[] = [
        {
          label: '$(refresh) Refresh Sessions',
          description: 'Refresh the session list',
          detail: 'cc-copilot.refreshSessions'
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
          label: '$(search) Discover Claude Accounts',
          description: 'Discover available Claude accounts',
          detail: 'cc-copilot.discoverClaudeAccounts'
        }
      ]

      // 显示快速选择菜单
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an action to perform',
        title: 'Claude Copilot Actions'
      })

      // 执行选中的命令
      if (selected && selected.detail) {
        await vscode.commands.executeCommand(selected.detail)
      }
    })
    this.context.subscriptions.push(showMoreActionsCommand)

    // 注册账号菜单命令
    const showAccountMenuCommand = vscode.commands.registerCommand('cc-copilot.showAccountMenu', async () => {
      const items: vscode.QuickPickItem[] = [
        {
          label: '$(account) Select Active AI Provider',
          description: 'Choose which AI provider to use',
          detail: 'cc-copilot.selectActiveProvider'
        },
        {
          label: '$(add) Add Third Party AI Provider',
          description: 'Add a new third-party AI provider',
          detail: 'cc-copilot.addThirdPartyProvider'
        },
        {
          label: '$(search) Discover Claude Accounts',
          description: 'Discover available Claude accounts',
          detail: 'cc-copilot.discoverClaudeAccounts'
        },
        {
          label: '$(sign-in) Login to Claude',
          description: 'Login to Claude with a new account',
          detail: 'cc-copilot.claudeLogin'
        },
        {
          label: '$(refresh) Re-login Account',
          description: 'Re-login an existing Claude account',
          detail: 'cc-copilot.reloginAccount'
        },
        {
          label: '$(settings-gear) Open Settings',
          description: 'Open extension settings',
          detail: 'cc-copilot.openSettings'
        }
      ]

      // 显示账号管理快速选择菜单
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an account management action',
        title: 'Account Management'
      })

      // 执行选中的账号管理命令
      if (selected && selected.detail) {
        await vscode.commands.executeCommand(selected.detail)
      }
    })
    this.context.subscriptions.push(showAccountMenuCommand)

    // 注册添加账号命令
    const addAccountCommand = vscode.commands.registerCommand('cc-copilot.addAccount', async () => {
      // 显示账号类型选择菜单
      const accountType = await vscode.window.showQuickPick([
        {
          label: '$(account) Claude Official',
          description: 'Add a Claude.ai official account',
          detail: 'claude'
        },
        {
          label: '$(link-external) Third Party API',
          description: 'Add a third-party API provider',
          detail: 'third-party'
        }
      ], {
        placeHolder: 'Select account type to add',
        title: 'Add New Account'
      })

      // 根据选择的账号类型执行相应的命令
      if (accountType) {
        if (accountType.detail === 'claude') {
          // 执行Claude官方账号登录命令
          await vscode.commands.executeCommand('cc-copilot.claudeLogin')
        } else if (accountType.detail === 'third-party') {
          // 执行添加第三方提供商命令
          await vscode.commands.executeCommand('cc-copilot.addThirdPartyProvider')
        }
      }
    })
    this.context.subscriptions.push(addAccountCommand)
  }
}