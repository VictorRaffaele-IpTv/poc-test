/**
 * LRU Cache Service - Least Recently Used Cache
 * Similar ao scaffold/repository do TMS
 */
class LRUCache {
    constructor(maxSize = 1000, ttlMs = 30 * 60 * 1000) { // 30min default TTL
        this.maxSize = maxSize
        this.ttl = ttlMs
        this.cache = new Map()
        this.accessOrder = new Map() // Para tracking LRU
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        }
    }

    /**
     * Obtém valor do cache
     */
    get(key) {
        const item = this.cache.get(key)
        
        if (!item) {
            this.stats.misses++
            return null
        }

        // Verificar TTL
        if (this.isExpired(item)) {
            this.delete(key)
            this.stats.misses++
            return null
        }

        // Atualizar ordem de acesso (mover para o final = mais recente)
        this.updateAccessOrder(key)
        this.stats.hits++
        
        return item.value
    }

    /**
     * Define valor no cache
     */
    set(key, value, customTtl = null) {
        const now = Date.now()
        const expiresAt = now + (customTtl || this.ttl)
        
        const item = {
            value,
            createdAt: now,
            expiresAt,
            accessCount: 1,
            lastAccess: now
        }

        // Se já existe, remove da ordem atual
        if (this.cache.has(key)) {
            this.accessOrder.delete(key)
        }

        this.cache.set(key, item)
        this.updateAccessOrder(key)
        this.stats.sets++

        // Verificar se precisa fazer eviction
        this.evictIfNeeded()
    }

    /**
     * Remove item do cache
     */
    delete(key) {
        const existed = this.cache.delete(key)
        this.accessOrder.delete(key)
        
        if (existed) {
            this.stats.deletes++
        }
        
        return existed
    }

    /**
     * Verifica se chave existe no cache (sem afetar LRU)
     */
    has(key) {
        const item = this.cache.get(key)
        return item && !this.isExpired(item)
    }

    /**
     * Obtém ou define valor (get-or-set pattern)
     */
    async getOrSet(key, asyncValueFunction, customTtl = null) {
        let value = this.get(key)
        
        if (value !== null) {
            return value
        }

        // Cache miss - executar função para obter valor
        try {
            value = await asyncValueFunction()
            this.set(key, value, customTtl)
            return value
        } catch (error) {
            console.error(`[Cache] Failed to get value for key '${key}':`, error)
            throw error
        }
    }

    /**
     * Limpa todo o cache
     */
    clear() {
        const size = this.cache.size
        this.cache.clear()
        this.accessOrder.clear()
        
        console.log(`[Cache] Cleared ${size} items`)
    }

    /**
     * Remove itens expirados
     */
    cleanup() {
        const before = this.cache.size
        let cleaned = 0

        for (const [key, item] of this.cache.entries()) {
            if (this.isExpired(item)) {
                this.delete(key)
                cleaned++
            }
        }

        if (cleaned > 0) {
            console.log(`[Cache] Cleaned ${cleaned} expired items (${before} -> ${this.cache.size})`)
        }

        return cleaned
    }

    /**
     * Obtém estatísticas do cache
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0 
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            size: this.cache.size,
            maxSize: this.maxSize,
            usage: `${((this.cache.size / this.maxSize) * 100).toFixed(1)}%`,
            ttlMs: this.ttl,
            oldestItem: this.getOldestItem(),
            newestItem: this.getNewestItem()
        }
    }

    /**
     * Lista todas as chaves (ordenadas por acesso recente)
     */
    keys() {
        return Array.from(this.accessOrder.keys()).reverse() // Mais recente primeiro
    }

    /**
     * Lista todos os valores
     */
    values() {
        return this.keys().map(key => this.cache.get(key)?.value).filter(Boolean)
    }

    /**
     * Itera sobre itens válidos (não expirados)
     */
    entries() {
        const validEntries = []
        
        for (const key of this.keys()) {
            const item = this.cache.get(key)
            if (item && !this.isExpired(item)) {
                validEntries.push([key, item.value])
            }
        }
        
        return validEntries
    }

    /**
     * Define múltiplos valores
     */
    setMultiple(keyValuePairs, customTtl = null) {
        for (const [key, value] of Object.entries(keyValuePairs)) {
            this.set(key, value, customTtl)
        }
    }

    /**
     * Obtém múltiplos valores
     */
    getMultiple(keys) {
        const result = {}
        
        for (const key of keys) {
            const value = this.get(key)
            if (value !== null) {
                result[key] = value
            }
        }
        
        return result
    }

    /**
     * Remove itens por pattern de chave
     */
    deleteByPattern(pattern) {
        const regex = new RegExp(pattern)
        let deleted = 0
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.delete(key)
                deleted++
            }
        }
        
        console.log(`[Cache] Deleted ${deleted} items matching pattern: ${pattern}`)
        return deleted
    }

    // Private methods

    isExpired(item) {
        return Date.now() > item.expiresAt
    }

    updateAccessOrder(key) {
        // Remove da posição atual
        this.accessOrder.delete(key)
        // Adiciona no final (mais recente)
        this.accessOrder.set(key, Date.now())
        
        // Atualizar item
        const item = this.cache.get(key)
        if (item) {
            item.lastAccess = Date.now()
            item.accessCount++
        }
    }

    evictIfNeeded() {
        while (this.cache.size > this.maxSize) {
            // Remover o item menos recentemente usado (primeiro na ordem)
            const oldestKey = this.accessOrder.keys().next().value
            
            if (oldestKey) {
                this.delete(oldestKey)
                this.stats.evictions++
                console.log(`[Cache] Evicted LRU item: ${oldestKey}`)
            } else {
                break
            }
        }
    }

    getOldestItem() {
        const oldestKey = this.accessOrder.keys().next().value
        if (oldestKey) {
            const item = this.cache.get(oldestKey)
            return {
                key: oldestKey,
                age: Date.now() - item.createdAt,
                accessCount: item.accessCount
            }
        }
        return null
    }

    getNewestItem() {
        const keys = Array.from(this.accessOrder.keys())
        const newestKey = keys[keys.length - 1]
        
        if (newestKey) {
            const item = this.cache.get(newestKey)
            return {
                key: newestKey,
                age: Date.now() - item.createdAt,
                accessCount: item.accessCount
            }
        }
        return null
    }
}

