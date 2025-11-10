const { Kafka } = require("kafkajs")
const config = require("../config")

// TMS-style worker configuration
const workers = [
    // Question correction worker
    {
        engine: "kafka",
        topic: "question_correction",
        match: { event: "correctQuestion" },
        handler: "answer/correct-question-ai",
        validate: true,
    },
    // Notification worker  
    {
        engine: "kafka",
        topic: "avi_notifications", 
        match: { event: "sendNotification" },
        handler: "notification/send-notification",
        validate: true,
    },
    // Jobs scheduler worker
    {
        engine: "kafka",
        topic: "avi_scheduled_jobs",
        match: { event: "executeJob" },
        handler: "jobs/execute-scheduled-job", 
        validate: true,
    },
    // Legacy validation worker (mantém compatibilidade)
    {
        engine: "kafka",
        topic: "response_validation",
        match: { event: "validateResponse" },
        handler: "answer/validate-response-legacy",
        validate: true,
    },
]

class KafkaWorker {
    constructor() {
        this.kafka = new Kafka(config.kafka)
        this.consumers = new Map()
        this.producer = null
        this.handlers = new Map()
        this.setupHandlers()
    }

    setupHandlers() {
        // Register all handlers
        this.handlers.set("answer/correct-question-ai", require("../functions/answer/correct-question-ai"))
        this.handlers.set("notification/send-notification", require("../functions/notification/send-notification"))  
        this.handlers.set("jobs/execute-scheduled-job", require("../functions/jobs/execute-scheduled-job"))
        this.handlers.set("answer/validate-response-legacy", require("../functions/validation/validate-response"))
    }

    async connect() {
        // Setup producer
        this.producer = this.kafka.producer()
        await this.producer.connect()

        // Setup consumers for each worker
        for (const worker of workers) {
            const consumer = this.kafka.consumer({ 
                groupId: `avi-${worker.topic}-group` 
            })
            await consumer.connect()
            
            await consumer.subscribe({
                topic: worker.topic,
                fromBeginning: false,
            })

            this.consumers.set(worker.topic, { consumer, worker })
        }

        console.log("Kafka Workers connected")
    }

    async disconnect() {
        for (const [topic, { consumer }] of this.consumers) {
            await consumer.disconnect()
        }
        
        if (this.producer) {
            await this.producer.disconnect()
        }
        
        console.log("Kafka Workers disconnected")
    }

    async start() {
        await this.connect()

        // Start all consumers
        for (const [topic, { consumer, worker }] of this.consumers) {
            await consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const payload = JSON.parse(message.value.toString())
                        console.log(`Processing message from ${topic}:`, payload)

                        // Check if message matches worker criteria
                        if (this.matchesWorker(payload, worker)) {
                            await this.processMessage(worker, payload)
                        }
                    } catch (error) {
                        console.error(`Error processing message from ${topic}:`, error)
                    }
                },
            })
        }
    }

    matchesWorker(payload, worker) {
        if (!worker.match) return true
        
        for (const [key, value] of Object.entries(worker.match)) {
            if (payload[key] !== value) return false
        }
        return true
    }

    async processMessage(worker, payload) {
        try {
            const handler = this.handlers.get(worker.handler)
            if (!handler) {
                throw new Error(`Handler not found: ${worker.handler}`)
            }

            // Inject dependencies (TMS style)
            const deps = {
                ...require("../repository"),
                producer: this.producer,
            }

            const result = await handler(deps, { body: payload })
            console.log(`Handler ${worker.handler} completed:`, result?.success || "OK")
            
        } catch (error) {
            console.error(`Handler ${worker.handler} failed:`, error)
            throw error
        }
    }

    async handleValidateResponse(payload) {
        try {
            const { Response, Validation } = require("../repository")
            
            // Executar validação
            const result = await validateResponse({}, { body: payload })
            console.log("Validation completed:", result)

            // Salvar validação no banco de dados
            const validationData = {
                ...result.data,
                created_at: new Date(),
                updated_at: new Date(),
            }
            
            const validation = await Validation.create(validationData)
            console.log("Validation saved to database:", validation.id)

            // Atualizar status da resposta
            await Response.update(payload.response_id, {
                status: "validated",
                updated_at: new Date(),
            })

            // Publicar resultado em tópico de sucesso
            await this.producer.send({
                topic: "validation_completed",
                messages: [
                    {
                        value: JSON.stringify({
                            event: "validationCompleted",
                            response_id: payload.response_id,
                            validation_id: validation.id,
                            validation: validation,
                            timestamp: new Date().toISOString(),
                        }),
                    },
                ],
            })
            
            console.log(`Response ${payload.response_id} validated and updated successfully`)
            
        } catch (error) {
            console.error("Error validating response:", error)

            try {
                // Atualizar status da resposta para erro
                const { Response } = require("../repository")
                await Response.update(payload.response_id, {
                    status: "validation_failed",
                    updated_at: new Date(),
                })
            } catch (updateError) {
                console.error("Error updating response status:", updateError)
            }

            // Publicar erro em tópico de falha
            await this.producer.send({
                topic: "validation_failed",
                messages: [
                    {
                        value: JSON.stringify({
                            event: "validationFailed",
                            response_id: payload.response_id,
                            error: error.message,
                            timestamp: new Date().toISOString(),
                        }),
                    },
                ],
            })
        }
    }

    async publish(topic, event, payload) {
        await this.producer.send({
            topic,
            messages: [
                {
                    value: JSON.stringify({
                        event,
                        ...payload,
                    }),
                },
            ],
        })
    }
}

// Se executado diretamente, inicia o worker
if (require.main === module) {
    const worker = new KafkaWorker()

    worker.start().catch((error) => {
        console.error("Failed to start Kafka Worker:", error)
        process.exit(1)
    })

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log("Shutting down Kafka Worker...")
        await worker.disconnect()
        process.exit(0)
    })

    process.on("SIGTERM", async () => {
        console.log("Shutting down Kafka Worker...")
        await worker.disconnect()
        process.exit(0)
    })
}

module.exports = KafkaWorker