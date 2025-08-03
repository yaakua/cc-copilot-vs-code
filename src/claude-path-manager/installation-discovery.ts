import { spawn } from 'child_process'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../logger'
import { ClaudeInstallation, InstallationType } from './types'
import { fileExists, directoryExists, getExpandedEnvironment } from './system-utils'
import { getVersionSafely, extractVersion } from './version-utils'

export class InstallationDiscovery {
  async discoverAllInstallations(): Promise<ClaudeInstallation[]> {
    const installations: ClaudeInstallation[] = []

    const whichInstallation = await this.tryWhichCommand()
    if (whichInstallation) {
      installations.push(whichInstallation)
    }

    const nvmInstallations = await this.findNvmInstallations()
    installations.push(...nvmInstallations)

    const standardInstallations = await this.findStandardInstallations()
    installations.push(...standardInstallations)

    const pathInstallation = await this.checkPathCommand()
    if (pathInstallation) {
      installations.push(pathInstallation)
    }

    const uniquePaths = new Set<string>()
    return installations.filter(install => {
      if (uniquePaths.has(install.path)) {
        return false
      }
      uniquePaths.add(install.path)
      return true
    })
  }

  selectBestInstallation(installations: ClaudeInstallation[]): ClaudeInstallation | null {
    if (installations.length === 0) {
      return null
    }

    const sorted = installations.sort((a, b) => {
      if (a.version && b.version) {
        const versionComparison = this.compareVersions(a.version, b.version)
        if (versionComparison !== 0) {
          return versionComparison > 0 ? -1 : 1
        }
      } else if (a.version && !b.version) {
        return -1
      } else if (!a.version && b.version) {
        return 1
      }

      const aPriority = this.getSourcePriority(a.source)
      const bPriority = this.getSourcePriority(b.source)
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority
      }

      if (a.path === 'claude' && b.path !== 'claude') {
        return 1
      } else if (a.path !== 'claude' && b.path === 'claude') {
        return -1
      }

      return 0
    })

