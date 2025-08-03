import { logger } from '../logger'
import { ClaudePathResult } from './types'
import { InstallationDiscovery } from './installation-discovery'

export class ClaudePathManager {
  private static instance: ClaudePathManager
  private cachedResult: ClaudePathResult | null = null
  private detecting = false
  private detectionPromise: Promise<ClaudePathResult> | null = null
  private installationDiscovery: InstallationDiscovery

  private constructor() {
    this.installationDiscovery = new InstallationDiscovery()
  }

  public static getInstance(): ClaudePathManager {
    if (!ClaudePathManager.instance) {
      ClaudePathManager.instance = new ClaudePathManager()
    }
    return ClaudePathManager.instance
  }

  public async getClaudePath(): Promise<string | null> {
    const result = await this.detectClaudePath()
    return result.isFound ? result.path || null : null
  }

  public async detectClaudePath(forceRedetect = false): Promise<ClaudePathResult> {
    if (this.detecting && this.detectionPromise) {
      logger.info('Claude路径检测已在进行中，等待结果...', 'claude-path-manager')
      return this.detectionPromise
    }

    if (this.cachedResult && !forceRedetect) {
      logger.info('使用缓存的Claude路径检测结果', 'claude-path-manager', this.cachedResult)
      return this.cachedResult
    }

    this.detecting = true
    this.detectionPromise = this.performDetection()

    try {
      this.cachedResult = await this.detectionPromise
      return this.cachedResult
    } finally {
      this.detecting = false
      this.detectionPromise = null
    }
  }

  public getCachedResult(): ClaudePathResult | null {
    return this.cachedResult
  }

  public clearCache(): void {
    this.cachedResult = null
    logger.info('Claude路径缓存已清除', 'claude-path-manager')
  }

  private async performDetection(): Promise<ClaudePathResult> {
    logger.info('开始检测Claude CLI路径...', 'claude-path-manager')

    const result: ClaudePathResult = {
      isFound: false,
      timestamp: Date.now()
    }

    try {
      const installations = await this.installationDiscovery.discoverAllInstallations()
      
      if (installations.length === 0) {
        result.error = '在所有已知路径中都未找到Claude CLI'
        logger.warn(result.error, 'claude-path-manager')
        return result
      }

      for (const installation of installations) {
        logger.info(`找到Claude安装: path=${installation.path}, version=${installation.version || 'unknown'}, source=${installation.source}`, 'claude-path-manager')
      }

      const bestInstallation = this.installationDiscovery.selectBestInstallation(installations)
      if (bestInstallation) {
        logger.info(`选择Claude安装: path=${bestInstallation.path}, version=${bestInstallation.version || 'unknown'}, source=${bestInstallation.source}`, 'claude-path-manager')
        result.isFound = true
        result.path = bestInstallation.path
        result.version = bestInstallation.version
        return result
      }

      result.error = '未找到有效的Claude CLI安装'
      logger.warn(result.error, 'claude-path-manager')
      return result

    } catch (error) {
      result.error = `检测过程中出错: ${(error as Error).message}`
      logger.error('Claude路径检测过程中发生错误', 'claude-path-manager', error as Error)
      return result
    }
  }
}