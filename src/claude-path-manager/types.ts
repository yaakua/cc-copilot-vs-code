export interface ClaudePathResult {
  isFound: boolean
  path?: string
  version?: string
  error?: string
  timestamp: number
}

export enum InstallationType {
  System = 'system',
  Custom = 'custom'
}

export interface ClaudeInstallation {
  path: string
  version?: string
  source: string
  installationType: InstallationType
}