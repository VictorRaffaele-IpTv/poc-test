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
            timeouts: 0
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
                return res.status(503).json({
                    error: "Server overloaded - queue full",
                    queue_size: this.queue.length,
                    active_requests: this.activeRequests,
                    retry_after: Math.ceil(this.queue.length / this.maxConcurrent)
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
        
        // Log da fila
        console.log(`[Queue] Request queued. Queue size: ${this.queue.length}, Active: ${this.activeRequests}`)
    }

    /**
     * Processa próxima requisição da fila
     */
    processQueue() {
        if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
            const queueItem = this.queue.shift()
            
            // Cancelar timeout
            clearTimeout(queueItem.timeout)
            
            // Verificar se a resposta ainda está ativa
            if (!queueItem.res.headersSent) {
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
            queue_utilization: (this.queue.length / this.maxQueueSize) * 100,
            capacity_utilization: (this.activeRequests / this.maxConcurrent) * 100
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
            timeouts: 0
        }
    }
}

// Instâncias para diferentes tipos de operação
const createQueue = new RequestQueue({
    maxConcurrent: 5,  // Máximo 5 creates simultâneos
    maxQueueSize: 500, // Fila de até 500 creates
    timeout: 20000     // 20s timeout
})

const readQueue = new RequestQueue({
    maxConcurrent: 15, // Mais reads simultâneos
    maxQueueSize: 200,
    timeout: 15000
})

const systemQueue = new RequestQueue({
    maxConcurrent: 8,  // Operações de sistema
    maxQueueSize: 300,
    timeout: 25000
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