/**
 * Criação da tabela action_register para auditoria no estilo TMS
 */
exports.up = function(knex) {
    return knex.schema.createTable('action_register', function(table) {
        table.bigIncrements('id').primary()
        table.integer('user_id').nullable()
        table.string('action_type', 50).notNullable() // CREATE, UPDATE, DELETE, READ, etc
        table.string('entity_type', 100).notNullable() // activity, response, validation, etc
        table.integer('entity_id').nullable()
        table.json('metadata').nullable() // Dados específicos da ação
        table.timestamp('timestamp').defaultTo(knex.fn.now())
        table.string('ip_address', 45).nullable() // IPv4 e IPv6
        table.text('user_agent').nullable()
        
        // Indexes para performance
        table.index(['user_id'])
        table.index(['action_type'])
        table.index(['entity_type'])
        table.index(['entity_id'])
        table.index(['timestamp'])
        table.index(['entity_type', 'entity_id']) // Buscar todas as ações de uma entidade específica
    })
}

exports.down = function(knex) {
    return knex.schema.dropTable('action_register')
}