/**
 * Batch Processor Service - Sistema de processamento em lote
 * Similar ao TMS batch processing
 */
class BatchProcessor {
    constructor() {
        this.activeBatches = new Map()
        this.batchStats = {
            created: 0,
            processed: 0,
            failed: 0
        }
    }

    /**
     * Cria um novo batch com ID único
     */
    createBatch(type, options = {}) {
        const batchId = this.generateBatchId()
        const batch = {
            id: batchId,
            type,
            items: [],
            status: 'created',
            createdAt: new Date(),
            options: {
                maxSize: options.maxSize || 1000,
                autoFlush: options.autoFlush || false,
                flushInterval: options.flushInterval || 5000,
                ...options
            }
        }

        this.activeBatches.set(batchId, batch)
        this.batchStats.created++

        console.log(`[BatchProcessor] Created batch ${batchId} of type ${type}`)

        return new BatchInstance(this, batch)
    }

    /**
     * Executa um batch completo
     */
    async processBatch(batchId, processor) {
        const batch = this.activeBatches.get(batchId)
        if (!batch) {
            throw new Error(`Batch ${batchId} not found`)
        }

        batch.status = 'processing'
        batch.processedAt = new Date()

        try {
            const result = await processor(batch.items)
            
            batch.status = 'completed'
            batch.completedAt = new Date()
            batch.result = result

            this.batchStats.processed++
            console.log(`[BatchProcessor] Batch ${batchId} completed successfully`)

            return result
        } catch (error) {
            batch.status = 'failed'
            batch.error = error.message
            batch.failedAt = new Date()

            this.batchStats.failed++
            console.error(`[BatchProcessor] Batch ${batchId} failed:`, error)

            throw error
        } finally {
            // Cleanup após processamento
            setTimeout(() => {
                this.activeBatches.delete(batchId)
            }, 60000) // Remove após 1 minuto
        }
    }

    /**
     * Obtém estatísticas dos batches
     */
    getStats() {
        return {
            ...this.batchStats,
            activeBatches: this.activeBatches.size,
            batches: Array.from(this.activeBatches.values()).map(batch => ({
                id: batch.id,
                type: batch.type,
                status: batch.status,
                itemCount: batch.items.length,
                createdAt: batch.createdAt
            }))
        }
    }

    /**
     * Force flush em todos os batches ativos
     */
    async flushAll() {
        const results = []
        
        for (const [batchId, batch] of this.activeBatches) {
            if (batch.status === 'created' && batch.items.length > 0) {
                try {
                    const batchInstance = new BatchInstance(this, batch)
                    const result = await batchInstance.flush()
                    results.push({
                        batchId,
                        success: true,
                        result
                    })
                } catch (error) {
                    results.push({
                        batchId,
                        success: false,
                        error: error.message
                    })
                }
            }
        }

        return {
            flushed: results.length,
            results
        }
    }

    // Private methods
    generateBatchId() {
        return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
}

/**
 * Instância de um batch específico
 */
class BatchInstance {
    constructor(processor, batchConfig) {
        this.processor = processor
        this.config = batchConfig
        this.autoFlushTimer = null

        if (this.config.options.autoFlush) {
            this.setupAutoFlush()
        }
    }

    /**
     * Adiciona item ao batch
     */
    async push(item) {
        if (this.config.status !== 'created') {
            throw new Error(`Cannot push to batch ${this.config.id} - status: ${this.config.status}`)
        }

        this.config.items.push({
            ...item,
            addedAt: new Date()
        })

        // Auto flush se atingir o limite
        if (this.config.items.length >= this.config.options.maxSize) {
            console.log(`[BatchProcessor] Auto-flushing batch ${this.config.id} - max size reached`)
            return await this.flush()
        }

        return this.config.items.length
    }

    /**
     * Executa o batch (flush)
     */
    async flush() {
        if (this.config.items.length === 0) {
            console.log(`[BatchProcessor] Batch ${this.config.id} is empty - skipping flush`)
            return { processed: 0, items: [] }
        }

        if (this.autoFlushTimer) {
            clearTimeout(this.autoFlushTimer)
            this.autoFlushTimer = null
        }

        return await this.processor.processBatch(this.config.id, async (items) => {
            // Retorna os itens para processamento
            return {
                processed: items.length,
                items: items,
                batchId: this.config.id
            }
        })
    }

    /**
     * Cancela o batch
     */
    cancel() {
        this.config.status = 'cancelled'
        
        if (this.autoFlushTimer) {
            clearTimeout(this.autoFlushTimer)
            this.autoFlushTimer = null
        }

        console.log(`[BatchProcessor] Batch ${this.config.id} cancelled`)
    }

    /**
     * Obtém informações do batch
     */
    getInfo() {
        return {
            id: this.config.id,
            type: this.config.type,
            status: this.config.status,
            itemCount: this.config.items.length,
            maxSize: this.config.options.maxSize,
            createdAt: this.config.createdAt,
            autoFlush: this.config.options.autoFlush
        }
    }

    // Private methods
    setupAutoFlush() {
        this.autoFlushTimer = setTimeout(() => {
            if (this.config.status === 'created' && this.config.items.length > 0) {
                console.log(`[BatchProcessor] Auto-flushing batch ${this.config.id} - time interval`)
                this.flush().catch(error => {
                    console.error(`[BatchProcessor] Auto-flush failed for batch ${this.config.id}:`, error)
                })
            }
        }, this.config.options.flushInterval)
    }
}

// Singleton instance
const batchProcessor = new BatchProcessor()

module.exports = {
    BatchProcessor,
    BatchInstance,
    batchProcessor
}