exports.up = function (knex) {
    return knex.schema.createTable("responses", function (table) {
        table.increments("id").primary()
        table.integer("activity_id").unsigned().references("id").inTable("activities").onDelete("CASCADE")
        table.text("answer").notNullable()
        table.string("student_name").notNullable()
        table.enum("status", ["draft", "submitted", "validated", "rejected"]).defaultTo("submitted")
        table.timestamps(true, true)

        // Indexes
        table.index(["activity_id"])
        table.index(["status"])
        table.index(["student_name"])
        table.index(["created_at"])
    })
}

exports.down = function (knex) {
    return knex.schema.dropTable("responses")
}