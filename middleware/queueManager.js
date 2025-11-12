/**
 * Queue Manager Middleware - Sistema de Enfileiramento de Requisições
 * Previne sobrecarga processando requisições de forma controlada
 */

class RequestQueue {
    constructor(options = {}) {
        this.maxConcurrent = options.maxConcurrent || 10
        this.maxQueueSize = options.maxQueueSize || 1000
        this.timeout = options.timeout || 30000
        
        this.activeRequests = 0
        this.queue = []
        this.stats = {
            processed: 0,
            queued: 0,
            rejected: 0,
            timeouts: 0,
            avgQueueTime: 0,
            totalQueueTime: 0,
            maxQueueLength: 0,
            maxActiveRequests: 0
        }
    }

    /**
     * Middleware para enfileirar requisições
     */
    middleware() {
        return (req, res, next) => {
            // Verificar se a fila está muito cheia
            if (this.queue.length >= this.maxQueueSize) {
                this.stats.rejected++
                
                // Calcular tempo estimado de espera
                const avgProcessingTime = 2 // segundos (estimativa conservadora)
                const estimatedWaitTime = Math.ceil((this.queue.length * avgProcessingTime) / this.maxConcurrent)
                
                return res.status(503).json({
                    success: false,
                    error: "Server overloaded - queue full",
                    message: "Too many requests. Please retry later.",
                    queue_info: {
                        queue_size: this.queue.length,
                        max_queue_size: this.maxQueueSize,
                        active_requests: this.activeRequests,
                        max_concurrent: this.maxConcurrent,
                        queue_utilization: `${((this.queue.length / this.maxQueueSize) * 100).toFixed(1)}%`,
                        capacity_utilization: `${((this.activeRequests / this.maxConcurrent) * 100).toFixed(1)}%`
                    },
                    retry_after_seconds: estimatedWaitTime,
                    suggestions: [
                        "Reduce request rate",
                        "Implement exponential backoff",
                        "Try again in " + estimatedWaitTime + " seconds"
                    ]
                })
            }

            // Se há capacidade, processar diretamente
            if (this.activeRequests < this.maxConcurrent) {
                this.processRequest(req, res, next)
            } else {
                // Enfileirar requisição
                this.enqueueRequest(req, res, next)
            }
        }
    }

    /**
     * Processa requisição imediatamente
     */
    processRequest(req, res, next) {
        this.activeRequests++
        this.stats.processed++
        
        // Atualizar estatísticas de pico
        if (this.activeRequests > this.stats.maxActiveRequests) {
            this.stats.maxActiveRequests = this.activeRequests
        }
        if (this.queue.length > this.stats.maxQueueLength) {
            this.stats.maxQueueLength = this.queue.length
        }
        
        // Adicionar cleanup quando a resposta terminar
        const originalSend = res.send
        const originalJson = res.json
        
        const cleanup = () => {
            this.activeRequests--
            this.processQueue()
        }
        
        res.send = function(...args) {
            cleanup()
            return originalSend.apply(this, args)
        }
        
        res.json = function(...args) {
            cleanup()
            return originalJson.apply(this, args)
        }
        
        next()
    }

    /**
     * Enfileira requisição para processamento posterior
     */
    enqueueRequest(req, res, next) {
        this.stats.queued++
        
        const queueItem = {
            req,
            res,
            next,
            timestamp: Date.now(),
            timeout: setTimeout(() => {
                this.handleTimeout(queueItem)
            }, this.timeout)
        }
        
        this.queue.push(queueItem)
        
        // Log da fila com mais informações
        const queuePosition = this.queue.length
        const estimatedWaitTime = Math.ceil((queuePosition * 2) / this.maxConcurrent) // 2s por request
        
        console.log(`[Queue] Request queued at position ${queuePosition}. ` +
                    `Queue size: ${this.queue.length}/${this.maxQueueSize}, ` +
                    `Active: ${this.activeRequests}/${this.maxConcurrent}, ` +
                    `Est. wait: ~${estimatedWaitTime}s`)
        
        // Adicionar header informativo para o cliente
        res.setHeader('X-Queue-Position', queuePosition)
        res.setHeader('X-Queue-Size', this.queue.length)
        res.setHeader('X-Estimated-Wait', estimatedWaitTime)
    }

