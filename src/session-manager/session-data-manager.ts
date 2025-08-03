import { Session, StoreData } from './types'

/**
 * 会话数据管理器
 * 负责管理会话数据的增删改查操作，提供统一的数据访问接口
 */
export class SessionDataManager {
  /**
   * 构造函数
   * @param getData - 获取存储数据的函数，返回完整的存储数据结构
   * @param saveData - 保存数据的函数，接收完整的存储数据结构并持久化
   */
  constructor(
    private getData: () => StoreData,
    private saveData: (data: StoreData) => void
  ) {}

  /**
   * 根据项目ID获取该项目下的所有会话
   * @param projectId - 项目唯一标识符
   * @returns 属于指定项目的会话数组
   */
  getSessions(projectId: string): Session[] {
    return this.getData().sessions.filter(s => s.projectId === projectId)
  }

  /**
   * 获取所有会话数据
   * @returns 系统中的所有会话数组
   */
  getAllSessions(): Session[] {
    return this.getData().sessions
  }

  /**
   * 根据会话ID查找特定会话
   * @param sessionId - 会话唯一标识符
   * @returns 找到的会话对象，如果不存在则返回undefined
   */
  getSessionById(sessionId: string): Session | undefined {
    return this.getData().sessions.find(s => s.id === sessionId)
  }

  /**
   * 添加或更新会话
   * 如果会话ID已存在，则更新现有会话；否则添加新会话
   * @param session - 要添加或更新的会话对象
   */
  addSession(session: Session): void {
    const data = this.getData()
    // 检查是否已存在相同ID的会话
    const existingIndex = data.sessions.findIndex(s => s.id === session.id)
    if (existingIndex >= 0) {
      // 更新现有会话
      data.sessions[existingIndex] = session
    } else {
      // 添加新会话
      data.sessions.push(session)
    }
    // 持久化数据变更
    this.saveData(data)
  }

  /**
   * 更新指定会话的部分属性
   * @param sessionId - 要更新的会话ID
   * @param updates - 包含要更新字段的部分会话对象
   * @returns 更新后的完整会话对象，如果会话不存在则返回undefined
   */
  updateSession(sessionId: string, updates: Partial<Session>): Session | undefined {
    const data = this.getData()
    const sessionIndex = data.sessions.findIndex(s => s.id === sessionId)
    if (sessionIndex >= 0) {
      // 合并现有会话数据和更新数据
      const updatedSession = { ...data.sessions[sessionIndex], ...updates }
      data.sessions[sessionIndex] = updatedSession
      // 持久化数据变更
      this.saveData(data)
      return updatedSession
    }
    return undefined
  }

  /**
   * 删除指定的会话
   * @param sessionId - 要删除的会话ID
   */
  deleteSession(sessionId: string): void {
    const data = this.getData()

    // 找到要删除的会话对象
    const sessionToDelete = data.sessions.find(s => s.id === sessionId)

    // 如果会话关联了文件路径，需要同时删除物理文件
    if (sessionToDelete?.filePath) {
      try {
        const fs = require('fs')
        // 检查文件是否存在，避免删除不存在的文件时报错
        if (fs.existsSync(sessionToDelete.filePath)) {
          // 同步删除会话关联的文件
          fs.unlinkSync(sessionToDelete.filePath)
          console.log(`已删除会话文件: ${sessionToDelete.filePath}`)
        }
      } catch (error) {
        // 文件删除失败时记录错误，但不阻止会话数据的删除
        console.error(`删除会话文件失败: ${sessionToDelete.filePath}`, error)
      }
    }

    // 从会话列表中过滤掉要删除的会话
    data.sessions = data.sessions.filter(s => s.id !== sessionId)
    // 持久化数据变更到存储
    this.saveData(data)
  }

  /**
   * 刷新指定项目的会话数据
   * 用于重新加载或同步特定项目的会话信息
   * @param projectId - 要刷新的项目ID
   * @todo 实现具体的刷新逻辑
   */
  refreshProjectSessions(projectId: string): void {
    // 此方法将实现刷新特定项目会话的逻辑
    // 目前是占位符，因为原始实现为空
  }
}