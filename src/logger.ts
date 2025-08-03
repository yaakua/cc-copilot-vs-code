import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

/**
 * 日志级别枚举
 * 定义了不同的日志级别，数值越大级别越高
 */
export enum LogLevel {
  DEBUG = 0,  // 调试信息
  INFO = 1,   // 一般信息
  WARN = 2,   // 警告信息
  ERROR = 3   // 错误信息
}

/**
 * 日志条目接口
 * 定义了单条日志记录的数据结构
 */
export interface LogEntry {
  timestamp: string              // 时间戳
  level: LogLevel               // 日志级别
  message: string               // 日志消息
  component?: string            // 组件名称
  error?: Error                 // 错误对象
  meta?: Record<string, any>    // 附加元数据
  caller?: string               // 调用者信息
}

/**
 * 日志管理器类
 * 提供统一的日志记录功能，支持文件输出、控制台输出、日志轮转等特性
 * 使用单例模式确保全局唯一的日志实例
 */
export class Logger {
  private static instance: Logger
  private logDir: string                              // 日志目录路径
  private currentLogFile: string                      // 当前日志文件路径
  private minLevel: LogLevel = LogLevel.INFO          // 最小日志级别
  private maxFileSize: number = 10 * 1024 * 1024     // 最大文件大小 (10MB)
  private maxFiles: number = 5                        // 最大保留文件数
  private context: vscode.ExtensionContext | null = null

  /**
   * 私有构造函数，实现单例模式
   */
  private constructor() {
    // 将在调用 setContext 时初始化
    this.logDir = ''
    this.currentLogFile = ''
  }

  /**
   * 设置VSCode扩展上下文并初始化日志系统
   * @param context - VSCode扩展上下文
   */
  public setContext(context: vscode.ExtensionContext): void {
    this.context = context
    // 在扩展的全局存储目录中创建日志目录
    this.logDir = path.join(context.globalStorageUri.fsPath, 'logs')
    console.log('日志目录:', this.logDir)
    this.ensureLogDirectory()
    this.currentLogFile = this.getLogFileName()
    this.cleanOldLogs()
  }

  /**
   * 获取Logger单例实例
   * @returns Logger实例
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  /**
   * 确保日志目录存在
   * 如果目录不存在则创建
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  /**
   * 生成当前日期的日志文件名
   * @returns 日志文件的完整路径
   */
  private getLogFileName(): string {
    const date = new Date().toISOString().split('T')[0]
    return path.join(this.logDir, `cc-copilot-${date}.log`)
  }

