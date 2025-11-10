const { Kafka } = require("kafkajs")
const config = require("../config")

class KafkaService {
    constructor() {
        this.kafka = new Kafka(config.kafka)
        this.producer = null
        this.isConnected = false
    }

    async getProducer() {
        if (!this.producer) {
            this.producer = this.kafka.producer()
        }
        
        if (!this.isConnected) {
            await this.producer.connect()
            this.isConnected = true
            console.log("Kafka Producer connected")
        }
        
        return this.producer
    }

    async publish(topic, event, payload) {
        try {
            const producer = await this.getProducer()
            
            const message = {
                value: JSON.stringify({
                    event,
                    timestamp: new Date().toISOString(),
                    ...payload,
                }),
            }

            await producer.send({
                topic,
                messages: [message],
            })
            
            console.log(`Published event '${event}' to topic '${topic}'`)
        } catch (error) {
            console.error(`Error publishing to Kafka: ${error.message}`)
            throw error
        }
    }

    /**
     * Cria um batch producer para envios em lote
     */
    createBatch(topic) {
        return new KafkaBatchProducer(this, topic)
    }

    async disconnect() {
        if (this.producer && this.isConnected) {
            await this.producer.disconnect()
            this.isConnected = false
            console.log("Kafka Producer disconnected")
        }
    }

    // Método para shutdown graceful
    async shutdown() {
        await this.disconnect()
    }
}

// Singleton instance
const kafkaService = new KafkaService()

// Graceful shutdown
process.on("SIGINT", async () => {
    await kafkaService.shutdown()
})

process.on("SIGTERM", async () => {
    await kafkaService.shutdown()
})

class KafkaBatchProducer {
    constructor(kafkaService, topic) {
        this.kafkaService = kafkaService
        this.topic = topic
        this.messages = []
        this.batchSize = 100
        this.maxWaitTime = 1000 // 1 segundo
        this.timer = null
    }

    push(event, payload) {
        const message = {
            value: JSON.stringify({
                event,
                timestamp: new Date().toISOString(),
                ...payload,
            }),
        }

        this.messages.push(message)

        if (this.messages.length >= this.batchSize) {
            this.flush()
        } else if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), this.maxWaitTime)
        }
    }

    async flush() {
        if (this.messages.length === 0) return

        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }

        const messagesToSend = [...this.messages]
        this.messages = []

        try {
            const producer = await this.kafkaService.getProducer()
            await producer.send({
                topic: this.topic,
                messages: messagesToSend,
            })
            
            console.log(`Batch published ${messagesToSend.length} messages to topic '${this.topic}'`)
        } catch (error) {
            console.error(`Error publishing batch to Kafka: ${error.message}`)
            throw error
        }
    }
}

module.exports = {
    kafkaService,
    getKafka: () => kafkaService.kafka,
    createProducer: () => kafkaService.kafka?.producer(),
    createConsumer: (groupId) => kafkaService.kafka?.consumer({ groupId }),
    KafkaBatchProducer
};