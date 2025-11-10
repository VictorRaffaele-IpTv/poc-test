const EventEmitter = require('events')

/**
 * PubSub Service - Sistema de publicação/subscrição interno
 * Similar ao scaffold/repository do TMS
 */
class PubSubService extends EventEmitter {
    constructor() {
        super()
        this.subscriptions = new Map()
        this.messageHistory = []
        this.maxHistorySize = 1000
        this.setMaxListeners(100) // Increase limit for many subscribers
    }

    /**
     * Publica uma mensagem em um canal
     */
    publish(channel, event, data = {}) {
        const message = {
            id: this.generateMessageId(),
            channel,
            event,
            data,
            timestamp: new Date().toISOString(),
            publisher: this.getCallerInfo()
        }

        // Adicionar ao histórico
        this.addToHistory(message)

        // Emitir evento para subscribers
        this.emit(`${channel}:${event}`, message)
        this.emit('*', message) // Global listener

        console.log(`[PubSub] Published: ${channel}:${event}`)
        return message
    }

    /**
     * Subscreve a um canal/evento específico
     */
    subscribe(channel, event, callback) {
        const subscription = `${channel}:${event}`
        
        // Registrar callback
        this.on(subscription, callback)
        
        // Manter registro da subscrição
        if (!this.subscriptions.has(subscription)) {
            this.subscriptions.set(subscription, new Set())
        }
        this.subscriptions.get(subscription).add(callback)

        console.log(`[PubSub] Subscribed to: ${subscription}`)

        // Retornar função para unsubscribe
        return () => {
            this.off(subscription, callback)
            this.subscriptions.get(subscription)?.delete(callback)
            console.log(`[PubSub] Unsubscribed from: ${subscription}`)
        }
    }

    /**
     * Subscreve a todos os eventos de um canal
     */
    subscribeToChannel(channel, callback) {
        const pattern = new RegExp(`^${channel}:`)
        
        const wrappedCallback = (message) => {
            if (pattern.test(`${message.channel}:${message.event}`)) {
                callback(message)
            }
        }

        this.on('*', wrappedCallback)

        return () => {
            this.off('*', wrappedCallback)
            console.log(`[PubSub] Unsubscribed from channel: ${channel}`)
        }
    }

    /**
     * Subscreve a todos os eventos (global listener)
     */
    subscribeToAll(callback) {
        this.on('*', callback)
        
        return () => {
            this.off('*', callback)
            console.log(`[PubSub] Unsubscribed from global events`)
        }
    }

    /**
     * Publica mensagem com delay
     */
    publishDelayed(channel, event, data, delayMs) {
        setTimeout(() => {
            this.publish(channel, event, data)
        }, delayMs)
    }

    /**
     * Publica mensagem com retry
     */
    async publishWithRetry(channel, event, data, maxRetries = 3) {
        let attempt = 0
        
        while (attempt < maxRetries) {
            try {
                return this.publish(channel, event, data)
            } catch (error) {
                attempt++
                console.error(`[PubSub] Publish attempt ${attempt} failed:`, error)
                
                if (attempt >= maxRetries) {
                    throw error
                }
                
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
            }
        }
    }

    /**
     * Obtém histórico de mensagens
     */
    getHistory(filters = {}) {
        let history = [...this.messageHistory]

        if (filters.channel) {
            history = history.filter(msg => msg.channel === filters.channel)
        }

        if (filters.event) {
            history = history.filter(msg => msg.event === filters.event)
        }

        if (filters.since) {
            const since = new Date(filters.since)
            history = history.filter(msg => new Date(msg.timestamp) >= since)
        }

        if (filters.limit) {
            history = history.slice(-filters.limit)
        }

        return history
    }

    /**
     * Obtém estatísticas do PubSub
     */
    getStats() {
        return {
            active_subscriptions: this.subscriptions.size,
            total_listeners: this.listenerCount('*'),
            message_history_size: this.messageHistory.length,
            channels: Array.from(this.subscriptions.keys()).map(sub => sub.split(':')[0]),
            events_by_channel: this.getEventsByChannel()
        }
    }

    /**
     * Limpa histórico antigo
     */
    cleanupHistory(olderThanMs = 24 * 60 * 60 * 1000) { // 24h default
        const cutoff = new Date(Date.now() - olderThanMs)
        const originalSize = this.messageHistory.length
        
        this.messageHistory = this.messageHistory.filter(msg => 
            new Date(msg.timestamp) > cutoff
        )

        const cleaned = originalSize - this.messageHistory.length
        if (cleaned > 0) {
            console.log(`[PubSub] Cleaned ${cleaned} old messages from history`)
        }
    }

    // Private methods

    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    getCallerInfo() {
        const stack = new Error().stack
        const caller = stack?.split('\n')[3]?.trim()
        return caller?.match(/at\s+(.+)/)?.[1] || 'unknown'
    }

    addToHistory(message) {
        this.messageHistory.push(message)
        
        // Manter tamanho do histórico
        if (this.messageHistory.length > this.maxHistorySize) {
            this.messageHistory = this.messageHistory.slice(-this.maxHistorySize)
        }
    }

    getEventsByChannel() {
        const eventsByChannel = {}
        
        for (const [subscription] of this.subscriptions) {
            const [channel, event] = subscription.split(':')
            
            if (!eventsByChannel[channel]) {
                eventsByChannel[channel] = []
            }
            
            if (!eventsByChannel[channel].includes(event)) {
                eventsByChannel[channel].push(event)
            }
        }
        
        return eventsByChannel
    }
}

// Singleton instance
const pubSubService = new PubSubService()

// Cleanup job - roda a cada 6 horas
setInterval(() => {
    pubSubService.cleanupHistory()
}, 6 * 60 * 60 * 1000)

module.exports = pubSubService