/**
 * Cache Middleware - Cache Agressivo para Leituras
 * 
 * Implementa cache-aside pattern com Redis
 * Objetivo: 70%+ hit rate, +1000% performance em leituras
 */

const { redis } = require('./redis')  // Redis client wrapper

// TTLs otimizados por tipo de dado
const CACHE_TTL = {
    activities_list: 60,        // 1 minuto (muda com frequência)
    activity_detail: 300,       // 5 minutos (mais estável)
    responses_list: 120,        // 2 minutos
    response_detail: 240,       // 4 minutos
    stats: 30,                  // 30 segundos (sempre mudando)
    audit_logs: 180,            // 3 minutos
    search_results: 90          // 1.5 minutos
}

/**
 * Middleware de cache para rotas GET
 * 
 * @param {string} keyPrefix - Prefixo da chave (ex: 'activities', 'responses')
 * @param {number} ttl - TTL em segundos
 * @param {function} keyGenerator - Função para gerar chave única baseado na request
 */
function cacheMiddleware(keyPrefix, ttl, keyGenerator = null) {
    return async (req, res, next) => {
        // Apenas cachear GET requests
        if (req.method !== 'GET') {
            return next()
        }
        
        try {
            // Gerar chave de cache única
            const cacheKey = keyGenerator 
                ? keyGenerator(req)
                : generateCacheKey(keyPrefix, req)
            
            // Tentar buscar do cache
            const cachedData = await redis.get(cacheKey)
            
            if (cachedData) {
                // CACHE HIT! 🎯
                const data = JSON.parse(cachedData)
                
                // Adicionar headers informativos
                res.setHeader('X-Cache', 'HIT')
                res.setHeader('X-Cache-Key', cacheKey)
                
                return res.status(200).json(data)
            }
            
            // CACHE MISS - interceptar res.json para salvar no cache
            const originalJson = res.json.bind(res)
            
            res.json = function(body) {
                // Salvar no cache apenas se foi sucesso
                if (res.statusCode === 200 || res.statusCode === 201) {
                    redis.setex(cacheKey, ttl, JSON.stringify(body))
                        .catch(err => console.error('Cache save error:', err))
                }
                
                // Adicionar headers informativos
                res.setHeader('X-Cache', 'MISS')
                res.setHeader('X-Cache-Key', cacheKey)
                
                return originalJson(body)
            }
            
            next()
            
        } catch (error) {
            console.error('Cache middleware error:', error)
            // Em caso de erro no cache, continuar sem cache
            next()
        }
    }
}

/**
 * Gera chave de cache baseado em query parameters
 */
function generateCacheKey(prefix, req) {
    const params = req.query
    const path = req.path
    
    // Ordenar params para cache consistente
    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&')
    
    return `cache:${prefix}:${path}:${sortedParams || 'default'}`
}

/**
 * Invalidar cache por padrão
 * 
 * Chamar após CREATE, UPDATE, DELETE
 */
async function invalidateCache(pattern) {
    try {
        const keys = await redis.keys(`cache:${pattern}*`)
        
        if (keys.length > 0) {
            await redis.del(...keys)
            console.log(`🗑️  Cache invalidado: ${keys.length} chaves removidas (${pattern})`)
        }
        
        return keys.length
    } catch (error) {
        console.error('Cache invalidation error:', error)
        return 0
    }
}

/**
 * Invalidar cache de activities
 * Chamar após: criar, atualizar ou deletar activity
 */
async function invalidateActivitiesCache() {
    await Promise.all([
        invalidateCache('activities'),
        invalidateCache('stats'),      // Stats dependem de activities
        invalidateCache('search')      // Busca pode incluir activities
    ])
}

/**
 * Invalidar cache de responses
 */
async function invalidateResponsesCache(activityId = null) {
    await Promise.all([
        invalidateCache('responses'),
        invalidateCache('stats'),
        activityId ? invalidateCache(`activity_detail:*/${activityId}*`) : Promise.resolve()
    ])
}

/**
 * Pré-aquecer cache com dados mais acessados
 * Chamar no startup da aplicação
 */
async function warmupCache() {
    console.log('🔥 Aquecendo cache...')
    
    try {
        const { Activity } = require('../repository')
        
        // Cachear primeiras páginas de activities (mais acessadas)
        const pages = [1, 2, 3]
        const limits = [10, 20, 50]
        
        for (const page of pages) {
            for (const limit of limits) {
                const key = `cache:activities:list:limit=${limit}&page=${page}`
                const activities = await Activity.list(limit, (page - 1) * limit)
                
                await redis.setex(key, CACHE_TTL.activities_list, JSON.stringify({
                    success: true,
                    data: activities,
                    meta: { page, limit, cached: true }
                }))
            }
        }
        
        console.log('✅ Cache aquecido com sucesso!')
        
    } catch (error) {
        console.error('Warmup cache error:', error)
    }
}

/**
 * Obter estatísticas de cache
 */
async function getCacheStats() {
    try {
        const info = await redis.info('stats')
        const lines = info.split('\r\n')
        
        const stats = {}
        lines.forEach(line => {
            const [key, value] = line.split(':')
            if (key && value) {
                stats[key] = value
            }
        })
        
        // Calcular hit rate
        const hits = parseInt(stats.keyspace_hits || 0)
        const misses = parseInt(stats.keyspace_misses || 0)
        const total = hits + misses
        const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : 0
        
        return {
            hits,
            misses,
            total_requests: total,
            hit_rate: `${hitRate}%`,
            connected_clients: stats.connected_clients,
            used_memory_human: stats.used_memory_human,
            evicted_keys: stats.evicted_keys
        }
        
    } catch (error) {
        console.error('Get cache stats error:', error)
        return null
    }
}

module.exports = {
    cacheMiddleware,
    CACHE_TTL,
    invalidateCache,
    invalidateActivitiesCache,
    invalidateResponsesCache,
    warmupCache,
    getCacheStats,
    generateCacheKey
}
