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
            // OTIMIZAÇÃO: Connection pool otimizado para alta carga
            pool: {
                min: 10,                    // Mínimo de 10 conexões sempre abertas
                max: 50,                    // Máximo de 50 conexões (era indefinido)
                acquireTimeoutMillis: 60000, // 60s para adquirir conexão
                createTimeoutMillis: 10000,  // 10s para criar nova conexão
                idleTimeoutMillis: 30000,    // 30s timeout para conexões idle
                reapIntervalMillis: 1000,    // 1s interval para limpar idle
                createRetryIntervalMillis: 200, // 200ms entre tentativas de criação
                propagateCreateError: false  // Não propagar erro de criação imediatamente
            },
            migrations: {
                directory: path.join(__dirname, "..", "database", "migrations"),
            },
            // OTIMIZAÇÃO: Debug e logs
            debug: false,
            log: {
                warn(message) {
                    console.warn('[Knex Warning]', message)
                },
                error(message) {
                    console.error('[Knex Error]', message)
                },
                deprecate(message) {
                    console.warn('[Knex Deprecation]', message)
                }
            }
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
            // OTIMIZAÇÃO: Connection pool menor para testes
            pool: {
                min: 2,
                max: 10,
                acquireTimeoutMillis: 30000,
                idleTimeoutMillis: 10000
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
                // OTIMIZAÇÃO: SSL para produção (se necessário)
                ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
            },
            // OTIMIZAÇÃO: Connection pool agressivo para produção
            pool: {
                min: 20,                     // Mínimo de 20 conexões em produção
                max: 100,                    // Máximo de 100 conexões (suporta alta carga)
                acquireTimeoutMillis: 60000, // 60s para adquirir conexão
                createTimeoutMillis: 10000,  // 10s para criar nova conexão
                idleTimeoutMillis: 30000,    // 30s timeout para conexões idle
                reapIntervalMillis: 1000,    // 1s interval para limpar idle
                createRetryIntervalMillis: 200,
                propagateCreateError: false
            },
            migrations: {
                directory: path.join(__dirname, "..", "database", "migrations"),
            },
            // OTIMIZAÇÃO: Desabilitar debug em produção
            debug: false,
            asyncStackTraces: false, // Desabilitar para performance
            log: {
                warn(message) {
                    console.warn('[Knex Warning]', message)
                },
                error(message) {
                    console.error('[Knex Error]', message)
                }
            }
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