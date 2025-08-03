import { Session, Project } from '../shared/types'

/**
 * 存储数据接口
 * 定义会话管理器存储的完整数据结构
 */
export interface StoreData {
  /** 项目列表 */
  projects: Project[]
  /** 会话列表 */
  sessions: Session[]
}

/**
 * 重新导出共享类型
 * 为了方便其他模块使用，重新导出核心数据类型
 */
export { Session, Project }