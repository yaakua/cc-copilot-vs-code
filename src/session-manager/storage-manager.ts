import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { logger } from '../logger'
import { StoreData } from './types'

export class StorageManager {
  private storePath: string

  constructor(context: vscode.ExtensionContext) {
    this.storePath = path.join(context.globalStorageUri.fsPath, 'session-store.json')
  }

  load(): StoreData {
    try {
      this.ensureStorageDirectory()
      
      if (fs.existsSync(this.storePath)) {
        const rawData = fs.readFileSync(this.storePath, 'utf-8')
        return JSON.parse(rawData)
      } else {
        logger.info('Session store not found, creating a new one.', 'SessionManager')
        const initialData: StoreData = { projects: [], sessions: [] }
        this.save(initialData)
        return initialData
      }
    } catch (error) {
      logger.error('Failed to load session store, resetting.', 'SessionManager', error as Error)
      const initialData: StoreData = { projects: [], sessions: [] }
      this.save(initialData)
      return initialData
    }
  }

  private ensureStorageDirectory(): void {
    const storeDir = path.dirname(this.storePath)
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true })
    }
  }

  save(data: StoreData): void {
    try {
      this.ensureStorageDirectory()
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2))
    } catch (error) {
      logger.error('Failed to save session store.', 'SessionManager', error as Error)
    }
  }
}