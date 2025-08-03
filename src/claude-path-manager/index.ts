export { ClaudePathManager } from './claude-path-manager'
export { InstallationDiscovery } from './installation-discovery'
export { ClaudePathResult, ClaudeInstallation, InstallationType } from './types'
export { compareVersions, extractVersion, getVersionSafely } from './version-utils'
export { directoryExists, fileExists, getExpandedEnvironment } from './system-utils'

import { ClaudePathManager } from './claude-path-manager'

export const claudePathManager = ClaudePathManager.getInstance()