  /**
   * 清理旧的日志文件
   * 保留最新的指定数量的日志文件，删除多余的旧文件
   */
  private cleanOldLogs(): void {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(file => file.startsWith('cc-copilot-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          stats: fs.statSync(path.join(this.logDir, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())

      // 只保留最新的文件
      const filesToDelete = files.slice(this.maxFiles)
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path)
        } catch (error) {
          console.warn(`删除旧日志文件失败 ${file.name}:`, error)
        }
      })
    } catch (error) {
      console.warn('清理旧日志失败:', error)
    }
  }

  /**
   * 日志文件轮转
   * 当当前日志文件超过最大大小时，创建新的日志文件
   */
  private rotateLogFile(): void {
    try {
      const stats = fs.statSync(this.currentLogFile)
      if (stats.size >= this.maxFileSize) {
        // 创建新的日志文件
        this.currentLogFile = this.getLogFileName()
        this.cleanOldLogs()
      }
    } catch (error) {
      // 文件还不存在，这是正常的
    }
  }

  /**
   * 将日志条目写入文件
   * @param entry - 要写入的日志条目
   */
  private writeToFile(entry: LogEntry): void {
    try {
      this.rotateLogFile()

      // 构造JSON格式的日志行
      const logLine = JSON.stringify({
        timestamp: entry.timestamp,
        level: LogLevel[entry.level],
        component: entry.component || 'main',
        message: entry.message,
        caller: entry.caller,
        error: entry.error ? {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack
        } : undefined,
        meta: entry.meta
      }) + '\n'

      fs.appendFileSync(this.currentLogFile, logLine)
    } catch (error) {
      console.error('写入日志文件失败:', error)
    }
  }

  /**
   * 格式化控制台输出消息
   * @param entry - 日志条目
   * @returns 格式化后的消息字符串
   */
  private formatConsoleMessage(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString()
    const level = LogLevel[entry.level].padEnd(5)
    const component = entry.component ? `[${entry.component}]` : '[main]'
    const caller = entry.caller ? `(${entry.caller})` : ''

    let message = `${timestamp} ${level} ${component} ${caller} ${entry.message}`

    if (entry.meta && Object.keys(entry.meta).length > 0) {
      message += ` ${JSON.stringify(entry.meta)}`
    }

    return message
  }

  /**
   * 获取调用者信息
   * 通过解析调用栈获取调用日志方法的文件名和行号
   * @returns 调用者信息字符串
   */
  private getCallerInfo(): string {
    const stack = new Error().stack
    if (!stack) return '未知'

    const lines = stack.split('\n')
    // 跳过 Error、getCallerInfo、log方法和实际的logger方法调用
    for (let i = 4; i < lines.length; i++) {
      const line = lines[i]
      if (line && !line.includes('node_modules') && !line.includes('logger.ts')) {
        // 提取文件路径和行号
        const match = line.match(/\s+at\s+.*\s+\((.+):(\d+):(\d+)\)/) || line.match(/\s+at\s+(.+):(\d+):(\d+)/)
        if (match) {
          const filePath = match[1]
          const lineNumber = match[2]
          const fileName = filePath.split('/').pop() || filePath
          return `${fileName}:${lineNumber}`
        }
      }
    }
    return '未知'
  }

  /**
   * 核心日志记录方法
   * @param level - 日志级别
   * @param message - 日志消息
   * @param component - 组件名称
   * @param error - 错误对象
   * @param meta - 附加元数据
   */
  private log(level: LogLevel, message: string, component?: string, error?: Error, meta?: Record<string, any>): void {
    // 检查日志级别是否满足最小级别要求
    if (level < this.minLevel) {
      return
    }

    // 构造日志条目
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component,
      error,
      meta,
      caller: this.getCallerInfo()
    }

    // 写入文件
    this.writeToFile(entry)

    // 同时输出到控制台（开发环境）
    const consoleMessage = this.formatConsoleMessage(entry)

    // 根据日志级别选择合适的控制台输出方法
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(consoleMessage)
        break
      case LogLevel.INFO:
        console.info(consoleMessage)
        break
      case LogLevel.WARN:
        console.warn(consoleMessage)
        if (error) console.warn(error)
        break
      case LogLevel.ERROR:
        console.error(consoleMessage)
        if (error) console.error(error)
        break
    }
  }

  /**
   * 记录调试级别日志
   * @param message - 日志消息
   * @param component - 组件名称
   * @param meta - 附加元数据
   */
  public debug(message: string, component?: string, meta?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, component, undefined, meta)
  }

  /**
   * 记录信息级别日志
   * @param message - 日志消息
   * @param component - 组件名称
   * @param meta - 附加元数据
   */
  public info(message: string, component?: string, meta?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, component, undefined, meta)
  }

  /**
   * 记录警告级别日志
   * @param message - 日志消息
   * @param component - 组件名称
   * @param error - 错误对象
   * @param meta - 附加元数据
   */
  public warn(message: string, component?: string, error?: Error, meta?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, component, error, meta)
  }

  /**
   * 记录错误级别日志
   * @param message - 日志消息
   * @param component - 组件名称
   * @param error - 错误对象
   * @param meta - 附加元数据
   */
  public error(message: string, component?: string, error?: Error, meta?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, component, error, meta)
  }

  /**
   * 处理来自渲染进程的日志
   * 用于接收和处理从渲染进程（如webview）发送的日志消息
   * @param logEntry - 来自渲染进程的日志条目
   */
  public logFromRenderer(logEntry: {
    level: string
    message: string
    component?: string
    error?: string | any
    meta?: Record<string, any>
  }): void {
    // 解析日志级别，默认为INFO
    const level = LogLevel[logEntry.level.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO

    // 处理来自渲染进程的错误对象
    let error: Error | undefined = undefined
    if (logEntry.error) {
      try {
        if (typeof logEntry.error === 'string') {
          // 首先尝试解析为JSON（结构化错误）
          try {
            const errorData = JSON.parse(logEntry.error)
            error = new Error(errorData.message || 'Unknown error')
            if (errorData.stack) {
              error.stack = errorData.stack
            }
            if (errorData.name) {
              error.name = errorData.name
            }
          } catch (jsonError) {
            // 如果不是JSON，则作为普通错误消息处理
            error = new Error(logEntry.error)
          }
        } else if (logEntry.error instanceof Error) {
          error = logEntry.error
        } else if (typeof logEntry.error === 'object' && logEntry.error.message) {
          error = new Error(logEntry.error.message)
          if (logEntry.error.stack) {
            error.stack = logEntry.error.stack
          }
          if (logEntry.error.name) {
            error.name = logEntry.error.name
          }
        } else {
          // 后备方案：将任何其他类型转换为字符串
          error = new Error(String(logEntry.error))
        }
      } catch (e) {
        // 如果所有方法都失败，创建一个通用错误
        error = new Error('Error object could not be processed from renderer')
      }
    }

    // 记录日志，添加[RENDERER]标识
    this.log(level, `[RENDERER] ${logEntry.message}`, logEntry.component, error, logEntry.meta)
  }

  /**
   * 设置最小日志级别
   * @param level - 要设置的最小日志级别
   */
  public setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  /**
   * 获取日志目录路径
   * @returns 日志目录的完整路径
   */
  public getLogDirectory(): string {
    return this.logDir
  }

  /**
   * 获取当前日志文件路径
   * @returns 当前日志文件的完整路径
   */
  public getCurrentLogFile(): string {
    return this.currentLogFile
  }

  /**
   * 获取最近的日志条目（用于调试）
   * @param lines - 要获取的日志行数，默认100行
   * @returns 最近的日志行数组
   */
  public getRecentLogs(lines: number = 100): string[] {
    try {
      const content = fs.readFileSync(this.currentLogFile, 'utf-8')
      const logLines = content.trim().split('\n').filter(line => line.trim())
      return logLines.slice(-lines)
    } catch (error) {
      return []
    }
  }
}

/**
 * 导出Logger单例实例
 * 提供全局统一的日志记录接口
 */
export const logger = Logger.getInstance()