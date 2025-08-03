import { spawn } from 'child_process'

export function compareVersions(version1: string, version2: string): number {
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

export function extractVersion(output: string): string {
  const versionMatch = output.match(/(\d+\.\d+\.\d+[\w\-\.]*)/i)
  if (versionMatch) {
    return versionMatch[1]
  }
  
  if (output.toLowerCase().includes('claude code')) {
    return 'detected'
  }
  
  return 'unknown'
}

export async function getVersionSafely(claudePath: string): Promise<string> {
  try {
    return new Promise((resolve) => {
      const childProcess = spawn(claudePath, ['--version'], {
        stdio: 'pipe',
        timeout: 5000
      })

      let output = ''

      childProcess.stdout?.on('data', (data) => {
        output += data.toString()
      })

      childProcess.stderr?.on('data', (data) => {
        output += data.toString()
      })

      childProcess.on('close', (code) => {
        if (code === 0 && output) {
          const version = extractVersion(output)
          resolve(version)
        } else {
          resolve('detected')
        }
      })

      childProcess.on('error', () => {
        resolve('detected')
      })
    })
  } catch {
    return 'detected'
  }
}