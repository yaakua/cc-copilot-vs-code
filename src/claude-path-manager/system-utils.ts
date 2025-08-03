import * as fs from 'fs'
import * as os from 'os'

export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(dirPath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(filePath)
    return stats.isFile()
  } catch {
    return false
  }
}

export function getExpandedEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  
  const essentialEnvVars = [
    'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'NODE_PATH', 
    'NVM_DIR', 'NVM_BIN', 'HOMEBREW_PREFIX', 'HOMEBREW_CELLAR'
  ]
  
  for (const [key, value] of Object.entries(process.env)) {
    if (essentialEnvVars.includes(key) || key.startsWith('LC_')) {
      if (value) {
        env[key] = value
      }
    }
  }
  
  const commonPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    process.env.HOME + '/.local/bin',
    process.env.HOME + '/bin',
    process.env.HOME + '/.bun/bin',
    process.env.HOME + '/.npm-global/bin',
    process.env.HOME + '/.yarn/bin',
    '/opt/local/bin'
  ].filter(Boolean)

  if (os.platform() === 'win32') {
    commonPaths.push(
      'C:\\Program Files\\nodejs',
      'C:\\Users\\' + (process.env.USERNAME || 'User') + '\\AppData\\Local\\npm',
      'C:\\Users\\' + (process.env.USERNAME || 'User') + '\\AppData\\Roaming\\npm'
    )
  }

  const currentPath = env.PATH || env.Path || ''
  const expandedPath = [currentPath, ...commonPaths].filter(Boolean).join(os.platform() === 'win32' ? ';' : ':')
  
  env.PATH = expandedPath
  if (os.platform() === 'win32') {
    env.Path = expandedPath
  }

  return env
}