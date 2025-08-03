import * as vscode from 'vscode'
import { SettingsManager } from '../settings'
import { Session, Project, StoreData } from './types'
import { StorageManager } from './storage-manager'
import { ProjectManager } from './project-manager'
import { SessionDataManager } from './session-data-manager'
import { ClaudeSyncManager } from './claude-sync-manager'

export class SessionManager {
  private data: StoreData
  private _settingsManager: SettingsManager | null = null
  private _context: vscode.ExtensionContext
  
  private storageManager: StorageManager
  private projectManager: ProjectManager
  private sessionDataManager: SessionDataManager
  private claudeSyncManager: ClaudeSyncManager

  constructor(context: vscode.ExtensionContext, settingsManager?: SettingsManager) {
    this._context = context
    this._settingsManager = settingsManager || null
    
    this.storageManager = new StorageManager(context)
    this.data = this.storageManager.load()
    
    this.projectManager = new ProjectManager(
      () => this.data,
      (data: StoreData) => {
        this.data = data
        this.storageManager.save(data)
      }
    )
    
    this.sessionDataManager = new SessionDataManager(
      () => this.data,
      (data: StoreData) => {
        this.data = data
        this.storageManager.save(data)
      }
    )
    
    this.claudeSyncManager = new ClaudeSyncManager(
      () => this.data,
      (data: StoreData) => {
        this.data = data
        this.storageManager.save(data)
      }
    )
  }

  public setSettingsManager(settingsManager: SettingsManager): void {
    this._settingsManager = settingsManager
  }

  // Project Management Methods
  public getProjects(): Project[] {
    return this.projectManager.getProjects()
  }

  public getWorkspaceProjects(): Project[] {
    return this.projectManager.getWorkspaceProjects()
  }

  public getProjectById(projectId: string): Project | undefined {
    return this.projectManager.getProjectById(projectId)
  }

  public addProject(project: Project): void {
    this.projectManager.addProject(project)
  }

  public deleteProject(projectId: string): void {
    this.projectManager.deleteProject(projectId)
  }

  // Session Management Methods
  public getSessions(projectId: string): Session[] {
    return this.sessionDataManager.getSessions(projectId)
  }

  public getAllSessions(): Session[] {
    return this.sessionDataManager.getAllSessions()
  }

  public getSessionById(sessionId: string): Session | undefined {
    return this.sessionDataManager.getSessionById(sessionId)
  }

  public addSession(session: Session): void {
    this.sessionDataManager.addSession(session)
  }

  public updateSession(sessionId: string, updates: Partial<Session>): Session | undefined {
    return this.sessionDataManager.updateSession(sessionId, updates)
  }

  public deleteSession(sessionId: string): void {
    this.sessionDataManager.deleteSession(sessionId)
  }

  public refreshProjectSessions(projectId: string): void {
    this.sessionDataManager.refreshProjectSessions(projectId)
  }

  // Claude Sync Methods
  public syncWithClaudeDirectory(): void {
    this.claudeSyncManager.syncWithClaudeDirectory()
  }
}