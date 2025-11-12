const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const compression = require("compression")
const path = require("path")
const config = require("./config")
const knex = require("knex")

const app = express()

// Função para rodar migrações automaticamente
async function runMigrations() {
    console.log("📊 Verificando migrações do banco de dados...")
    
    try {
        const db = knex(config.database)
        
        // Executar migrações pendentes
        const [batchNo, migrations] = await db.migrate.latest()
        
        if (migrations.length === 0) {
            console.log("✅ Banco de dados atualizado - nenhuma migração pendente")
        } else {
            console.log(`✅ Migrações executadas (Batch ${batchNo}):`)
            migrations.forEach(migration => {
                console.log(`   - ${migration}`)
            })
        }
        
        // Fechar conexão após migrações
        await db.destroy()
        
    } catch (error) {
        console.error("❌ Erro ao executar migrações:", error.message)
        console.error(error)
        process.exit(1) // Falhar se migrações falharem
    }
}

// Middleware de segurança e otimização
app.use(helmet())
app.use(compression())
app.use(cors(config.cors))
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))

// Servir arquivos estáticos
app.use("/static", express.static(path.join(__dirname, "public")))

// Rota principal - servir a página HTML
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Rotas da API
app.use("/api", require("./routes/http"))

// Middleware de tratamento de erro
app.use((err, req, res, next) => {
    console.error("Error:", err)
    res.status(err.status || 500).json({
        error: {
            message: err.message || "Internal Server Error",
            ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
        },
    })
})

// Middleware 404
app.use((req, res) => {
    res.status(404).json({
        error: {
            message: "Not Found",
        },
    })
})

// Função para iniciar o servidor
async function startServer() {
    // 1. Executar migrações primeiro
    await runMigrations()
    
    // 2. Iniciar servidor HTTP
    const PORT = config.port
    app.listen(PORT, () => {
        console.log(`🚀 AVI Server running on port ${PORT}`)
        console.log(`📦 Environment: ${process.env.NODE_ENV || "production"}`)
        console.log(`🌐 Access the app at: http://localhost:${PORT}`)
    })
}

// Iniciar aplicação
startServer().catch(error => {
    console.error("❌ Falha ao iniciar servidor:", error)
    process.exit(1)
})