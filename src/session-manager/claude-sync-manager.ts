import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../logger'
import { Project, Session, StoreData } from './types'

export class ClaudeSyncManager {
  constructor(
    private getData: () => StoreData,
    private saveData: (data: StoreData) => void
  ) {}

  syncWithClaudeDirectory(): void {
    const claudeDir = path.join(os.homedir(), '.claude')
    const projectsDir = path.join(claudeDir, 'projects')

    if (!fs.existsSync(claudeDir)) {
      logger.info('Claude directory not found, skipping sync.', 'SessionManager')
      return
    }

    logger.info('Syncing with Claude directory...', 'SessionManager')
    
    const data = this.getData()
    data.projects = []
    data.sessions = []
    
    let projectsSynced = 0
    let sessionsSynced = 0

    if (fs.existsSync(projectsDir)) {
      const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
      
      for (const projectFolder of projectFolders) {
        try {
          const { project: syncedProject, sessionsCount } = this.syncProjectFolder(projectFolder, projectsDir, data)
          if (syncedProject) {
            projectsSynced++
            sessionsSynced += sessionsCount
          }
        } catch (error) {
          logger.error(`Failed to process project folder: ${projectFolder}`, 'SessionManager', error as Error)
        }
      }
    }

    this.saveData(data)
    logger.info(`Sync complete. Loaded ${projectsSynced} projects and ${sessionsSynced} sessions from Claude directory.`, 'SessionManager')
  }

  private syncProjectFolder(projectFolder: string, projectsDir: string, data: StoreData): { project: Project | null, sessionsCount: number } {
    const projectFolderPath = path.join(projectsDir, projectFolder)
    const allSessionFiles = fs.readdirSync(projectFolderPath).filter(f => f.endsWith('.jsonl'))
    const sessionFiles = allSessionFiles
      .map(file => ({
        name: file,
        path: path.join(projectFolderPath, file),
        stats: fs.statSync(path.join(projectFolderPath, file))
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())
      .slice(0, 20)
      .map(item => item.name)
    
    if (allSessionFiles.length > 20) {
      logger.info(`Project ${projectFolder} has ${allSessionFiles.length} sessions, loading latest 20`, 'SessionManager')
    }
    
    const projectInfo = this.findProjectInfo(sessionFiles, projectFolderPath)
    if (!projectInfo) {
      logger.warn(`No project info found in folder: ${projectFolder}`, 'SessionManager')
      return { project: null, sessionsCount: 0 }
    }

    const project = this.createProject(projectInfo, data)
    const sessionsCount = this.syncProjectSessions(sessionFiles, projectFolderPath, project, data)
    
    return { project, sessionsCount }
  }

  private findProjectInfo(sessionFiles: string[], projectFolderPath: string): { path: string, name: string, timestamp: string } | null {
    for (const sessionFile of sessionFiles) {
      try {
        const sessionFilePath = path.join(projectFolderPath, sessionFile)
        const sessionData = fs.readFileSync(sessionFilePath, 'utf-8')
          .split('\n')
          .filter(line => line.trim() !== '')
          .map(line => JSON.parse(line))
        
        const entryWithCwd = sessionData.find(entry => entry.cwd)
        if (entryWithCwd) {
          return {
            path: entryWithCwd.cwd,
            name: path.basename(entryWithCwd.cwd || ""),
            timestamp: entryWithCwd.timestamp
          }
        }
      } catch (error) {
        logger.error(`Failed to read session file: ${sessionFile}`, 'SessionManager', error as Error)
      }
    }
    return null
  }

  private createProject(projectInfo: { path: string, name: string, timestamp: string }, data: StoreData): Project {
    let existingProject = data.projects.find(p => p.path === projectInfo.path)
    if (!existingProject) {
      let createdAt: string
      try {
        createdAt = projectInfo.timestamp ? new Date(projectInfo.timestamp).toISOString() : new Date().toISOString()
      } catch (error) {
        createdAt = new Date().toISOString()
      }
      
      existingProject = {
        id: uuidv4(),
        name: projectInfo.name,
        path: projectInfo.path,
        createdAt: createdAt,
        sessions: [],
      }
      data.projects.push(existingProject)
      logger.debug(`Created project: ${projectInfo.name} (${existingProject.id}) from ${projectInfo.path}`, 'SessionManager')
    }
    return existingProject
  }

  private syncProjectSessions(sessionFiles: string[], projectFolderPath: string, project: Project, data: StoreData): number {
    let sessionsCount = 0
    
    for (const sessionFile of sessionFiles) {
      try {
        const sessionFilePath = path.join(projectFolderPath, sessionFile)
        const sessionData = fs.readFileSync(sessionFilePath, 'utf-8')
          .split('\n')
          .filter(line => line.trim() !== '')
          .map(line => JSON.parse(line))
        
        if (sessionData.length > 0) {
          const session = this.createSessionFromData(sessionData, project, sessionFilePath, data)
          if (session) {
            sessionsCount++
          }
        }
      } catch (error) {
        logger.error(`Failed to process session file: ${sessionFile}`, 'SessionManager', error as Error)
      }
    }
    
    return sessionsCount
  }

  private createSessionFromData(sessionData: any[], project: Project, sessionFilePath: string, data: StoreData): Session | null {
    const firstEntry = sessionData[0]
    const claudeSessionId = firstEntry.sessionId
    
    let existingSession = data.sessions.find(s => s.claudeSessionId === claudeSessionId)
    if (existingSession) {
      return null
    }

    const sessionName = this.generateSessionName(sessionData, claudeSessionId)
    const { createdAt, lastActiveAt } = this.extractSessionTimes(sessionData, firstEntry)
    
    const session: Session = {
      id: uuidv4(),
      name: sessionName,
      projectId: project.id,
      createdAt,
      lastActiveAt,
      claudeSessionId,
      isTemporary: false,
      filePath: sessionFilePath,
    }
    
    data.sessions.push(session)
    return session
  }

  private generateSessionName(sessionData: any[], claudeSessionId: string): string {
    const firstUserMessage = sessionData.find(msg => msg.type === 'user')
    
    if (firstUserMessage && firstUserMessage.message && firstUserMessage.message.content) {
      let content: string
      if (typeof firstUserMessage.message.content === 'string') {
        content = firstUserMessage.message.content
      } else if (Array.isArray(firstUserMessage.message.content)) {
        const textContent = firstUserMessage.message.content.find((item: any) => item.type === 'text')
        content = textContent ? textContent.text : String(firstUserMessage.message.content)
      } else {
        content = String(firstUserMessage.message.content)
      }
      
      content = content.replace(/cd\s+"[^"]*"|cd\s+\S+/g, '').trim()
      content = content.replace(/\n|\r/g, ' ').trim()
      if (content.length > 3) {
        return content.substring(0, 50).trim()
      }
    }
    
    return `Session ${claudeSessionId}`
  }

  private extractSessionTimes(sessionData: any[], firstEntry: any): { createdAt: string, lastActiveAt: string } {
    const lastMessage = sessionData[sessionData.length - 1]
    
    let createdAt: string
    try {
      createdAt = firstEntry.timestamp ? new Date(firstEntry.timestamp).toISOString() : new Date().toISOString()
    } catch (error) {
      createdAt = new Date().toISOString()
    }
    
    let lastActiveAt: string
    try {
      lastActiveAt = lastMessage && lastMessage.timestamp 
        ? new Date(lastMessage.timestamp).toISOString() 
        : createdAt
    } catch (error) {
      lastActiveAt = createdAt
    }
    
    return { createdAt, lastActiveAt }
  }
}