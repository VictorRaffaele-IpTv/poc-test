const path = require("path")

const config = {
    local: {
        port: 3000,
        database: {
            client: "pg",
            connection: {
                host: "localhost",
                port: 5432,
                user: "avi_user",
                password: "avi_pass",
                database: "avi_db",
            },
            migrations: {
                directory: path.join(__dirname, "..", "database", "migrations"),
            },
        },
        kafka: {
            clientId: "avi-local",
            brokers: ["localhost:9092"],
        },
        openai: {
            apiKey: process.env.OPENAI_API_TOKEN || "",
            model: process.env.OPENAI_MODEL || "gpt-4",
        },
        defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER || "openai",
        cors: {
            origin: true,
            credentials: true,
        },
    },
    test: {
        port: 3001,
        database: {
            client: "pg",
            connection: {
                host: "localhost",
                port: 5432,
                user: "avi_user",
                password: "avi_pass",
                database: "avi_test_db",
            },
            migrations: {
                directory: path.join(__dirname, "..", "database", "migrations"),
            },
        },
        kafka: {
            clientId: "avi-test",
            brokers: ["localhost:9092"],
        },
        openai: {
            apiKey: process.env.OPENAI_API_TOKEN || "",
            model: process.env.OPENAI_MODEL || "gpt-4",
        },
        defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER || "openai",
    },
    production: {
        port: process.env.PORT || 3000,
        database: {
            client: "pg",
            connection: process.env.AVI_DB_URL || {
                host: process.env.DB_HOST || "localhost",
                port: process.env.DB_PORT || 5432,
                user: process.env.DB_USER || "avi_user",
                password: process.env.DB_PASSWORD || "avi_pass",
                database: process.env.DB_NAME || "avi_db",
            },
            migrations: {
                directory: path.join(__dirname, "..", "database", "migrations"),
            },
        },
        kafka: {
            clientId: process.env.KAFKA_CLIENT_ID || "avi-production",
            brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
        },
        openai: {
            apiKey: process.env.OPENAI_API_TOKEN || "",
            model: process.env.OPENAI_MODEL || "gpt-4",
        },
        defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER || "openai",
    },
}

module.exports = config[process.env.NODE_ENV || "production"]