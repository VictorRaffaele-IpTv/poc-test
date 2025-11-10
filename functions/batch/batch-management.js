const { batchProcessor } = require('../../deps/batchProcessor')
const ActionRegister = require('../../repository/ActionRegister')
const kafkaService = require('../../deps/kafka')

/**
 * POST /api/batch/processor/stats
 * Obtém estatísticas de todos os batch processors ativos
 */
async function getBatchProcessorStats(req, res) {
    try {
        const stats = {
            batch_processor: batchProcessor.getStats(),
            action_register: new ActionRegister().createBatch().getStats(),
            kafka_batch: {
                // Estatísticas do Kafka batch não são facilmente obtidas
                // pois o KafkaBatchProducer é criado sob demanda
                message: 'Kafka batch statistics available on demand'
            }
        }

        res.json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString()
        })

    } catch (error) {
        console.error('Erro ao obter estatísticas do batch processor:', error)
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        })
    }
}

/**
 * POST /api/batch/processor/flush-all
 * Force flush em todos os batch processors ativos
 */
async function flushAllBatches(req, res) {
    try {
        const results = {
            batch_processor: await batchProcessor.flushAll(),
            timestamp: new Date().toISOString()
        }

        res.json({
            success: true,
            message: 'Flush executado em todos os batch processors',
            data: results
        })

    } catch (error) {
        console.error('Erro ao fazer flush dos batch processors:', error)
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        })
    }
}

/**
 * POST /api/batch/test
 * Testa o sistema de batch processing com dados fictícios
 */
async function testBatchSystem(req, res) {
    try {
        const { batch_size = 10, auto_flush = true } = req.body

        // Criar um batch de teste
        const testBatch = batchProcessor.createBatch('test_batch', {
            size: batch_size,
            autoFlushTime: auto_flush ? 2000 : null
        })

        // Adicionar items de teste
        const testItems = []
        for (let i = 1; i <= batch_size; i++) {
            const item = {
                id: i,
                name: `Test Item ${i}`,
                timestamp: new Date(),
                data: { test: true, batch_id: testBatch.id }
            }
            
            testBatch.push(item)
            testItems.push(item)
        }

        // Se não for auto flush, fazer flush manual
        let flushResult = null
        if (!auto_flush) {
            flushResult = await testBatch.flush()
        }

        res.json({
            success: true,
            message: 'Teste de batch processing executado',
            data: {
                batch_id: testBatch.id,
                items_added: testItems.length,
                auto_flush_enabled: auto_flush,
                flush_result: flushResult,
                batch_stats: testBatch.getStats(),
                test_items: testItems
            }
        })

    } catch (error) {
        console.error('Erro no teste do sistema de batch:', error)
        res.status(500).json({
            success: false,
            message: 'Erro no teste do sistema de batch',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        })
    }
}

module.exports = {
    getBatchProcessorStats,
    flushAllBatches,
    testBatchSystem
}