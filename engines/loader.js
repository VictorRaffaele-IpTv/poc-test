const { startKafkaEngine } = require("./kafka")

async function loadEngine(routes) {
    if (!routes.engine) {
        throw new Error("No engine specified in routes configuration")
    }

    console.log(`🔧 Loading engine: ${routes.engine}`)

    switch (routes.engine) {
        case "kafka":
            return await startKafkaEngine(routes)
        
        case "http":
            // HTTP engine already handled by Express in app.js
            throw new Error("HTTP engine should be started via app.js, not engine loader")
        
        default:
            throw new Error(`Unknown engine type: ${routes.engine}`)
    }
}

module.exports = { loadEngine }
