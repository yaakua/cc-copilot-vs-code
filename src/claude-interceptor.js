// 使用新的模块化架构
const ClaudeInterceptor = require('./claude-interceptor/claude-interceptor');

// 全局拦截器实例
let globalInterceptor = null;

function initializeClaudeInterceptor() {
    if (globalInterceptor) {
        console.warn('[SILENT] [Claude Interceptor] Interceptor already initialized');
        return globalInterceptor;
    }

    globalInterceptor = new ClaudeInterceptor();
    globalInterceptor.initialize();

    return globalInterceptor;
}

// 立即初始化
initializeClaudeInterceptor();

// 进程退出时清理资源
process.on('exit', () => {
    if (globalInterceptor) {
        globalInterceptor.cleanup();
    }
});

process.on('SIGINT', () => {
    if (globalInterceptor) {
        globalInterceptor.cleanup();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (globalInterceptor) {
        globalInterceptor.cleanup();
    }
    process.exit(0);
});

module.exports = { ClaudeInterceptor, initializeClaudeInterceptor };