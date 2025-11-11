/**
 * Rate Limiter Middleware - Limita taxa de requisições por IP/endpoint
 * Complementa o Queue Manager prevenindo sobrecarga antes do enfileiramento
 */

class RateLimiter {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 60000 // 1 minuto
        this.maxRequests = options.maxRequests || 100
        this.skipSuccessfulRequests = options.skipSuccessfulRequests || false
        
        // Store: Map de IP -> {count, resetTime, requests[]}
        this.clients = new Map()
        
        // Limpar entradas antigas a cada minuto
        setInterval(() => this.cleanup(), this.windowMs)
    }

    /**
     * Middleware de rate limiting
     */
    middleware() {
        return (req, res, next) => {
            const clientId = this.getClientId(req)
            const now = Date.now()
            
            let clientData = this.clients.get(clientId)
            
            // Inicializar ou resetar se a janela expirou
            if (!clientData || now > clientData.resetTime) {
                clientData = {
                    count: 0,
                    resetTime: now + this.windowMs,
                    requests: []
                }
                this.clients.set(clientId, clientData)
            }
            
            // Verificar limite
            if (clientData.count >= this.maxRequests) {
                const timeUntilReset = Math.ceil((clientData.resetTime - now) / 1000)
                
                // Headers de rate limit
                res.setHeader('X-RateLimit-Limit', this.maxRequests)
                res.setHeader('X-RateLimit-Remaining', 0)
                res.setHeader('X-RateLimit-Reset', clientData.resetTime)
                res.setHeader('Retry-After', timeUntilReset)
                
                return res.status(429).json({
                    success: false,
                    error: "Too Many Requests",
                    message: `Rate limit exceeded. Max ${this.maxRequests} requests per ${this.windowMs/1000}s`,
                    retry_after_seconds: timeUntilReset,
                    limit_info: {
                        max_requests: this.maxRequests,
                        window_seconds: this.windowMs / 1000,
                        requests_made: clientData.count,
                        reset_at: new Date(clientData.resetTime).toISOString()
                    }
                })
            }
            
            // Incrementar contador
            clientData.count++
            clientData.requests.push({
                timestamp: now,
                path: req.path,
                method: req.method
            })
            
            // Adicionar headers informativos
            const remaining = this.maxRequests - clientData.count
            res.setHeader('X-RateLimit-Limit', this.maxRequests)
            res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining))
            res.setHeader('X-RateLimit-Reset', clientData.resetTime)
            
            // Se configurado para não contar sucessos, decrementar após resposta
            if (this.skipSuccessfulRequests) {
                const originalJson = res.json
                res.json = function(data) {
                    if (data && data.success !== false && res.statusCode < 400) {
                        clientData.count--
                    }
                    return originalJson.apply(this, arguments)
                }
            }
            
            next()
        }
    }

    /**
     * Obtém identificador do cliente (IP + User-Agent)
     */
    getClientId(req) {
        const ip = req.ip || req.connection.remoteAddress || 'unknown'
        const userAgent = req.get('user-agent') || 'unknown'
        return `${ip}:${userAgent.substring(0, 50)}`
    }

    /**
     * Limpa clientes expirados
     */
    cleanup() {
        const now = Date.now()
        for (const [clientId, data] of this.clients.entries()) {
            if (now > data.resetTime) {
                this.clients.delete(clientId)
            }
        }
    }

    /**
     * Obtém estatísticas do rate limiter
     */
    getStats() {
        const now = Date.now()
        const activeClients = Array.from(this.clients.entries())
            .filter(([_, data]) => now <= data.resetTime)
        
        return {
            active_clients: activeClients.length,
            total_clients_tracked: this.clients.size,
            max_requests_per_window: this.maxRequests,
            window_ms: this.windowMs,
            clients_at_limit: activeClients.filter(([_, data]) => data.count >= this.maxRequests).length,
            average_requests: activeClients.length > 0
                ? Math.round(activeClients.reduce((sum, [_, data]) => sum + data.count, 0) / activeClients.length)
                : 0
        }
    }
}

// Instâncias de rate limiter para diferentes endpoints
const globalRateLimiter = new RateLimiter({
    windowMs: 60000,      // 1 minuto
    maxRequests: 200,     // 200 requests por minuto por cliente
    skipSuccessfulRequests: false
})

const createRateLimiter = new RateLimiter({
    windowMs: 60000,      // 1 minuto
    maxRequests: 50,      // 50 creates por minuto por cliente
    skipSuccessfulRequests: false
})

const readRateLimiter = new RateLimiter({
    windowMs: 60000,      // 1 minuto
    maxRequests: 150,     // 150 reads por minuto por cliente
    skipSuccessfulRequests: false
})

const systemRateLimiter = new RateLimiter({
    windowMs: 60000,      // 1 minuto  
    maxRequests: 30,      // 30 system calls por minuto por cliente
    skipSuccessfulRequests: false
})

module.exports = {
    RateLimiter,
    globalRateLimiter,
    createRateLimiter,
    readRateLimiter,
    systemRateLimiter,
    
    // Middleware específicos
    limitGlobalRate: () => globalRateLimiter.middleware(),
    limitCreateRate: () => createRateLimiter.middleware(),
    limitReadRate: () => readRateLimiter.middleware(),
    limitSystemRate: () => systemRateLimiter.middleware(),
    
    // Função para obter todas as estatísticas
    getAllRateLimitStats: () => ({
        global: globalRateLimiter.getStats(),
        create: createRateLimiter.getStats(),
        read: readRateLimiter.getStats(),
        system: systemRateLimiter.getStats()
    })
}
