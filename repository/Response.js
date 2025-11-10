const knex = require("knex")
const config = require("../config")

const db = knex(config.database)

class ResponseRepository {
    constructor() {
        this.table = "responses"
        this.db = db
    }

    async create(data) {
        const [response] = await this.db(this.table).insert(data).returning("*")
        return response
    }

    async getById(id) {
        const response = await this.db(this.table)
            .select(
                "responses.*",
                "activities.title as activity_title",
                "activities.question as activity_question",
                "validations.id as validation_id",
                "validations.score",
                "validations.max_score",
                "validations.feedback",
                "validations.is_correct",
                "validations.validated_at",
            )
            .leftJoin("activities", "responses.activity_id", "activities.id")
            .leftJoin("validations", "responses.id", "validations.response_id")
            .where("responses.id", id)
            .first()

        if (!response) return null

        // Estruturar resposta com validação aninhada
        const result = {
            id: response.id,
            activity_id: response.activity_id,
            answer: response.answer,
            student_name: response.student_name,
            status: response.status,
            created_at: response.created_at,
            updated_at: response.updated_at,
            activity: {
                title: response.activity_title,
                question: response.activity_question,
            },
            validation: response.validation_id
                ? {
                      id: response.validation_id,
                      score: response.score,
                      max_score: response.max_score,
                      feedback: response.feedback,
                      is_correct: response.is_correct,
                      validated_at: response.validated_at,
                  }
                : null,
        }

        return result
    }

    async getByActivityId(activityId, filters = {}) {
        const { page = 1, limit = 10, status } = filters

        let query = this.db(this.table)
            .select(
                "responses.*",
                "validations.score",
                "validations.is_correct",
                "validations.validated_at",
            )
            .leftJoin("validations", "responses.id", "validations.response_id")
            .where("responses.activity_id", activityId)

        if (status) {
            query = query.where("responses.status", status)
        }

        // Contar total
        const [{ count }] = await query.clone().count("* as count")
        const total = parseInt(count)

        // Aplicar paginação
        const offset = (page - 1) * limit
        const responses = await query.limit(limit).offset(offset).orderBy("responses.created_at", "desc")

        return {
            data: responses,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    async update(id, data) {
        const [response] = await this.db(this.table).where({ id }).update(data).returning("*")
        return response
    }

    async transaction(callback) {
        return await this.db.transaction(callback)
    }

    // Método simples para verificar se há respostas para uma atividade
    async hasResponsesForActivity(activityId) {
        const [{ count }] = await this.db(this.table)
            .where("activity_id", activityId)
            .count("* as count")
        return parseInt(count) > 0
    }

    // Métodos para estatísticas TMS
    async count() {
        const [{ count }] = await this.db(this.table).count("* as count")
        return parseInt(count)
    }

    async countSince(date) {
        const [{ count }] = await this.db(this.table)
            .where("created_at", ">=", date)
            .count("* as count")
        return parseInt(count)
    }

    async getDailyStats(startDate) {
        const results = await this.db(this.table)
            .select(this.db.raw("DATE(created_at) as date"))
            .count("* as count")
            .where("created_at", ">=", startDate)
            .groupBy(this.db.raw("DATE(created_at)"))
            .orderBy("date")
        
        return results.map(row => ({
            date: row.date,
            count: parseInt(row.count)
        }))
    }

    /**
     * Batch insert para múltiplas respostas
     */
    async batchInsert(responses) {
        if (!Array.isArray(responses) || responses.length === 0) {
            return []
        }

        const trx = await this.db.transaction()
        
        try {
            const results = await trx('responses')
                .insert(responses)
                .returning('*')

            await trx.commit()

            console.log(`Batch insert: ${results.length} respostas criadas`)
            return results
        } catch (error) {
            await trx.rollback()
            console.error('Erro no batch insert de respostas:', error)
            throw error
        }
    }

    /**
     * Batch update para múltiplas respostas
     */
    async batchUpdate(updates) {
        if (!Array.isArray(updates) || updates.length === 0) {
            return []
        }

        const trx = await this.db.transaction()
        const results = []
        
        try {
            for (const update of updates) {
                const { id, data } = update
                
                const result = await trx('responses')
                    .where({ id })
                    .update({ ...data, updated_at: new Date() })
                    .returning('*')

                if (result.length > 0) {
                    results.push(result[0])
                }
            }

            await trx.commit()

            console.log(`Batch update: ${results.length} respostas atualizadas`)
            return results
        } catch (error) {
            await trx.rollback()
            console.error('Erro no batch update de respostas:', error)
            throw error
        }
    }

    /**
     * Batch delete para múltiplas respostas
     */
    async batchDelete(responseIds) {
        if (!Array.isArray(responseIds) || responseIds.length === 0) {
            return 0
        }

        const trx = await this.db.transaction()
        
        try {
            const deletedCount = await trx('responses')
                .whereIn('id', responseIds)
                .del()

            await trx.commit()

            console.log(`Batch delete: ${deletedCount} respostas removidas`)
            return deletedCount
        } catch (error) {
            await trx.rollback()
            console.error('Erro no batch delete de respostas:', error)
            throw error
        }
    }
}

module.exports = new ResponseRepository()