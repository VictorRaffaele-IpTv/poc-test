exports.up = function (knex) {
    return knex.schema.createTable("validations", function (table) {
        table.increments("id").primary()
        table.integer("response_id").unsigned().references("id").inTable("responses").onDelete("CASCADE")
        table.integer("activity_id").unsigned().references("id").inTable("activities").onDelete("CASCADE")
        table.integer("score").notNullable()
        table.integer("max_score").defaultTo(10)
        table.text("feedback").nullable()
        table.boolean("is_correct").defaultTo(false)
        table.string("ai_provider").nullable()
        table.string("ai_model").nullable()
        table.timestamp("validated_at").defaultTo(knex.fn.now())
        table.timestamps(true, true)

        // Indexes
        table.index(["response_id"])
        table.index(["activity_id"])
        table.index(["is_correct"])
        table.index(["validated_at"])

        // Unique constraint - uma validação por resposta
        table.unique(["response_id"])
    })
}

exports.down = function (knex) {
    return knex.schema.dropTable("validations")
}