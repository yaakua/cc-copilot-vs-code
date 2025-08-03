
## **VSCode Claude CLI 伴侣插件：开发技术文档**

### **1. 项目概述与目标**

本项目旨在开发一个 VSCode 插件，作为 `claude-cli`（一个假设存在的命令行工具）的图形化前端。它允许用户在 VSCode 中直接管理和交互 Claude 会话，无缝地将强大的命令行工具与现代化的编辑器体验结合起来。

**核心功能:**

*   **侧边栏视图**: 在活动栏提供一个专用图标，点击后以树状视图展示所有与当前工作区关联的 Claude 会话。
*   **会话管理**: 支持在编辑器区域以终端标签页的形式创建新会话和恢复历史会话。
*   **配置中心**: 提供设置界面，方便用户配置 API Key 和切换不同的服务提供商。
*   **智能集成**: 自动检测 `claude` 命令位置，并深度集成终端，实现对会话生命周期的监控。

### **2. 准备工作：开发环境搭建**

在开始编码之前，请确保您的电脑上安装了以下工具：

1.  **[Visual Studio Code](https://code.visualstudio.com/)**: 我们的目标开发平台。
2.  **[Node.js](https://nodejs.org/) (LTS 版本)**: VSCode 插件是基于 Node.js 运行的，请确保已安装并配置好环境变量。
3.  **Yeoman 和 VS Code Extension Generator**: 这是官方推荐的插件项目脚手架工具。

打开您的终端（不是 VSCode 内的），运行以下命令来安装脚手架：

```bash
npm install -g yo generator-code
```

### **3. Part 1: 项目初始化与结构**

1.  **生成项目骨架**:
    在终端里，进入您想存放代码的目录，然后运行：
    ```bash
    yo code
    ```

2.  **回答脚手架问题**:
    *   `What type of extension do you want to create?` -> **New Extension (TypeScript)** (强烈推荐，类型安全对大项目至关重要)
    *   `What's the name of your extension?` -> `claude-cli-companion` (或您喜欢的名字)
    *   `What's the identifier of your extension?` -> `claude-cli-companion` (通常同上)
    *   `What's the description of your extension?` -> `A companion for managing Claude CLI sessions in VS Code.`
    *   `Initialize a git repository?` -> **Yes**
    *   `Bundle the source code with webpack?` -> **Yes** (推荐，可提升性能)
    *   `Which package manager to use?` -> **npm** 或 **yarn**

    脚手架会自动创建一个新文件夹，并安装好所有初始依赖。用 VSCode 打开这个新创建的文件夹。

3.  **熟悉项目文件**:
    *   `src/extension.ts`: 这是您插件的入口文件。`activate` 函数是插件被激活时执行的，`deactivate` 是插件被禁用时执行的。
    *   `package.json`: 插件的清单文件。定义了插件的名称、版本、命令、UI贡献点（如图标、视图）等。这是整个插件的“蓝图”。
    *   `node_modules/`: 项目依赖。
    *   `.vscode/launch.json`: 按 `F5` 键可以启动一个“扩展开发宿主”窗口，用于调试您的插件。

### **4. Part 2: 侧边栏 UI - 活动栏图标与树视图**

我们的第一个任务是创建用户能看到的界面。

1.  **在 `package.json` 中声明 UI**:
    找到 `contributes` 字段（如果没有就创建一个），并添加以下内容：

    ```json
    // package.json
    "contributes": {
      "viewsContainers": {
        "activitybar": [
          {
            "id": "claude-companion-sidebar",
            "title": "Claude Companion",
            "icon": "media/claude-icon.svg" // 稍后创建这个图标
          }
        ]
      },
      "views": {
        "claude-companion-sidebar": [
          {
            "id": "claude-projects-view",
            "name": "Sessions",
            "type": "tree"
          }
        ]
      },
      "commands": [
        {
          "command": "claude-companion.newSession",
          "title": "New Claude Session",
          "icon": "$(add)"
        },
        {
          "command": "claude-companion.refreshSessions",
          "title": "Refresh Sessions",
          "icon": "$(refresh)"
        }
      ],
      "menus": {
        "view/title": [
          {
            "command": "claude-companion.newSession",
            "when": "view == claude-projects-view",
            "group": "navigation"
          },
          {
            "command": "claude-companion.refreshSessions",
            "when": "view == claude-projects-view",
            "group": "navigation"
          }
        ]
      }
    }
    ```
    *   `viewsContainers`: 在最左侧的活动栏中创建了一个新的容器。
    *   `icon`: 指向一个 SVG 图标。您需要在项目根目录创建一个 `media` 文件夹，并放入一个名为 `claude-icon.svg` 的图标文件。
    *   `views`: 在我们刚刚创建的容器里，定义了一个 ID 为 `claude-projects-view` 的树视图。
    *   `commands` 和 `menus`: 定义了“新建会话”和“刷新”两个命令，并把它们作为图标按钮显示在树视图的标题栏上。

2.  **创建树视图的数据提供者 (TreeDataProvider)**:
    这是视图的核心逻辑，它告诉 VSCode 该显示哪些项目，以及这些项目长什么样。

    在 `src` 目录下新建一个文件 `ClaudeSessionProvider.ts`:

    ```typescript
    // src/ClaudeSessionProvider.ts
    import * as vscode from 'vscode';
    import * as fs from 'fs';
    import * as path from 'path';
    import * as os from 'os';

    // 定义会话的数据结构
    export interface ClaudeSession {
        id: string; // 会话文件名，如 'session-xxx.jsonl'
        label: string; // 显示在列表中的名称，如 'Session: Refactor code'
        collapsibleState: vscode.TreeItemCollapsibleState;
        command?: vscode.Command; // 点击时执行的命令
        // 其他你需要的元数据
        filePath: string;
        projectId: string; // 所属项目ID (文件夹名)
    }

    export class ClaudeSessionProvider implements vscode.TreeDataProvider<ClaudeSession> {
        
        private _onDidChangeTreeData: vscode.EventEmitter<ClaudeSession | undefined | null | void> = new vscode.EventEmitter<ClaudeSession | undefined | null | void>();
        readonly onDidChangeTreeData: vscode.Event<ClaudeSession | undefined | null | void> = this._onDidChangeTreeData.event;

        constructor(private workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined) {}

        refresh(): void {
            this._onDidChangeTreeData.fire();
        }

        getTreeItem(element: ClaudeSession): vscode.TreeItem {
            return element;
        }

        getChildren(element?: ClaudeSession): Thenable<ClaudeSession[]> {
            if (element) {
                // 如果有子节点，在这里返回。我们的例子是扁平的，所以返回空
                return Promise.resolve([]);
            } else {
                // 返回根节点
                return Promise.resolve(this.getSessionsForWorkspace());
            }
        }

        private async getSessionsForWorkspace(): Promise<ClaudeSession[]> {
            if (!this.workspaceFolders) {
                vscode.window.showInformationMessage('No workspace open.');
                return [];
            }
            
            // 核心逻辑：扫描 ~/.claude/projects/
            const claudeRoot = path.join(os.homedir(), '.claude', 'projects');
            if (!fs.existsSync(claudeRoot)) {
                return []; // claude目录不存在
            }
            
            const allSessions: ClaudeSession[] = [];
            const projectFolders = fs.readdirSync(claudeRoot);

            for (const projectFolder of projectFolders) {
                const projectPath = path.join(claudeRoot, projectFolder);
                const stat = fs.statSync(projectPath);

                if (stat.isDirectory()) {
                    // 读取该项目文件夹下的会话文件
                    const sessionFiles = fs.readdirSync(projectPath)
                        .filter(file => file.endsWith('.jsonl'))
                        .sort() // 你可能需要更复杂的排序，比如按修改时间
                        .reverse()
                        .slice(0, 20); // 最多20个

                    // TODO: 解析jsonl的第一行获取cwd，并与当前workspaceFolders匹配
                    // 这里为了简化，我们暂时不匹配，全部显示
                    for (const sessionFile of sessionFiles) {
                         allSessions.push({
                            id: sessionFile,
                            label: `[${projectFolder.substring(0, 6)}] ${sessionFile}`,
                            collapsibleState: vscode.TreeItemCollapsibleState.None,
                            filePath: path.join(projectPath, sessionFile),
                            projectId: projectFolder,
                            command: { // 定义点击行为
                                command: 'claude-companion.openSession',
                                title: 'Open Session',
                                arguments: [{filePath: path.join(projectPath, sessionFile)}] // 传递参数
                            }
                         });
                    }
                }
            }
            return allSessions;
        }
    }
    ```

3.  **在 `extension.ts` 中注册视图和命令**:
    打开 `src/extension.ts`，修改 `activate` 函数：

    ```typescript
    // src/extension.ts
    import * as vscode from 'vscode';
    import { ClaudeSessionProvider } from './ClaudeSessionProvider';

    export function activate(context: vscode.ExtensionContext) {

        console.log('Congratulations, your extension "claude-cli-companion" is now active!');
        
        // 1. 创建并注册树视图
        const claudeSessionProvider = new ClaudeSessionProvider(vscode.workspace.workspaceFolders);
        vscode.window.registerTreeDataProvider('claude-projects-view', claudeSessionProvider);

        // 2. 注册刷新命令
        context.subscriptions.push(vscode.commands.registerCommand('claude-companion.refreshSessions', () => {
            claudeSessionProvider.refresh();
        }));

        // 3. 注册“新建会话”命令 (后面实现具体功能)
        context.subscriptions.push(vscode.commands.registerCommand('claude-companion.newSession', () => {
            vscode.window.showInformationMessage('New Session command triggered!');
            // TODO: 在这里实现创建新终端的逻辑
        }));

        // 4. 注册“打开历史会话”命令 (后面实现具体功能)
        context.subscriptions.push(vscode.commands.registerCommand('claude-companion.openSession', (session) => {
            vscode.window.showInformationMessage(`Opening session: ${session.filePath}`);
            // TODO: 在这里实现打开历史终端的逻辑
        }));
    }
    ```

    现在按 `F5` 运行，你应该能在新窗口的左侧看到你的图标，点击后会看到一个（可能是空的）列表，标题栏有“+”和“刷新”按钮。

### **5. Part 3: 核心技术 - 启动带拦截器的终端**

这是项目的核心和难点。使用 `vscode.window.createTerminal` 很简单，但无法满足我们对进程输出的精细控制和拦截需求。因此，我们需要使用 `node-pty`。

1.  **安装依赖**:
    在 VSCode 的终端中运行：
    ```bash
    npm install node-pty
    ```
    `node-pty` 包含原生模块，安装可能需要编译环境。

2.  **创建 `interceptor.js` 脚本**:
    在项目根目录创建一个 `interceptor.js` 文件。这个脚本将和 `claude` 命令一起被 `node` 启动，它的任务是监控 `claude` 的输出。

    ```javascript
    // interceptor.js
    // 这个脚本非常精简，它的目标是代理标准输出
    const originalWrite = process.stdout.write;

    process.stdout.write = function(chunk, encoding, callback) {
        const chunkString = chunk.toString();
        // [TERMINAL] 前缀表示这个日志应该显示在用户的终端里
        // [SILENT] 前缀表示这个日志是给插件系统用的，用户不可见
        // 比如，我们可以用它来发送会话创建成功等信号
        if (chunkString.includes("Session created:")) {
             originalWrite.call(process.stdout, `[SILENT] ${chunkString}`, encoding, callback);
        }
        
        return originalWrite.call(process.stdout, `[TERMINAL] ${chunkString}`, encoding, callback);
    };

    // 可以在这里添加更多对stderr等的拦截逻辑
    console.log('[SILENT] Interceptor loaded.');
    ```

3.  **创建终端管理的 Service**:
    为了代码清晰，我们把终端相关的逻辑封装起来。在 `src` 下新建 `TerminalService.ts`。

    ```typescript
    // src/TerminalService.ts
    import * as vscode from 'vscode';
    import * as pty from 'node-pty';
    import * as os from 'os';
    import * as path from 'path';

    export class TerminalService {
        
        public static createClaudeTerminal(claudeArgs: string[]): void {
            // 1. 创建 VSCode 伪终端 (Pty)
            const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
            const terminalPty = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 30,
                cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd(),
                env: process.env
            });

            // 2. 创建 VSCode 终端 UI 并绑定到 Pty
            const terminal = vscode.window.createTerminal({
                name: `Claude: ${claudeArgs.join(' ')}`,
                pty: terminalPty,
                location: vscode.TerminalLocation.Editor // 在编辑区打开！
            });
            terminal.show();

            // 3. 准备启动 claude 的命令
            // TODO: 这里需要一个健壮的 `claude` CLI 路径检测逻辑
            const claudePath = 'claude'; // 假设它在 PATH 中
            const interceptorPath = path.join(vscode.extensions.getExtension('your-publisher.claude-cli-companion')?.extensionPath || '', 'interceptor.js');
            
            // 使用 --require 来注入我们的监控脚本
            const commandToRun = `node --require "${interceptorPath}" ${claudePath} ${claudeArgs.join(' ')}\n`;

            // 4. 数据流处理
            terminalPty.onData(data => {
                // 这是从pty进程收到的所有数据
                if (data.startsWith('[TERMINAL]')) {
                    // 我们只把标记为 TERMINAL 的数据显示给用户
                    terminal.sendText(data.substring('[TERMINAL]'.length));
                } else if (data.startsWith('[SILENT]')) {
                    // 静默消息，用于插件内部通信
                    console.log('Silent message from Claude:', data);
                    if (data.includes('Session created:')) {
                        // 在这里可以触发 refresh 等操作
                        vscode.commands.executeCommand('claude-companion.refreshSessions');
                    }
                }
            });

            // 5. 发送命令到 PTY，启动 claude
            terminalPty.write(commandToRun);
        }
    }
    ```

4.  **更新 `extension.ts` 中的命令实现**:
    现在我们可以用 `TerminalService` 来实现之前留下的 `TODO` 了。

    ```typescript
    // src/extension.ts
    // ... imports
    import { TerminalService } from './TerminalService';

    // ... inside activate() function

    // 3. 注册“新建会话”命令
    context.subscriptions.push(vscode.commands.registerCommand('claude-companion.newSession', () => {
        // 假设新建会话的命令是 claude new
        TerminalService.createClaudeTerminal(['new', '--dangerously-skip-permissions']);
    }));

    // 4. 注册“打开历史会话”命令
    context.subscriptions.push(vscode.commands.registerCommand('claude-companion.openSession', (session) => {
        if (session && session.filePath) {
            // 假设恢复会话的命令是 claude resume <file_path>
            TerminalService.createClaudeTerminal(['resume', `"${session.filePath}"`]);
        }
    }));
    ```
    **注意**: `claude resume <path>` 是一个假设的命令，您需要根据 `claude-cli` 的实际功能调整。如果它是通过会话ID恢复，那么你需要传递会话ID。

### **6. Part 4: 设置与配置**

1.  **在 `package.json` 中声明配置项**:
    在 `contributes` 中加入 `configuration` 字段。

    ```json
    // package.json
    "contributes": {
      // ... 其他 contributes
      "configuration": {
        "title": "Claude Companion",
        "properties": {
          "claude-companion.provider": {
            "type": "string",
            "enum": ["anthropic-official", "claude-ai", "third-party-api"],
            "default": "claude-ai",
            "description": "Select the Claude provider to use."
          },
          "claude-companion.apiKey": {
            "type": "string",
            "default": "",
            "description": "Your API Key for the selected provider. Leave empty for Claude.ai account."
          }
        }
      }
    }
    ```

2.  **在代码中读取配置**:
    您的 `TerminalService` 或其他服务可以这样读取设置：

    ```typescript
    // src/TerminalService.ts 或其他地方
    const config = vscode.workspace.getConfiguration('claude-companion');
    const provider = config.get<string>('provider');
    const apiKey = config.get<string>('apiKey');

    // 然后你可以根据这些值来调整传递给 claude CLI 的参数
    // 例如：
    // let claudeArgs = ['new'];
    // if (provider === 'third-party-api' && apiKey) {
    //    claudeArgs.push('--api-key', apiKey);
    // }
    // TerminalService.createClaudeTerminal(claudeArgs);
    ```

### **7. Part 5: 进阶功能与完善**

上面的框架已经搭建完成，以下是根据您的需求需要进一步细化和完善的点：

*   **Claude CLI 路径检测**:
    在 `TerminalService` 中，`const claudePath = 'claude'` 是一个过于简单的假设。您需要编写一个函数，依次尝试 `which claude`、`where claude`、扫描 `~/nvm/...`、`/usr/local/bin` 等常见路径来找到可执行文件。

*   **多工作区支持**:
    `ClaudeSessionProvider` 的构造函数已经接收了 `workspaceFolders`。您需要在 `getSessionsForWorkspace` 方法中，解析 `session.jsonl` 文件里的 `cwd` (项目路径) 字段，并只显示与当前打开的某个工作区路径匹配的会话。

*   **会话就绪检测**:
    `onData` 中对 `"Session created:"` 的监听是基础。您可以增加对 Claude 提示符（如 `> `）的检测，或者设置一个超时机制，来更可靠地判断会话是否准备就绪。

*   **删除会话**:
    如您所述，“删除”操作仅从 `ClaudeSessionProvider` 的内存/视图中移除即可，无需操作物理文件，更加安全。您可以给 `ClaudeSession` 树项目添加一个上下文菜单（在 `package.json` 的 `menus` -> `view/item/context` 中定义），绑定一个 `delete` 命令。该命令会从您的