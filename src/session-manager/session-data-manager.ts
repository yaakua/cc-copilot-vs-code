import { Session, StoreData } from './types'

export class SessionDataManager {
  constructor(
    private getData: () => StoreData,
    private saveData: (data: StoreData) => void
  ) {}

  getSessions(projectId: string): Session[] {
    return this.getData().sessions.filter(s => s.projectId === projectId)
  }

  getAllSessions(): Session[] {
    return this.getData().sessions
  }

  getSessionById(sessionId: string): Session | undefined {
    return this.getData().sessions.find(s => s.id === sessionId)
  }

  addSession(session: Session): void {
    const data = this.getData()
    const existingIndex = data.sessions.findIndex(s => s.id === session.id)
    if (existingIndex >= 0) {
      data.sessions[existingIndex] = session
    } else {
      data.sessions.push(session)
    }
    this.saveData(data)
  }

  updateSession(sessionId: string, updates: Partial<Session>): Session | undefined {
    const data = this.getData()
    const sessionIndex = data.sessions.findIndex(s => s.id === sessionId)
    if (sessionIndex >= 0) {
      const updatedSession = { ...data.sessions[sessionIndex], ...updates }
      data.sessions[sessionIndex] = updatedSession
      this.saveData(data)
      return updatedSession
    }
    return undefined
  }

  deleteSession(sessionId: string): void {
    const data = this.getData()
    data.sessions = data.sessions.filter(s => s.id !== sessionId)
    this.saveData(data)
  }

  refreshProjectSessions(projectId: string): void {
    // This method would implement logic to refresh sessions for a specific project
    // Currently it's a placeholder as the original implementation was empty
  }
}