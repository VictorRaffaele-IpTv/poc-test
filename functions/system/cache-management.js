/**
 * Gerenciamento de cache - limpeza, aquecimento, invalidação
 * TMS-style cache management
 */
module.exports = async (deps, { body, query }) => {
    const { Activity, cache, pubSub } = deps
    const { action } = body || {}
    const { type = 'all' } = query

    const results = {}

    switch (action) {
        case 'clear_all':
            // Limpar todos os caches
            cache.clearAll()
            results.message = 'All caches cleared'
            results.action = 'clear_all'
            
            // Publicar evento
            pubSub.publish('system', 'cache_cleared', {
                type: 'all',
                timestamp: new Date().toISOString()
            })
            break

        case 'clear_activity':
            // Limpar apenas caches relacionados a atividades
            cache.getCache('db').deleteByPattern('activit.*')
            results.message = 'Activity caches cleared'
            results.action = 'clear_activity'
            
            pubSub.publish('system', 'cache_cleared', {
                type: 'activity',
                timestamp: new Date().toISOString()
            })
            break

        case 'cleanup_expired':
            // Limpar apenas itens expirados
            const cleaned = cache.cleanupAll()
            results.message = `Cleaned ${cleaned} expired items`
            results.cleaned_items = cleaned
            results.action = 'cleanup_expired'
            
            pubSub.publish('system', 'cache_cleaned', {
                items_cleaned: cleaned,
                timestamp: new Date().toISOString()
            })
            break

        case 'warmup':
            // Aquecer cache com dados populares
            await Activity.warmUpCache()
            results.message = 'Cache warmed up with popular activities'
            results.action = 'warmup'
            break

        case 'stats':
            // Retornar apenas estatísticas
            results.cache_stats = cache.getAllStats()
            results.activity_cache_stats = Activity.getCacheStats()
            results.action = 'stats'
            break

        case 'invalidate_key':
            // Invalidar chave específica
            const { key } = body
            if (!key) {
                throw new Error('Key is required for invalidate_key action')
            }
            
            const deleted = cache.delete(key)
            results.message = `Key '${key}' ${deleted ? 'invalidated' : 'not found'}`
            results.key_existed = deleted
            results.action = 'invalidate_key'
            
            pubSub.publish('system', 'cache_key_invalidated', {
                key,
                existed: deleted,
                timestamp: new Date().toISOString()
            })
            break

        default:
            throw new Error(`Invalid action: ${action}. Available: clear_all, clear_activity, cleanup_expired, warmup, stats, invalidate_key`)
    }

    return {
        success: true,
        data: results
    }
}