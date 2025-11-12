const { Kafka } = require("kafkajs")
const config = require("../config")

class KafkaEngine {
    constructor(routes) {
        this.routes = routes
        this.kafka = new Kafka(config.kafka)
        this.consumers = new Map()
        this.producer = null
        this.deps = {}
    }

    async loadDependencies() {
        console.log("📦 Loading dependencies...")
        
        if (!this.routes.deps || !Array.isArray(this.routes.deps)) {
            console.log("No dependencies to load")
            return
        }

        for (const depName of this.routes.deps) {
            try {
                // Try to load from repository first
                let dep = null
                
                if (["Activity", "Response", "Validation", "ActionRegister"].includes(depName)) {
                    dep = require(`../repository/${depName}`)
                } else if (depName === "kafkaService") {
                    dep = require("../deps/kafka")
                } else {
                    // Try generic deps folder
                    dep = require(`../deps/${depName}`)
                }
                
                this.deps[depName] = dep
                console.log(`✅ Loaded: ${depName}`)
            } catch (error) {
                console.error(`❌ Failed to load dependency: ${depName}`, error.message)
            }
        }
    }

    async connect() {
        console.log("🔌 Connecting to Kafka...")
        
        // Setup producer
        this.producer = this.kafka.producer()
        await this.producer.connect()
        this.deps.producer = this.producer
        console.log("✅ Producer connected")

        // Group functions by topic
        const topicGroups = new Map()
        for (const fn of this.routes.functions) {
            if (!topicGroups.has(fn.topic)) {
                topicGroups.set(fn.topic, [])
            }
            topicGroups.get(fn.topic).push(fn)
        }

        // Setup consumer for each topic
        for (const [topic, functions] of topicGroups) {
            const consumer = this.kafka.consumer({ 
                groupId: `avi-${topic}-group` 
            })
            
            await consumer.connect()
            await consumer.subscribe({
                topic,
                fromBeginning: false,
            })

            this.consumers.set(topic, { consumer, functions })
            console.log(`✅ Consumer subscribed to: ${topic}`)
        }
    }

    async disconnect() {
        console.log("🔌 Disconnecting from Kafka...")
        
        for (const [topic, { consumer }] of this.consumers) {
            await consumer.disconnect()
            console.log(`✅ Disconnected from: ${topic}`)
        }
        
        if (this.producer) {
            await this.producer.disconnect()
            console.log("✅ Producer disconnected")
        }
    }

    async start() {
        await this.loadDependencies()
        await this.connect()

        console.log("🚀 Starting Kafka consumers...")

        // Start all consumers
        for (const [topic, { consumer, functions }] of this.consumers) {
            await consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const payload = JSON.parse(message.value.toString())
                        console.log(`📨 Message received from ${topic}:`, {
                            event: payload.event,
                            partition,
                        })

                        // Find matching function by event
                        const matchingFn = functions.find(fn => fn.event === payload.event)
                        
                        if (!matchingFn) {
                            console.log(`⚠️  No handler for event: ${payload.event} on topic: ${topic}`)
                            return
                        }

                        await this.processMessage(matchingFn, payload)
                        
                    } catch (error) {
                        console.error(`❌ Error processing message from ${topic}:`, error)
                    }
                },
            })
            
            console.log(`✅ Consumer running for: ${topic}`)
        }

        console.log("🎉 All Kafka workers ready!")
    }

    async processMessage(functionConfig, payload) {
        const { handler } = functionConfig
        
        try {
            console.log(`⚙️  Processing: ${handler}`)
            
            // Load handler function
            const handlerFn = require(`../${handler}`)
            
            // Inject dependencies (TMS style)
            const result = await handlerFn(this.deps, { body: payload })
            
            console.log(`✅ Handler ${handler} completed:`, result?.success || "OK")
            
        } catch (error) {
            console.error(`❌ Handler ${handler} failed:`, error)
            throw error
        }
    }
}

async function startKafkaEngine(routes) {
    const engine = new KafkaEngine(routes)

    await engine.start()

    // Graceful shutdown
    const shutdown = async (signal) => {
        console.log(`\n${signal} received, shutting down Kafka Engine...`)
        await engine.disconnect()
        process.exit(0)
    }

    process.on("SIGINT", () => shutdown("SIGINT"))
    process.on("SIGTERM", () => shutdown("SIGTERM"))

    return engine
}

module.exports = { KafkaEngine, startKafkaEngine }