    /**
     * Processa próxima requisição da fila
     */
    processQueue() {
        if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
            const queueItem = this.queue.shift()
            
            // Cancelar timeout
            clearTimeout(queueItem.timeout)
            
            // Calcular tempo na fila
            const queueTime = Date.now() - queueItem.timestamp
            this.stats.totalQueueTime += queueTime
            this.stats.avgQueueTime = this.stats.totalQueueTime / this.stats.processed
            
            // Verificar se a resposta ainda está ativa
            if (!queueItem.res.headersSent) {
                // Adicionar header com tempo na fila
                queueItem.res.setHeader('X-Queue-Time-Ms', queueTime)
                
                this.processRequest(queueItem.req, queueItem.res, queueItem.next)
            }
        }
    }

    /**
     * Lida com timeout de requisições na fila
     */
    handleTimeout(queueItem) {
        this.stats.timeouts++
        
        // Remover da fila
        const index = this.queue.indexOf(queueItem)
        if (index > -1) {
            this.queue.splice(index, 1)
        }
        
        // Responder com timeout se ainda possível
        if (!queueItem.res.headersSent) {
            queueItem.res.status(408).json({
                error: "Request timeout - too long in queue",
                queue_time: Date.now() - queueItem.timestamp
            })
        }
    }

    /**
     * Obtém estatísticas da fila
     */
    getStats() {
        return {
            ...this.stats,
            active_requests: this.activeRequests,
            queue_size: this.queue.length,
            max_concurrent: this.maxConcurrent,
            max_queue_size: this.maxQueueSize,
            queue_utilization: ((this.queue.length / this.maxQueueSize) * 100).toFixed(2),
            capacity_utilization: ((this.activeRequests / this.maxConcurrent) * 100).toFixed(2),
            avg_queue_time_ms: Math.round(this.stats.avgQueueTime || 0),
            success_rate: this.stats.processed > 0 
                ? (((this.stats.processed - this.stats.timeouts) / this.stats.processed) * 100).toFixed(2)
                : 0,
            rejection_rate: (this.stats.processed + this.stats.rejected) > 0
                ? ((this.stats.rejected / (this.stats.processed + this.stats.rejected)) * 100).toFixed(2)
                : 0
        }
    }

    /**
     * Limpa estatísticas
     */
    resetStats() {
        this.stats = {
            processed: 0,
            queued: 0,
            rejected: 0,
            timeouts: 0,
            avgQueueTime: 0,
            totalQueueTime: 0,
            maxQueueLength: 0,
            maxActiveRequests: 0
        }
    }
}

// Instâncias para diferentes tipos de operação
// Configuração otimizada para suportar 260k requisições (80% read / 20% write)
// Burst esperado: ~866 req/s em 5 minutos (~173 writes/s + ~693 reads/s)
const createQueue = new RequestQueue({
    maxConcurrent: 100,  // 100 creates simultâneos = ~500 creates/s @ 200ms latência
    maxQueueSize: 10000, // Fila para 10.000 creates = ~20 segundos de buffer @ 500/s
    timeout: 45000       // 45s timeout (tempo generoso para alta carga)
})

const readQueue = new RequestQueue({
    maxConcurrent: 200,  // 200 reads simultâneos = ~1000 reads/s @ 200ms latência
    maxQueueSize: 50000, // Fila para 15.000 reads = ~15 segundos de buffer @ 1000/s
    timeout: 30000       // 30s timeout (reads são mais rápidas)
})

const systemQueue = new RequestQueue({
    maxConcurrent: 50,   // 50 operações de sistema simultâneas
    maxQueueSize: 2000,  // Fila para 2.000 system calls
    timeout: 45000       // 45s timeout
})

module.exports = {
    RequestQueue,
    createQueue,
    readQueue,
    systemQueue,
    
    // Middleware específicos
    queueCreateRequests: () => createQueue.middleware(),
    queueReadRequests: () => readQueue.middleware(),
    queueSystemRequests: () => systemQueue.middleware(),
    
    // Função para obter todas as estatísticas
    getAllStats: () => ({
        create_queue: createQueue.getStats(),
        read_queue: readQueue.getStats(),
        system_queue: systemQueue.getStats()
    })
}