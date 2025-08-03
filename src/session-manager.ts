import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { logger } from './logger';
import { SettingsManager } from './settings';
import { Session, Project } from './shared/types';

import { v4 as uuidv4 } from 'uuid';

interface StoreData {
  projects: Project[];
  sessions: Session[];
}

export class SessionManager {
  private storePath: string;
  private data: StoreData;
  private settingsManager: SettingsManager | null = null;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext, settingsManager?: SettingsManager) {
    this.context = context;
    // 使用VSCode的globalStorageUri作为存储路径
    this.storePath = path.join(context.globalStorageUri.fsPath, 'session-store.json');
    this.settingsManager = settingsManager || null;
    this.data = this.load();
  }

  // 设置 SettingsManager（如果构造时没有传入）
  public setSettingsManager(settingsManager: SettingsManager): void {
    this.settingsManager = settingsManager;
  }

  private load(): StoreData {
    try {
      // 确保存储目录存在
      this.ensureStorageDirectory();
      
      if (fs.existsSync(this.storePath)) {
        const rawData = fs.readFileSync(this.storePath, 'utf-8');
        return JSON.parse(rawData);
      } else {
        logger.info('Session store not found, creating a new one.', 'SessionManager');
        const initialData: StoreData = { projects: [], sessions: [] };
        this.save(initialData);
        return initialData;
      }
    } catch (error) {
      logger.error('Failed to load session store, resetting.', 'SessionManager', error as Error);
      const backupPath = `${this.storePath}.${Date.now()}.bak`;
      if (fs.existsSync(this.storePath)) {
        fs.renameSync(this.storePath, backupPath);
        logger.info(`Backed up corrupted store to ${backupPath}`, 'SessionManager');
      }
      const initialData: StoreData = { projects: [], sessions: [] };
      this.save(initialData);
      return initialData;
    }
  }

  private ensureStorageDirectory(): void {
    const storageDir = path.dirname(this.storePath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
      logger.info(`Created storage directory: ${storageDir}`, 'SessionManager');
    }
  }

  private save(data: StoreData): void {
    try {
      this.ensureStorageDirectory();
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save session store.', 'SessionManager', error as Error);
    }
  }

  public getProjects(): Project[] {
    // 按与当前工作区的相关性排序
    return this.sortProjectsByWorkspaceRelevance(this.data.projects);
  }

  /**
   * 按与当前工作区的相关性排序项目
   */
  private sortProjectsByWorkspaceRelevance(projects: Project[]): Project[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return projects;
    }

    const workspacePaths = workspaceFolders.map(folder => folder.uri.fsPath);
    
    return projects.sort((a, b) => {
      // 检查项目是否在当前工作区中
      const aInWorkspace = workspacePaths.some(wsPath => a.path.startsWith(wsPath));
      const bInWorkspace = workspacePaths.some(wsPath => b.path.startsWith(wsPath));
      
      if (aInWorkspace && !bInWorkspace) return -1;
      if (!aInWorkspace && bInWorkspace) return 1;
      
      // 如果都在工作区或都不在工作区，按最后活动时间排序
      const aSessions = this.getSessions(a.id);
      const bSessions = this.getSessions(b.id);
      
      const aLastActive = aSessions.length > 0 
        ? Math.max(...aSessions.map(s => new Date(s.lastActiveAt).getTime()))
        : new Date(a.createdAt).getTime();
      
      const bLastActive = bSessions.length > 0
        ? Math.max(...bSessions.map(s => new Date(s.lastActiveAt).getTime()))
        : new Date(b.createdAt).getTime();
      
      return bLastActive - aLastActive;
    });
  }

  /**
   * 获取当前工作区相关的项目
   */
  public getWorkspaceProjects(): Project[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const workspacePaths = workspaceFolders.map(folder => folder.uri.fsPath);
    
    return this.getProjects().filter(project => 
      workspacePaths.some(wsPath => {
        // Normalize paths to handle different separators
        const normalizedProjectPath = project.path.replace(/\\/g, '/');
        const normalizedWsPath = wsPath.replace(/\\/g, '/');
        
        // Check if project path is exactly the workspace path or is a subdirectory
        return normalizedProjectPath === normalizedWsPath || 
               normalizedProjectPath.startsWith(normalizedWsPath + '/');
      })
    );
  }

  public getSessions(projectId: string): Session[] {
    return this.data.sessions.filter(s => s.projectId === projectId);
  }

  public getAllSessions(): Session[] {
    return this.data.sessions;
  }

  public getProjectById(projectId: string): Project | undefined {
    return this.data.projects.find(p => p.id === projectId);
  }

  public getSessionById(sessionId: string): Session | undefined {
    return this.data.sessions.find(s => s.id === sessionId);
  }

  public addProject(project: Project): void {
    
    if (!this.data.projects.some(p => p.id === project.id)) {
      this.data.projects.push(project);
      this.save(this.data);
      logger.info(`Project added: ${project.name}`, 'SessionManager');
    }
  }

  public addSession(session: Session): void {
    if (!this.data.sessions.some(s => s.id === session.id)) {
      this.data.sessions.push(session);
      this.save(this.data);
      logger.info(`Session added: ${session.name}`, 'SessionManager');
    }
  }

  public updateSession(sessionId: string, updates: Partial<Session>): Session | undefined {
    const sessionIndex = this.data.sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex !== -1) {
      const updatedSession = { ...this.data.sessions[sessionIndex], ...updates };
      this.data.sessions[sessionIndex] = updatedSession;
      this.save(this.data);
      logger.info(`Session updated: ${sessionId}`, 'SessionManager');
      return updatedSession;
    }
    logger.warn(`Session not found for update: ${sessionId}`, 'SessionManager');
    return undefined;
  }

  public syncWithClaudeDirectory(): void {
    const claudeDir = path.join(os.homedir(), '.claude');
    const projectsDir = path.join(claudeDir, 'projects');

    if (!fs.existsSync(claudeDir)) {
      logger.info('Claude directory not found, skipping sync.', 'SessionManager');
      return;
    }

    logger.info('Syncing with Claude directory...', 'SessionManager');
    
    // Clear existing data and reload from Claude directory
    this.data.projects = [];
    this.data.sessions = [];
    
    let projectsSynced = 0;
    let sessionsSynced = 0;

    // Sync Projects and Sessions from ~/.claude/projects/
    if (fs.existsSync(projectsDir)) {
      const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      for (const projectFolder of projectFolders) {
        try {
          const projectFolderPath = path.join(projectsDir, projectFolder);
          const allSessionFiles = fs.readdirSync(projectFolderPath).filter(f => f.endsWith('.jsonl'));
          const sessionFiles = allSessionFiles
            .map(file => ({
              name: file,
              path: path.join(projectFolderPath, file),
              stats: fs.statSync(path.join(projectFolderPath, file))
            }))
            .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()) // Sort by modification time (newest first)
            .slice(0, 20) // Limit to 20 most recent sessions
            .map(item => item.name);
          
          if (allSessionFiles.length > 20) {
            logger.info(`Project ${projectFolder} has ${allSessionFiles.length} sessions, loading latest 20`, 'SessionManager');
          }
          
          let project: Project | undefined;
          let projectPath: string | undefined;
          let projectName: string | undefined;
          let earliestTimestamp: string | undefined;
          
          // First pass: find project information from any session file that has cwd
          for (const sessionFile of sessionFiles) {
            if (projectPath) break; // Already found project info
            
            try {
              const sessionFilePath = path.join(projectFolderPath, sessionFile);
              const sessionData = fs.readFileSync(sessionFilePath, 'utf-8')
                .split('\n')
                .filter(line => line.trim() !== '')
                .map(line => JSON.parse(line));
              
              // Find the first entry with cwd
              const entryWithCwd = sessionData.find(entry => entry.cwd);
              if (entryWithCwd) {
                projectPath = entryWithCwd.cwd;
                projectName = path.basename(projectPath||"");
                earliestTimestamp = entryWithCwd.timestamp;
                logger.debug(`Found project info in folder ${projectFolder}: ${projectName} at ${projectPath}`, 'SessionManager');
                break;
              }
            } catch (error) {
              logger.error(`Failed to read session file: ${sessionFile}`, 'SessionManager', error as Error);
            }
          }
          
          // Create project if we found project info
          if (projectPath && projectName) {
            
            // Since we cleared data, check if project already exists (in case of duplicate cwd paths)
            project = this.data.projects.find(p => p.path === projectPath);
            if (!project) {
              let createdAt: string;
              try {
                createdAt = earliestTimestamp ? new Date(earliestTimestamp).toISOString() : new Date().toISOString();
              } catch (error) {
                createdAt = new Date().toISOString();
              }
              
              project = {
                id: uuidv4(),
                name: projectName,
                path: projectPath,
                createdAt: createdAt,
                sessions: [],
              };
              this.data.projects.push(project);
              projectsSynced++;
              logger.debug(`Created project: ${projectName} (${project.id}) from ${projectPath}`, 'SessionManager');
            }
          } else {
            logger.warn(`No project info found in folder: ${projectFolder}`, 'SessionManager');
          }
          
          // Second pass: process each session file for sessions
          for (const sessionFile of sessionFiles) {
            if (!project) continue; // Skip if no project found
            
            try {
              const sessionFilePath = path.join(projectFolderPath, sessionFile);
              const sessionData = fs.readFileSync(sessionFilePath, 'utf-8')
                .split('\n')
                .filter(line => line.trim() !== '')
                .map(line => JSON.parse(line));
              
              if (sessionData.length > 0) {
                const firstEntry = sessionData[0];
                
                // Process session
                const claudeSessionId = firstEntry.sessionId;
                let session = this.data.sessions.find(s => s.claudeSessionId === claudeSessionId);
                
                const firstUserMessage = sessionData.find(msg => msg.type === 'user');
                const lastMessage = sessionData[sessionData.length - 1];
                
                let sessionName = `Session ${claudeSessionId}`;
                if (firstUserMessage && firstUserMessage.message && firstUserMessage.message.content) {
                  let content: string;
                  if (typeof firstUserMessage.message.content === 'string') {
                    content = firstUserMessage.message.content;
                  } else if (Array.isArray(firstUserMessage.message.content)) {
                    // Handle content array format
                    const textContent = firstUserMessage.message.content.find((item: any) => item.type === 'text');
                    content = textContent ? textContent.text : String(firstUserMessage.message.content);
                  } else {
                    content = String(firstUserMessage.message.content);
                  }
                  
                  // Clean up content and create session name
                  content = content.replace(/cd\s+"[^"]*"|cd\s+\S+/g, '').trim(); // Remove cd commands
                  content = content.replace(/\n|\r/g, ' ').trim(); // Replace newlines with spaces
                  if (content.length > 3) {
                    sessionName = content.substring(0, 50).trim();
                  }
                }
                
                logger.debug(`Session name for ${claudeSessionId}: "${sessionName}"`, 'SessionManager');
                
                let lastActiveAt: string;
                try {
                  lastActiveAt = lastMessage && lastMessage.timestamp 
                    ? new Date(lastMessage.timestamp).toISOString() 
                    : new Date(firstEntry.timestamp).toISOString();
                } catch (error) {
                  lastActiveAt = new Date().toISOString();
                }
                
                // Since we cleared data, create all sessions as new (but check for duplicates by claudeSessionId)
                if (!session) {
                  let createdAt: string;
                  try {
                    createdAt = firstEntry.timestamp ? new Date(firstEntry.timestamp).toISOString() : new Date().toISOString();
                  } catch (error) {
                    createdAt = new Date().toISOString();
                  }
                  
                  session = {
                    id: uuidv4(),
                    name: sessionName,
                    projectId: project.id,
                    createdAt: createdAt,
                    lastActiveAt: lastActiveAt,
                    claudeSessionId: claudeSessionId,
                    isTemporary: false,
                    filePath: sessionFilePath,
                  };
                  this.data.sessions.push(session);
                  sessionsSynced++;
                }
              }
            } catch (error) {
              logger.error(`Failed to process session file: ${sessionFile}`, 'SessionManager', error as Error);
            }
          }
        } catch (error) {
          logger.error(`Failed to process project folder: ${projectFolder}`, 'SessionManager', error as Error);
        }
      }
    }

    this.save(this.data);
    logger.info(`Sync complete. Loaded ${projectsSynced} projects and ${sessionsSynced} sessions from Claude directory.`, 'SessionManager');
  }

  public deleteSession(sessionId: string): void {
    const initialLength = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter(s => s.id !== sessionId);
    if (this.data.sessions.length < initialLength) {
      this.save(this.data);
      logger.info(`Session deleted: ${sessionId}`, 'SessionManager');
    }
  }

  public deleteProject(projectId: string): void {
    const initialLength = this.data.projects.length;
    this.data.projects = this.data.projects.filter(p => p.id !== projectId);
    this.data.sessions = this.data.sessions.filter(s => s.projectId !== projectId);
    if (this.data.projects.length < initialLength) {
      this.save(this.data);
      logger.info(`Project and its sessions deleted: ${projectId}`, 'SessionManager');
    }
  }

  public refreshProjectSessions(projectId: string): void {
    const project = this.getProjectById(projectId);
    if (!project) {
      logger.warn(`Project not found for refresh: ${projectId}`, 'SessionManager');
      return;
    }

    logger.info(`Refreshing sessions for project: ${project.name}`, 'SessionManager');

    // Remove existing sessions for this project
    this.data.sessions = this.data.sessions.filter(s => s.projectId !== projectId);

    const claudeDir = path.join(os.homedir(), '.claude');
    const projectsDir = path.join(claudeDir, 'projects');

    if (!fs.existsSync(projectsDir)) {
      logger.warn('Claude projects directory not found', 'SessionManager');
      return;
    }

    // Find the project folder by matching the project path
    const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    let sessionsSynced = 0;

    for (const projectFolder of projectFolders) {
      try {
        const projectFolderPath = path.join(projectsDir, projectFolder);
        
        // Check if this folder contains sessions for our target project
        const allSessionFiles = fs.readdirSync(projectFolderPath).filter(f => f.endsWith('.jsonl'));
        if (allSessionFiles.length === 0) continue;

        // Check the first session file to see if it matches our project path
        let matchesProject = false;
        try {
          const firstSessionFile = path.join(projectFolderPath, allSessionFiles[0]);
          const sessionData = fs.readFileSync(firstSessionFile, 'utf-8')
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => JSON.parse(line));
          
          const entryWithCwd = sessionData.find(entry => entry.cwd);
          if (entryWithCwd && entryWithCwd.cwd === project.path) {
            matchesProject = true;
          }
        } catch (error) {
          continue;
        }

        if (!matchesProject) continue;

        // Process session files for this project
        const sessionFiles = allSessionFiles
          .map(file => ({
            name: file,
            path: path.join(projectFolderPath, file),
            stats: fs.statSync(path.join(projectFolderPath, file))
          }))
          .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())
          .slice(0, 20)
          .map(item => item.name);

        for (const sessionFile of sessionFiles) {
          try {
            const sessionFilePath = path.join(projectFolderPath, sessionFile);
            const sessionData = fs.readFileSync(sessionFilePath, 'utf-8')
              .split('\n')
              .filter(line => line.trim() !== '')
              .map(line => JSON.parse(line));

            if (sessionData.length > 0) {
              const firstEntry = sessionData[0];
              const claudeSessionId = firstEntry.sessionId;

              // Check if session already exists (avoid duplicates)
              const existingSession = this.data.sessions.find(s => s.claudeSessionId === claudeSessionId);
              if (existingSession) continue;

              const firstUserMessage = sessionData.find(msg => msg.type === 'user');
              const lastMessage = sessionData[sessionData.length - 1];

              let sessionName = `Session ${claudeSessionId}`;
              if (firstUserMessage && firstUserMessage.message && firstUserMessage.message.content) {
                let content: string;
                if (typeof firstUserMessage.message.content === 'string') {
                  content = firstUserMessage.message.content;
                } else if (Array.isArray(firstUserMessage.message.content)) {
                  const textContent = firstUserMessage.message.content.find((item: any) => item.type === 'text');
                  content = textContent ? textContent.text : String(firstUserMessage.message.content);
                } else {
                  content = String(firstUserMessage.message.content);
                }

                content = content.replace(/cd\s+"[^"]*"|cd\s+\S+/g, '').trim();
                content = content.replace(/\n|\r/g, ' ').trim();
                if (content.length > 3) {
                  sessionName = content.substring(0, 50).trim();
                }
              }

              let lastActiveAt: string;
              try {
                lastActiveAt = lastMessage && lastMessage.timestamp 
                  ? new Date(lastMessage.timestamp).toISOString() 
                  : new Date(firstEntry.timestamp).toISOString();
              } catch (error) {
                lastActiveAt = new Date().toISOString();
              }

              let createdAt: string;
              try {
                createdAt = firstUserMessage && firstUserMessage.timestamp 
                  ? new Date(firstUserMessage.timestamp).toISOString() 
                  : new Date(firstEntry.timestamp).toISOString();
              } catch (error) {
                createdAt = new Date().toISOString();
              }

              const session: Session = {
                id: uuidv4(),
                name: sessionName,
                projectId: project.id,
                createdAt: createdAt,
                lastActiveAt: lastActiveAt,
                claudeSessionId: claudeSessionId,
                isTemporary: false,
                filePath: sessionFilePath,
              };

              this.data.sessions.push(session);
              sessionsSynced++;
            }
          } catch (error) {
            logger.error(`Failed to process session file during refresh: ${sessionFile}`, 'SessionManager', error as Error);
          }
        }
        break; // Found the matching project folder, no need to continue
      } catch (error) {
        logger.error(`Failed to process project folder during refresh: ${projectFolder}`, 'SessionManager', error as Error);
      }
    }

    this.save(this.data);
    logger.info(`Refresh complete for project ${project.name}. Loaded ${sessionsSynced} sessions.`, 'SessionManager');
  }
}