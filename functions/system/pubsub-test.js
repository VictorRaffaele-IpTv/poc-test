/**
 * Teste de sistema PubSub - publicar e monitorar eventos
 * TMS-style PubSub testing endpoint
 */
module.exports = async (deps, { body }) => {
    const { pubSub } = deps
    const { action, channel, event, data, test_type = 'simple' } = body || {}

    const results = {}

    switch (action) {
        case 'publish':
            // Publicar evento de teste
            if (!channel || !event) {
                throw new Error('Channel and event are required for publish action')
            }
            
            const message = pubSub.publish(channel, event, {
                ...data,
                test: true,
                source: 'pubsub_test_endpoint'
            })
            
            results.message = 'Event published successfully'
            results.published_message = message
            results.action = 'publish'
            break

        case 'subscribe_test':
            // Criar subscription temporária para teste
            const testResults = []
            let messageCount = 0
            const maxMessages = 5
            
            const unsubscribe = pubSub.subscribe(channel || 'test', event || 'message', (message) => {
                messageCount++
                testResults.push({
                    received_at: new Date().toISOString(),
                    message_id: message.id,
                    data: message.data
                })
                
                if (messageCount >= maxMessages) {
                    unsubscribe()
                }
            })
            
            // Publicar algumas mensagens de teste
            for (let i = 1; i <= 3; i++) {
                setTimeout(() => {
                    pubSub.publish(channel || 'test', event || 'message', {
                        test_number: i,
                        timestamp: new Date().toISOString()
                    })
                }, i * 1000) // 1s, 2s, 3s intervals
            }
            
            // Aguardar um pouco e retornar resultados
            await new Promise(resolve => setTimeout(resolve, 4000))
            
            results.message = 'Subscription test completed'
            results.messages_received = testResults
            results.action = 'subscribe_test'
            break

        case 'performance_test':
            // Teste de performance - publicar muitas mensagens
            const startTime = Date.now()
            const messageCount_perf = parseInt(body.message_count) || 100
            
            for (let i = 0; i < messageCount_perf; i++) {
                pubSub.publish('performance_test', 'bulk_message', {
                    sequence: i,
                    batch_id: `batch_${Date.now()}`
                })
            }
            
            const endTime = Date.now()
            const duration = endTime - startTime
            
            results.message = `Published ${messageCount_perf} messages`
            results.duration_ms = duration
            results.messages_per_second = Math.round(messageCount_perf / (duration / 1000))
            results.action = 'performance_test'
            break

        case 'get_history':
            // Obter histórico de mensagens
            const filters = {
                channel: body.filter_channel,
                event: body.filter_event,
                since: body.since,
                limit: parseInt(body.limit) || 50
            }
            
            const history = pubSub.getHistory(filters)
            
            results.message = 'Message history retrieved'
            results.total_messages = history.length
            results.history = history
            results.filters_applied = filters
            results.action = 'get_history'
            break

        case 'stats':
            // Obter estatísticas do PubSub
            const stats = pubSub.getStats()
            
            results.message = 'PubSub statistics retrieved'
            results.stats = stats
            results.action = 'stats'
            break

        default:
            throw new Error(`Invalid action: ${action}. Available: publish, subscribe_test, performance_test, get_history, stats`)
    }

    return {
        success: true,
        data: {
            timestamp: new Date().toISOString(),
            ...results
        }
    }
}