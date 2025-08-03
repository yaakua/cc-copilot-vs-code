/**
 * 拦截器常量定义
 */

// 服务提供方类型
const PROVIDER_TYPE_CLAUDE_OFFICIAL = 'claude_official';
const PROVIDER_TYPE_THIRD_PARTY = 'third_party';

// 配置检查间隔（毫秒）
const CONFIG_CHECK_INTERVAL = 30000; // 30秒

module.exports = {
    PROVIDER_TYPE_CLAUDE_OFFICIAL,
    PROVIDER_TYPE_THIRD_PARTY,
    CONFIG_CHECK_INTERVAL
};