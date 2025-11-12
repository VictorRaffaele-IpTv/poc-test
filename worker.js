#!/usr/bin/env node

/**
 * Universal Worker Entry Point
 * Supports TMS-style ROUTES_NAME environment variable pattern
 * 
 * Usage:
 *   ROUTES_NAME=worker node worker.js
 *   ROUTES_NAME=another-worker node worker.js
 */

const { loadEngine } = require("./engines/loader")

async function main() {
    const routesName = process.env.ROUTES_NAME || "worker"
    
    console.log("🚀 AVI Worker Starting...")
    console.log(`📋 Routes: ${routesName}`)
    
    try {
        // Load route configuration
        const routes = require(`./routes/${routesName}`)
        
        console.log(`✅ Configuration loaded from routes/${routesName}.js`)
        console.log(`🔧 Engine: ${routes.engine}`)
        console.log(`📦 Dependencies: ${routes.deps?.join(", ") || "none"}`)
        console.log(`⚡ Functions: ${routes.functions?.length || 0}`)
        
        // Load and start engine
        await loadEngine(routes)
        
    } catch (error) {
        console.error("❌ Failed to start worker:", error)
        process.exit(1)
    }
}

// Run if executed directly
if (require.main === module) {
    main()
}

module.exports = main
