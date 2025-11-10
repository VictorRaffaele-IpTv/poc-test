const knex = require("knex")
const config = require("../config")

const db = knex(config.database)

class ValidationRepository {
    constructor() {
        this.table = "validations"
        this.db = db
    }

    async create(data) {
        const [validation] = await this.db(this.table).insert(data).returning("*")
        return validation
    }

    async getById(id) {
        const validation = await this.db(this.table).where({ id }).first()
        return validation
    }

    async getByResponseId(responseId) {
        const validation = await this.db(this.table).where({ response_id: responseId }).first()
        return validation
    }

    async getByActivityId(activityId, filters = {}) {
        const { page = 1, limit = 10, is_correct } = filters

        let query = this.db(this.table)
            .select(
                "validations.*",
                "responses.student_name",
                "responses.answer",
                "activities.title as activity_title",
            )
            .join("responses", "validations.response_id", "responses.id")
            .join("activities", "validations.activity_id", "activities.id")
            .where("validations.activity_id", activityId)

        if (is_correct !== undefined) {
            query = query.where("validations.is_correct", is_correct)
        }

        // Contar total
        const [{ count }] = await query.clone().count("* as count")
        const total = parseInt(count)

        // Aplicar paginação
        const offset = (page - 1) * limit
        const validations = await query.limit(limit).offset(offset).orderBy("validations.validated_at", "desc")

        return {
            data: validations,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    async getStatistics(activityId = null) {
        let query = this.db(this.table)

        if (activityId) {
            query = query.where("activity_id", activityId)
        }

        const stats = await query
            .select(
                this.db.raw("COUNT(*) as total"),
                this.db.raw("COUNT(CASE WHEN is_correct = true THEN 1 END) as correct"),
                this.db.raw("COUNT(CASE WHEN is_correct = false THEN 1 END) as incorrect"),
                this.db.raw("AVG(score) as avg_score"),
                this.db.raw("MAX(score) as max_score_achieved"),
                this.db.raw("MIN(score) as min_score_achieved"),
            )
            .first()

        return {
            total: parseInt(stats.total),
            correct: parseInt(stats.correct),
            incorrect: parseInt(stats.incorrect),
            accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
            avg_score: parseFloat(stats.avg_score) || 0,
            max_score_achieved: parseInt(stats.max_score_achieved) || 0,
            min_score_achieved: parseInt(stats.min_score_achieved) || 0,
        }
    }

    async update(id, data) {
        const [validation] = await this.db(this.table).where({ id }).update(data).returning("*")
        return validation
    }

    async transaction(callback) {
        return await this.db.transaction(callback)
    }

    // Métodos para estatísticas TMS
    async count() {
        const [{ count }] = await this.db(this.table).count("* as count")
        return parseInt(count)
    }

    async countSince(date) {
        const [{ count }] = await this.db(this.table)
            .where("validated_at", ">=", date)
            .count("* as count")
        return parseInt(count)
    }

    async getStats() {
        const results = await this.db(this.table)
            .select(
                this.db.raw("COUNT(*) as total_processed"),
                this.db.raw("AVG(CASE WHEN is_correct = true THEN 100 ELSE 0 END) as accuracy_rate"),
                this.db.raw("AVG(confidence) as avg_confidence")
            )
            .first()

        return {
            total_processed: parseInt(results.total_processed) || 0,
            accuracy_rate: parseFloat(results.accuracy_rate) || 0,
            avg_confidence: parseFloat(results.avg_confidence) || 0
        }
    }

    async getDailyStats(startDate) {
        const results = await this.db(this.table)
            .select(this.db.raw("DATE(validated_at) as date"))
            .count("* as count")
            .where("validated_at", ">=", startDate)
            .groupBy(this.db.raw("DATE(validated_at)"))
            .orderBy("date")
        
        return results.map(row => ({
            date: row.date,
            count: parseInt(row.count)
        }))
    }

    async getTrends(startDate) {
        const results = await this.db(this.table)
            .select(
                this.db.raw("DATE(validated_at) as date"),
                this.db.raw("AVG(CASE WHEN is_correct = true THEN 100 ELSE 0 END) as accuracy"),
                this.db.raw("AVG(confidence) as avg_confidence"),
                this.db.raw("COUNT(*) as total")
            )
            .where("validated_at", ">=", startDate)
            .groupBy(this.db.raw("DATE(validated_at)"))
            .orderBy("date")
        
        return results.map(row => ({
            date: row.date,
            accuracy: parseFloat(row.accuracy) || 0,
            avg_confidence: parseFloat(row.avg_confidence) || 0,
            total: parseInt(row.total)
        }))
    }
}

module.exports = new ValidationRepository()