    return sorted[0]
  }

  private async tryWhichCommand(): Promise<ClaudeInstallation | null> {
    logger.debug('尝试使用which命令查找Claude...', 'claude-path-manager')
    
    const command = os.platform() === 'win32' ? 'where' : 'which'
    const expandedEnv = getExpandedEnvironment()

    return new Promise((resolve) => {
      const childProcess = spawn(command, ['claude'], {
        shell: true,
        env: expandedEnv,
        stdio: 'pipe'
      })

      let outputPath = ''
      
      childProcess.stdout?.on('data', (data) => {
        outputPath += data.toString()
      })

      childProcess.on('close', async (code) => {
        if (code === 0 && outputPath.trim()) {
          const output = outputPath.trim()
          
          let claudePath: string
          if (output.includes('aliased to')) {
            const match = output.match(/aliased to\s+(.+)$/)
            if (match) {
              claudePath = match[1].trim()
            } else {
              resolve(null)
              return
            }
          } else {
            claudePath = output.split(/[\r\n]+/)[0].trim()
          }

          if (!await fileExists(claudePath)) {
            logger.warn(`which命令返回的路径不存在: ${claudePath}`, 'claude-path-manager')
            resolve(null)
            return
          }

          const version = await getVersionSafely(claudePath)
          resolve({
            path: claudePath,
            version: version !== 'detected' && version !== 'unknown' ? version : undefined,
            source: 'which',
            installationType: InstallationType.System
          })
        } else {
          resolve(null)
        }
      })

      childProcess.on('error', () => {
        resolve(null)
      })
    })
  }

  private async findNvmInstallations(): Promise<ClaudeInstallation[]> {
    const installations: ClaudeInstallation[] = []
    const homeDir = process.env.HOME
    
    if (!homeDir) {
      return installations
    }

    const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node')
    logger.debug(`检查NVM目录: ${nvmDir}`, 'claude-path-manager')

    if (!await directoryExists(nvmDir)) {
      return installations
    }

    try {
      const entries = await fs.promises.readdir(nvmDir)
      
      for (const entry of entries) {
        const entryPath = path.join(nvmDir, entry)
        const stats = await fs.promises.stat(entryPath).catch(() => null)
        
        if (stats?.isDirectory()) {
          const claudePath = path.join(entryPath, 'bin', 'claude')
          
          if (await fileExists(claudePath)) {
            logger.debug(`在NVM节点${entry}中找到Claude: ${claudePath}`, 'claude-path-manager')
            
            const version = await getVersionSafely(claudePath)
            installations.push({
              path: claudePath,
              version: version !== 'detected' && version !== 'unknown' ? version : undefined,
              source: `nvm (${entry})`,
              installationType: InstallationType.System
            })
          }
        }
      }
    } catch (error) {
      logger.debug(`读取NVM目录失败: ${error}`, 'claude-path-manager')
    }

    return installations
  }

  private async findStandardInstallations(): Promise<ClaudeInstallation[]> {
    const installations: ClaudeInstallation[] = []
    const homeDir = process.env.HOME

    const pathsToCheck: Array<{path: string, source: string}> = [
      { path: '/usr/local/bin/claude', source: 'system' },
      { path: '/opt/homebrew/bin/claude', source: 'homebrew' },
      { path: '/usr/bin/claude', source: 'system' },
      { path: '/bin/claude', source: 'system' }
    ]

    if (homeDir) {
      pathsToCheck.push(
        { path: path.join(homeDir, '.claude/local/claude'), source: 'claude-local' },
        { path: path.join(homeDir, '.local/bin/claude'), source: 'local-bin' },
        { path: path.join(homeDir, '.npm-global/bin/claude'), source: 'npm-global' },
        { path: path.join(homeDir, '.yarn/bin/claude'), source: 'yarn' },
        { path: path.join(homeDir, '.bun/bin/claude'), source: 'bun' },
        { path: path.join(homeDir, 'bin/claude'), source: 'home-bin' },
        { path: path.join(homeDir, 'node_modules/.bin/claude'), source: 'node-modules' },
        { path: path.join(homeDir, '.config/yarn/global/node_modules/.bin/claude'), source: 'yarn-global' }
      )
    }

    for (const {path: claudePath, source} of pathsToCheck) {
      if (await fileExists(claudePath)) {
        logger.debug(`在标准路径找到Claude: ${claudePath} (${source})`, 'claude-path-manager')
        
        const version = await getVersionSafely(claudePath)
        installations.push({
          path: claudePath,
          version: version !== 'detected' && version !== 'unknown' ? version : undefined,
          source,
          installationType: InstallationType.System
        })
      }
    }

    return installations
  }

  private async checkPathCommand(): Promise<ClaudeInstallation | null> {
    return new Promise((resolve) => {
      const childProcess = spawn('claude', ['--version'], {
        stdio: 'pipe',
        env: getExpandedEnvironment()
      })

      let output = ''

      childProcess.stdout?.on('data', (data) => {
        output += data.toString()
      })

      childProcess.stderr?.on('data', (data) => {
        output += data.toString()
      })

      childProcess.on('close', (code) => {
        if (code === 0) {
          logger.debug('claude命令在PATH中可用', 'claude-path-manager')
          const version = extractVersion(output)
          resolve({
            path: 'claude',
            version: version !== 'detected' && version !== 'unknown' ? version : undefined,
            source: 'PATH',
            installationType: InstallationType.System
          })
        } else {
          resolve(null)
        }
      })

      childProcess.on('error', () => {
        resolve(null)
      })
    })
  }

  private getSourcePriority(source: string): number {
    const priorities: Record<string, number> = {
      'which': 1,
      'homebrew': 2,
      'system': 3,
      'local-bin': 5,
      'claude-local': 6,
      'npm-global': 7,
      'yarn': 8,
      'yarn-global': 8,
      'bun': 9,
      'node-modules': 10,
      'home-bin': 11,
      'PATH': 12
    }

    if (source.startsWith('nvm')) {
      return 4
    }

    return priorities[source] || 13
  }

  private compareVersions(version1: string, version2: string): number {
    const parseVersion = (v: string) => {
      return v.split('.').map(part => {
        const numMatch = part.match(/^\d+/)
        return numMatch ? parseInt(numMatch[0], 10) : 0
      })
    }

    const v1Parts = parseVersion(version1)
    const v2Parts = parseVersion(version2)
    const maxLength = Math.max(v1Parts.length, v2Parts.length)

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0
      const v2Part = v2Parts[i] || 0
      
      if (v1Part !== v2Part) {
        return v1Part - v2Part
      }
    }

    return 0
  }
}