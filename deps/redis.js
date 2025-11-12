/**
 * Redis Client - Infraestrutura de Cache Distribuído
 * 
 * Cliente Redis compartilhado para toda a aplicação
 * Usado por: API, Workers, Jobs
 */

const redis = require('redis')
const config = require('../config')

let redisClient = null
let redisReady = false

/**
 * Cria e retorna cliente Redis
 * Usa singleton pattern para reutilizar conexão
 */
function getRedisClient() {
    if (redisClient && redisReady) {
        return redisClient
    }
    
    // Obter URL do Redis da config ou variável de ambiente
    const redisUrl = process.env.REDIS_URL || config.redis?.url || 'redis://redis:6379'
    
    console.log(`[Redis] Conectando em: ${redisUrl}`)
    
    // Criar cliente Redis v4
    redisClient = redis.createClient({
        url: redisUrl,
        socket: {
            reconnectStrategy: (retries) => {
                if (retries > 10) {
                    console.error('[Redis] Máximo de tentativas de reconexão atingido')
                    return new Error('Redis max retries reached')
                }
                // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
                const delay = Math.min(retries * 100, 3000)
                console.log(`[Redis] Reconectando em ${delay}ms (tentativa ${retries})`)
                return delay
            }
        }
    })
    
    // Event handlers
    redisClient.on('connect', () => {
        console.log('[Redis] Conectando...')
    })
    
    redisClient.on('ready', () => {
        console.log('[Redis] ✅ Pronto para uso')
        redisReady = true
    })
    
    redisClient.on('error', (err) => {
        console.error('[Redis] ❌ Erro:', err.message)
        redisReady = false
    })
    
    redisClient.on('end', () => {
        console.log('[Redis] Conexão fechada')
        redisReady = false
    })
    
    redisClient.on('reconnecting', () => {
        console.log('[Redis] Reconectando...')
        redisReady = false
    })
    
    // Conectar (async)
    redisClient.connect().catch(err => {
        console.error('[Redis] Falha na conexão inicial:', err.message)
    })
    
    return redisClient
}

/**
 * Verifica se Redis está pronto
 */
function isRedisReady() {
    return redisReady
}

/**
 * Wrapper com fallback gracioso para operações Redis
 * Todas as operações retornam valores seguros em caso de erro
 */
const redisWrapper = {
    /**
     * GET - Busca valor por chave
     */
    async get(key) {
        try {
            if (!redisReady) return null
            return await redisClient.get(key)
        } catch (error) {
            console.error(`[Redis] Erro no GET ${key}:`, error.message)
            return null
        }
    },
    
    /**
     * SET - Define valor com TTL opcional
     */
    async set(key, value, ttl) {
        try {
            if (!redisReady) return false
            if (ttl) {
                await redisClient.setEx(key, ttl, value)
            } else {
                await redisClient.set(key, value)
            }
            return true
        } catch (error) {
            console.error(`[Redis] Erro no SET ${key}:`, error.message)
            return false
        }
    },
    
    /**
     * SETEX - Define valor com TTL (alias)
     */
    async setex(key, ttl, value) {
        return this.set(key, value, ttl)
    },
    
    /**
     * DEL - Remove uma ou mais chaves
     */
    async del(...keys) {
        try {
            if (!redisReady) return 0
            return await redisClient.del(keys)
        } catch (error) {
            console.error(`[Redis] Erro no DEL:`, error.message)
            return 0
        }
    },
    
    /**
     * KEYS - Busca chaves por pattern
     * ATENÇÃO: Operação custosa em produção com muitas chaves
     */
    async keys(pattern) {
        try {
            if (!redisReady) return []
            return await redisClient.keys(pattern)
        } catch (error) {
            console.error(`[Redis] Erro no KEYS ${pattern}:`, error.message)
            return []
        }
    },
    
    /**
     * EXISTS - Verifica se chave existe
     */
    async exists(key) {
        try {
            if (!redisReady) return false
            const result = await redisClient.exists(key)
            return result === 1
        } catch (error) {
            console.error(`[Redis] Erro no EXISTS ${key}:`, error.message)
            return false
        }
    },
    
    /**
     * TTL - Retorna tempo de vida restante da chave
     */
    async ttl(key) {
        try {
            if (!redisReady) return -1
            return await redisClient.ttl(key)
        } catch (error) {
            console.error(`[Redis] Erro no TTL ${key}:`, error.message)
            return -1
        }
    },
    
    /**
     * EXPIRE - Define TTL para chave existente
     */
    async expire(key, seconds) {
        try {
            if (!redisReady) return false
            return await redisClient.expire(key, seconds)
        } catch (error) {
            console.error(`[Redis] Erro no EXPIRE ${key}:`, error.message)
            return false
        }
    },
    
    /**
     * INFO - Retorna informações do servidor Redis
     */
    async info(section = 'stats') {
        try {
            if (!redisReady) return ''
            return await redisClient.info(section)
        } catch (error) {
            console.error(`[Redis] Erro no INFO:`, error.message)
            return ''
        }
    },
    
    /**
     * FLUSHDB - Limpa todo o banco atual (CUIDADO!)
     */
    async flushdb() {
        try {
            if (!redisReady) return false
            await redisClient.flushDb()
            console.log('[Redis] Database limpo (FLUSHDB)')
            return true
        } catch (error) {
            console.error('[Redis] Erro no FLUSHDB:', error.message)
            return false
        }
    },
    
    /**
     * INCR - Incrementa valor numérico
     */
    async incr(key) {
        try {
            if (!redisReady) return 0
            return await redisClient.incr(key)
        } catch (error) {
            console.error(`[Redis] Erro no INCR ${key}:`, error.message)
            return 0
        }
    },
    
    /**
     * DECR - Decrementa valor numérico
     */
    async decr(key) {
        try {
            if (!redisReady) return 0
            return await redisClient.decr(key)
        } catch (error) {
            console.error(`[Redis] Erro no DECR ${key}:`, error.message)
            return 0
        }
    }
}

// Inicializar Redis no startup
getRedisClient()

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Redis] SIGTERM recebido, fechando conexão...')
    if (redisClient) {
        await redisClient.quit()
    }
})

process.on('SIGINT', async () => {
    console.log('[Redis] SIGINT recebido, fechando conexão...')
    if (redisClient) {
        await redisClient.quit()
    }
})

module.exports = {
    getRedisClient,
    isRedisReady,
    redis: redisWrapper
}
