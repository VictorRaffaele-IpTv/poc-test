const path = require("path")

// Função para carregar config baseada no NODE_ENV
function getConfig() {
    const configPath = path.join(__dirname, "..", "config")
    delete require.cache[require.resolve(configPath)]
    return require(configPath)
}

const config = getConfig()

module.exports = {
    development: config.database,
    local: config.database,
    test: config.database,
    production: config.database,
}