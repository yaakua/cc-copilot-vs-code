import * as vscode from 'vscode'
import { ExtensionCore } from './extension-core'

/**
 * VSCode 扩展激活函数
 * 当扩展被激活时调用，负责初始化扩展的核心功能
 * @param context - VSCode扩展上下文，提供扩展生命周期管理和资源访问
 */
export function activate(context: vscode.ExtensionContext) {
    try {
        console.log('Starting extension activation...')

        // 创建扩展核心实例，负责管理所有功能模块
        const extensionCore = new ExtensionCore(context)

        // 启动拦截器发现定时器，用于自动检测Claude应用
        extensionCore.startInterceptorDiscoveryTimer()

        console.log('Extension activated successfully')

    } catch (error) {
        // 记录激活失败的详细错误信息
        console.error('Failed to activate extension:', error)
        console.error('Error stack:', (error as Error).stack)
        // 向用户显示友好的错误提示
        vscode.window.showErrorMessage(`Failed to activate Claude Companion: ${(error as Error).message}`)
    }
}

/**
 * VSCode 扩展停用函数
 * 当扩展被停用时调用，用于清理资源
 * VSCode会自动处理subscriptions的清理
 */
export function deactivate() {
    // 清理资源，VSCode会自动处理subscriptions
}