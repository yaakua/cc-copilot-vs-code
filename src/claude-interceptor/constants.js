/**
 * Claude拦截器常量定义
 * 定义拦截器模块使用的各种常量值
 */

/** Claude官方服务提供商类型标识 */
const PROVIDER_TYPE_CLAUDE_OFFICIAL = 'claude_official';

/** 第三方服务提供商类型标识 */
const PROVIDER_TYPE_THIRD_PARTY = 'third_party';

/** 配置检查间隔时间（毫秒） - 每30秒检查一次配置更新 */
const CONFIG_CHECK_INTERVAL = 30000; // 30秒

/**
 * 导出所有常量
 * 供其他模块使用的常量定义
 */
module.exports = {
    PROVIDER_TYPE_CLAUDE_OFFICIAL,
    PROVIDER_TYPE_THIRD_PARTY,
    CONFIG_CHECK_INTERVAL
};