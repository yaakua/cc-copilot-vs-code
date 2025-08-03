import { Session, Project } from '../shared/types'

export interface StoreData {
  projects: Project[]
  sessions: Session[]
}

export { Session, Project }