import * as vscode from 'vscode'
import { ExtensionCore } from './extension-core'

export function activate(context: vscode.ExtensionContext) {
    try {
        console.log('Starting extension activation...')
        
        const extensionCore = new ExtensionCore(context)
        
        // 启动拦截器发现定时器
        extensionCore.startInterceptorDiscoveryTimer()
        
        console.log('Extension activated successfully')
        
    } catch (error) {
        console.error('Failed to activate extension:', error)
        console.error('Error stack:', (error as Error).stack)
        vscode.window.showErrorMessage(`Failed to activate Claude Companion: ${(error as Error).message}`)
    }
}

export function deactivate() {
    // 清理资源，VSCode会自动处理subscriptions
}