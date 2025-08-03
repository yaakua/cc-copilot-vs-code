import * as path from 'path'
import * as vscode from 'vscode'
import { Project, StoreData } from './types'

export class ProjectManager {
  constructor(
    private getData: () => StoreData,
    private saveData: (data: StoreData) => void
  ) {}

  getProjects(): Project[] {
    const projects = this.getData().projects
    return this.sortProjectsByWorkspaceRelevance(projects)
  }

  private sortProjectsByWorkspaceRelevance(projects: Project[]): Project[] {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return projects.sort((a, b) => a.name.localeCompare(b.name))
    }

    const workspacePaths = workspaceFolders.map(folder => folder.uri.fsPath)

    return projects.sort((a, b) => {
      const aIsWorkspace = workspacePaths.some(wsPath => this.arePathsEqual(a.path, wsPath))
      const bIsWorkspace = workspacePaths.some(wsPath => this.arePathsEqual(b.path, wsPath))

      if (aIsWorkspace && !bIsWorkspace) {
        return -1
      }
      if (!aIsWorkspace && bIsWorkspace) {
        return 1
      }

      return a.name.localeCompare(b.name)
    })
  }

  private arePathsEqual(path1: string, path2: string): boolean {
    const normalized1 = path.normalize(path1).toLowerCase()
    const normalized2 = path.normalize(path2).toLowerCase()
    return normalized1 === normalized2
  }

  getWorkspaceProjects(): Project[] {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return []
    }

    const workspacePaths = workspaceFolders.map(folder => folder.uri.fsPath)
    const allProjects = this.getData().projects

    return allProjects.filter(project => 
      workspacePaths.some(wsPath => this.arePathsEqual(project.path, wsPath))
    )
  }

  getProjectById(projectId: string): Project | undefined {
    return this.getData().projects.find(p => p.id === projectId)
  }

  addProject(project: Project): void {
    const data = this.getData()
    const existingIndex = data.projects.findIndex(p => p.id === project.id)
    if (existingIndex >= 0) {
      data.projects[existingIndex] = project
    } else {
      data.projects.push(project)
    }
    this.saveData(data)
  }

  deleteProject(projectId: string): void {
    const data = this.getData()
    data.projects = data.projects.filter(p => p.id !== projectId)
    data.sessions = data.sessions.filter(s => s.projectId !== projectId)
    this.saveData(data)
  }
}