/**
 * Multi-layer Cache Service
 * Combina múltiplos caches LRU para diferentes tipos de dados
 */
class CacheService {
    constructor() {
        this.caches = {
            // Cache principal para dados de aplicação
            app: new LRUCache(1000, 30 * 60 * 1000), // 1k items, 30min TTL
            
            // Cache de sessões de usuário
            session: new LRUCache(500, 60 * 60 * 1000), // 500 items, 1h TTL
            
            // Cache de queries de database
            db: new LRUCache(2000, 15 * 60 * 1000), // 2k items, 15min TTL
            
            // Cache de resultados de API
            api: new LRUCache(1500, 10 * 60 * 1000), // 1.5k items, 10min TTL
            
            // Cache temporário para operações rápidas
            temp: new LRUCache(100, 5 * 60 * 1000) // 100 items, 5min TTL
        }
    }

    /**
     * Obtém cache por nome
     */
    getCache(name = 'app') {
        if (!this.caches[name]) {
            throw new Error(`Cache '${name}' not found. Available: ${Object.keys(this.caches).join(', ')}`)
        }
        return this.caches[name]
    }

    /**
     * Operações convenientes para cache principal
     */
    get(key) { return this.caches.app.get(key) }
    set(key, value, ttl) { return this.caches.app.set(key, value, ttl) }
    delete(key) { return this.caches.app.delete(key) }
    has(key) { return this.caches.app.has(key) }
    
    /**
     * Cache de database queries
     */
    cacheQuery(sql, params, result, ttl) {
        const key = `query:${this.hashQuery(sql, params)}`
        this.caches.db.set(key, result, ttl)
    }
    
    getCachedQuery(sql, params) {
        const key = `query:${this.hashQuery(sql, params)}`
        return this.caches.db.get(key)
    }

    /**
     * Cache de sessões
     */
    setSession(sessionId, sessionData, ttl) {
        this.caches.session.set(`session:${sessionId}`, sessionData, ttl)
    }
    
    getSession(sessionId) {
        return this.caches.session.get(`session:${sessionId}`)
    }

    /**
     * Limpa todos os caches
     */
    clearAll() {
        for (const [name, cache] of Object.entries(this.caches)) {
            cache.clear()
            console.log(`[CacheService] Cleared cache: ${name}`)
        }
    }

    /**
     * Limpeza de itens expirados em todos os caches
     */
    cleanupAll() {
        let totalCleaned = 0
        
        for (const [name, cache] of Object.entries(this.caches)) {
            const cleaned = cache.cleanup()
            totalCleaned += cleaned
        }
        
        return totalCleaned
    }

    /**
     * Estatísticas de todos os caches
     */
    getAllStats() {
        const stats = {}
        
        for (const [name, cache] of Object.entries(this.caches)) {
            stats[name] = cache.getStats()
        }
        
        return {
            caches: stats,
            totalItems: Object.values(stats).reduce((sum, stat) => sum + stat.size, 0),
            avgHitRate: this.calculateAvgHitRate(stats)
        }
    }

    // Private methods

    hashQuery(sql, params) {
        const queryStr = sql + JSON.stringify(params || {})
        
        // Simple hash function
        let hash = 0
        for (let i = 0; i < queryStr.length; i++) {
            const char = queryStr.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // Convert to 32bit integer
        }
        
        return hash.toString(36)
    }

    calculateAvgHitRate(stats) {
        const hitRates = Object.values(stats)
            .map(stat => parseFloat(stat.hitRate.replace('%', '')))
            .filter(rate => !isNaN(rate))
        
        if (hitRates.length === 0) return '0%'
        
        const avg = hitRates.reduce((sum, rate) => sum + rate, 0) / hitRates.length
        return `${avg.toFixed(2)}%`
    }
}

// Singleton instance
const cacheService = new CacheService()

// Cleanup job - roda a cada 10 minutos
setInterval(() => {
    cacheService.cleanupAll()
}, 10 * 60 * 1000)

module.exports = {
    LRUCache,
    CacheService,
    cache: cacheService
}
