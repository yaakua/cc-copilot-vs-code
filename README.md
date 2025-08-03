# CC Copilot - Claude Code CLI Manager

🤖 A powerful VS Code extension that provides a graphical interface for managing Claude Code CLI sessions and AI service providers.

## English

### ✨ Features

- **📊 Session Management**: View, create, and manage Claude CLI sessions directly from VS Code sidebar
- **🔄 Multi-Account Support**: Easily switch between different Claude accounts and third-party AI providers  
- **🌲 Tree View Integration**: Dedicated sidebar with organized tree view for session navigation
- **💻 Terminal Integration**: Create new Claude sessions and resume existing ones in integrated terminals
- **🔄 Auto-sync**: Automatically discovers and syncs with your existing Claude sessions
- **📁 Workspace Integration**: Prioritizes sessions related to your current workspace
- **⚙️ Configuration Management**: Manage API keys, proxy settings, and service providers
- **🔍 Advanced Monitoring**: Request interception for comprehensive account management
- **🌐 Proxy Support**: Built-in proxy configuration for network restrictions
- **🔌 Third-Party API Support**: Connect to various AI service providers beyond Claude

### 📋 Requirements

- [Claude CLI](https://github.com/anthropics/claude-code) must be installed and available in your PATH
- VS Code 1.74.0 or higher

### 🚀 Installation

1. Install the Claude CLI first following the [official guide](https://github.com/anthropics/claude-code)
2. Install this extension from the VS Code marketplace
3. The extension will automatically detect your Claude CLI installation

### 💡 Usage

#### Sidebar View
1. Look for the CC Copilot icon in the Activity Bar (left sidebar)
2. Click to open the Sessions view
3. Your existing Claude sessions will be automatically discovered and displayed

#### Managing AI Providers
1. Click the account selector in the sidebar
2. Add Claude official accounts or third-party API providers
3. Switch between different AI services seamlessly

#### Creating New Sessions
1. Click the "+" button next to any project
2. Choose your preferred AI provider
3. Start coding with Claude assistance

#### Configuration
1. Open VS Code settings (Cmd/Ctrl + ,)
2. Search for "CC Copilot"
3. Configure proxy settings, service providers, and more

---

## 中文

### ✨ 功能特色

- **📊 会话管理**: 直接在 VS Code 侧边栏中查看、创建和管理 Claude CLI 会话
- **🔄 多账户支持**: 轻松在不同的 Claude 账户和第三方 AI 提供商之间切换
- **🌲 树状视图集成**: 专用侧边栏，提供有序的树状视图进行会话导航
- **💻 终端集成**: 在集成终端中创建新的 Claude 会话并恢复现有会话
- **🔄 自动同步**: 自动发现并同步您现有的 Claude 会话
- **📁 工作区集成**: 优先显示与当前工作区相关的会话
- **⚙️ 配置管理**: 管理 API 密钥、代理设置和服务提供商
- **🔍 高级监控**: 请求拦截，实现全面的账户管理
- **🌐 代理支持**: 内置代理配置，应对网络限制
- **🔌 第三方 API 支持**: 连接 Claude 之外的各种 AI 服务提供商

### 📋 系统要求

- 必须安装 [Claude CLI](https://github.com/anthropics/claude-code) 并确保在 PATH 中可用
- VS Code 1.74.0 或更高版本

### 🚀 安装说明

1. 首先按照 [官方指南](https://github.com/anthropics/claude-code) 安装 Claude CLI
2. 从 VS Code 扩展市场安装此扩展
3. 扩展将自动检测您的 Claude CLI 安装

### 💡 使用方法

#### 侧边栏视图
1. 在活动栏（左侧边栏）中查找 CC Copilot 图标
2. 点击打开会话视图
3. 您现有的 Claude 会话将自动被发现并显示

#### 管理 AI 提供商
1. 点击侧边栏中的账户选择器
2. 添加 Claude 官方账户或第三方 API 提供商
3. 无缝切换不同的 AI 服务

#### 创建新会话
1. 点击任何项目旁边的"+"按钮
2. 选择您偏好的 AI 提供商
3. 开始使用 Claude 辅助编码

#### 配置设置
1. 打开 VS Code 设置（Cmd/Ctrl + ,）
2. 搜索"CC Copilot"
3. 配置代理设置、服务提供商等

### ⚙️ 配置选项

| 设置项 | 描述 | 默认值 |
|--------|------|--------|
| `ccCopilot.proxyConfig` | API 请求的代理配置 | `{"enabled": false, "url": "http://127.0.0.1:7890"}` |
| `ccCopilot.serviceProviders` | 服务提供商配置 | `[]` |
| `ccCopilot.activeServiceProviderId` | 当前活跃的服务提供商ID | `""` |

### 🛠️ 故障排除

#### Claude CLI 未找到
如果看到"Claude CLI not found"错误：

1. 确保已安装 Claude CLI：`npm install -g @anthropic/claude-code`
2. 验证它在 PATH 中：`which claude`（macOS/Linux）或 `where claude`（Windows）
3. 安装后重启 VS Code

#### 会话不显示
如果会话不显示：

1. 检查 `~/.claude/projects/` 中是否有会话
2. 使用"刷新会话"命令
3. 查看输出面板（查看 > 输出 > CC Copilot）中的错误消息

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📄 License

MIT License - see LICENSE file for details.