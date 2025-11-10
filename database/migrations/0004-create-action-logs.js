/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('action_logs', function (table) {
        table.increments('id').primary()
        table.string('action', 100).notNullable()
        table.string('entity_type', 100).notNullable()
        table.string('entity_id', 100).notNullable()
        table.integer('user_id').nullable()
        table.string('user_name', 255).nullable()
        table.text('metadata').nullable()
        table.string('request_id', 100).nullable()
        table.string('ip_address', 45).nullable()
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable()
        
        // Índices para performance
        table.index(['entity_type', 'entity_id'])
        table.index(['action'])
        table.index(['user_id'])
        table.index(['created_at'])
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('action_logs')
}