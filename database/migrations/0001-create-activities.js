exports.up = function (knex) {
    return knex.schema.createTable("activities", function (table) {
        table.increments("id").primary()
        table.string("title").notNullable()
        table.text("question").notNullable()
        table.text("expected_answer").nullable()
        table.enum("difficulty", ["easy", "medium", "hard"]).defaultTo("medium")
        table.enum("status", ["active", "inactive", "archived"]).defaultTo("active")
        table.timestamps(true, true)

        // Indexes
        table.index(["status"])
        table.index(["difficulty"])
        table.index(["created_at"])
    })
}

exports.down = function (knex) {
    return knex.schema.dropTable("activities")
}