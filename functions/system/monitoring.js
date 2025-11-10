/**
 * Obtém estatísticas do sistema PubSub + Cache
 * TMS-style monitoring endpoint
 */
module.exports = async (deps, { query }) => {
    const { Activity, cache, pubSub } = deps
    const { include_history = 'false', history_limit = 100 } = query

    // Estatísticas do Cache
    const cacheStats = cache.getAllStats()
    
    // Estatísticas do PubSub
    const pubSubStats = pubSub.getStats()
    
    // Estatísticas específicas da Activity
    const activityCacheStats = Activity.getCacheStats()
    
    // Histórico de mensagens PubSub (opcional)
    let messageHistory = null
    if (include_history === 'true') {
        messageHistory = pubSub.getHistory({
            limit: parseInt(history_limit)
        })
    }

    // Estatísticas de uso do banco
    const dbStats = {
        total_activities: await Activity.count(),
        activities_by_difficulty: await Activity.countByDifficulty(),
        cache_hit_rate: activityCacheStats.hitRate
    }

    return {
        success: true,
        data: {
            timestamp: new Date().toISOString(),
            
            // Cache Statistics
            cache: {
                summary: {
                    total_items: cacheStats.totalItems,
                    avg_hit_rate: cacheStats.avgHitRate
                },
                by_type: cacheStats.caches,
                activity_specific: {
                    items: activityCacheStats.activity_specific_items,
                    hit_rate: activityCacheStats.hitRate,
                    sample_keys: activityCacheStats.activity_cache_keys
                }
            },

            // PubSub Statistics  
            pubsub: {
                active_subscriptions: pubSubStats.active_subscriptions,
                total_listeners: pubSubStats.total_listeners,
                message_history_size: pubSubStats.message_history_size,
                channels: pubSubStats.channels,
                events_by_channel: pubSubStats.events_by_channel
            },

            // Database Statistics
            database: dbStats,

            // Message History (se solicitado)
            ...(messageHistory && { message_history: messageHistory })
        }
    }
}