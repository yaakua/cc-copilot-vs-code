# Claude CLI Companion

A VS Code extension that provides a graphical interface for managing Claude CLI sessions.

## Features

- **Session Management**: View, create, and manage Claude CLI sessions directly from VS Code
- **Sidebar Integration**: Dedicated sidebar with tree view for easy session navigation
- **Terminal Integration**: Create new Claude sessions and resume existing ones in integrated terminals
- **Auto-sync**: Automatically discovers and syncs with your existing Claude sessions
- **Workspace Integration**: Prioritizes sessions related to your current workspace
- **Configuration Management**: Manage API keys, proxy settings, and service providers
- **Request Interception**: Advanced session monitoring for account management

## Requirements

- [Claude CLI](https://github.com/anthropics/claude-code) must be installed and available in your PATH
- VS Code 1.74.0 or higher

## Installation

1. Install the Claude CLI first following the [official guide](https://github.com/anthropics/claude-code)
2. Install this extension from the VS Code marketplace
3. The extension will automatically detect your Claude CLI installation

## Usage

### Sidebar View

1. Look for the Claude Companion icon in the Activity Bar (left sidebar)
2. Click to open the Claude Sessions view
3. Your existing Claude sessions will be automatically discovered and displayed

### Creating New Sessions

1. Click the "+" button in the Claude Sessions view title bar
2. Choose between:
   - **Standard Session**: Basic Claude session
   - **Intercepted Session**: Advanced session with request monitoring

### Opening Existing Sessions

1. In the Claude Sessions view, click on any session to resume it
2. The session will open in a new terminal tab

### Configuration

1. Open VS Code settings (Cmd/Ctrl + ,)
2. Search for "Claude Companion"
3. Configure:
   - Proxy settings
   - Service providers
   - Terminal preferences
   - Project filtering

## Commands

- `Claude Companion: New Session` - Create a new Claude session
- `Claude Companion: Refresh Sessions` - Refresh the session list
- `Claude Companion: Sync with Claude Directory` - Manually sync with ~/.claude directory
- `Claude Companion: Open Settings` - Open extension settings

## Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `claudeCompanion.proxyConfig` | Proxy configuration for API requests | `{"enabled": false, "url": "http://127.0.0.1:1087"}` |
| `claudeCompanion.terminal.skipPermissions` | Skip permission checks when creating sessions | `true` |
| `claudeCompanion.projectFilter.hiddenDirectories` | Directories to hide from project list | Common build/cache directories |

## Troubleshooting

### Claude CLI Not Found

If you see "Claude CLI not found" errors:

1. Ensure Claude CLI is installed: `npm install -g @anthropic/claude-code`
2. Verify it's in your PATH: `which claude` (macOS/Linux) or `where claude` (Windows)
3. Restart VS Code after installation

### Sessions Not Appearing

If your sessions don't appear:

1. Check that you have sessions in `~/.claude/projects/`
2. Use "Sync with Claude Directory" command
3. Check the Output panel (View > Output > Claude Companion) for error messages

### Permission Issues

If you encounter permission issues:

1. Try enabling "Skip Permissions" in settings
2. Use the `--dangerously-skip-permissions` flag with Claude CLI manually first

## Development

To run this extension in development mode:

 1. 安装依赖

  npm install

  2. 编译TypeScript代码

  npm run compile

  3. 在VS Code中调试

  1. 打开项目文件夹
  2. 按 F5 或者点击"运行和调试" → "Run Extension"
  3. 这会启动一个新的VS Code窗口（Extension Development Host）

  4. 实时编译（可选）

  在开发过程中，你可以运行以下命令来监听文件变化并自动编译：
  npm run watch

  调试配置说明

  项目已经配置好了调试环境（.vscode/launch.json:5-15），包含：
  - name: "Run Extension" - 调试配置名称
  - type: "extensionHost" - VS Code插件调试类型
  - outFiles: 编译后的JavaScript文件路径
  - preLaunchTask: 启动前自动编译代码

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - see LICENSE file for details.