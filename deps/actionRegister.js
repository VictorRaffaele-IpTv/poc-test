const knex = require("knex")
const config = require("../config")

const db = knex(config.database)

/**
 * ActionRegister - Sistema de auditoria e log de ações
 * Registra todas as ações importantes do sistema para auditoria
 */
class ActionRegister {
    constructor() {
        this.table = "action_logs"
        this.db = db
    }

    /**
     * Registra uma ação no sistema
     */
    async register(actionData) {
        const {
            action,
            entity_type,
            entity_id,
            user_id = null,
            user_name = null,
            metadata = {},
            request_id = null,
            ip_address = null,
        } = actionData

        const logEntry = {
            action,
            entity_type,
            entity_id: entity_id?.toString(),
            user_id,
            user_name,
            metadata: JSON.stringify(metadata),
            request_id,
            ip_address,
            created_at: new Date(),
        }

        try {
            const [result] = await this.db(this.table).insert(logEntry).returning("*")
            console.log(`Action registered: ${action} on ${entity_type}:${entity_id}`)
            return result
        } catch (error) {
            console.error("Failed to register action:", error)
            throw error
        }
    }

    /**
     * Registra múltiplas ações em batch
     */
    async registerBatch(actions) {
        const logEntries = actions.map(actionData => ({
            action: actionData.action,
            entity_type: actionData.entity_type,
            entity_id: actionData.entity_id?.toString(),
            user_id: actionData.user_id || null,
            user_name: actionData.user_name || null,
            metadata: JSON.stringify(actionData.metadata || {}),
            request_id: actionData.request_id || null,
            ip_address: actionData.ip_address || null,
            created_at: new Date(),
        }))

        try {
            const results = await this.db(this.table).insert(logEntries).returning("*")
            console.log(`Batch registered: ${results.length} actions`)
            return results
        } catch (error) {
            console.error("Failed to register batch actions:", error)
            throw error
        }
    }

    /**
     * Busca logs de auditoria
     */
    async getLogs(filters = {}) {
        const { 
            entity_type, 
            entity_id, 
            action, 
            user_id, 
            start_date, 
            end_date,
            page = 1, 
            limit = 50 
        } = filters

        let query = this.db(this.table)

        if (entity_type) query = query.where("entity_type", entity_type)
        if (entity_id) query = query.where("entity_id", entity_id.toString())
        if (action) query = query.where("action", action)
        if (user_id) query = query.where("user_id", user_id)
        if (start_date) query = query.where("created_at", ">=", start_date)
        if (end_date) query = query.where("created_at", "<=", end_date)

        // Contar total
        const [{ count }] = await query.clone().count("* as count")
        const total = parseInt(count)

        // Aplicar paginação
        const offset = (page - 1) * limit
        const logs = await query
            .limit(limit)
            .offset(offset)
            .orderBy("created_at", "desc")

        return {
            data: logs.map(log => ({
                ...log,
                metadata: log.metadata ? JSON.parse(log.metadata) : {},
            })),
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    /**
     * Helper para registrar ação de criação
     */
    async registerCreate(entityType, entityId, userId = null, userName = null, metadata = {}) {
        return this.register({
            action: "create",
            entity_type: entityType,
            entity_id: entityId,
            user_id: userId,
            user_name: userName,
            metadata,
        })
    }

    /**
     * Helper para registrar ação de atualização
     */
    async registerUpdate(entityType, entityId, userId = null, userName = null, metadata = {}) {
        return this.register({
            action: "update",
            entity_type: entityType,
            entity_id: entityId,
            user_id: userId,
            user_name: userName,
            metadata,
        })
    }

    /**
     * Helper para registrar ação de validação
     */
    async registerValidation(responseId, validationResult, metadata = {}) {
        return this.register({
            action: "validate_response",
            entity_type: "response",
            entity_id: responseId,
            metadata: {
                ...metadata,
                score: validationResult.score,
                is_correct: validationResult.is_correct,
                ai_provider: validationResult.ai_provider,
            },
        })
    }

    /**
     * Conta logs com filtros para paginação
     */
    async countLogs(filters = {}) {
        let query = this.db(this.table)

        // Aplicar filtros
        Object.keys(filters).forEach(key => {
            if (key === 'start_date' && filters[key]) {
                query = query.where('created_at', '>=', filters[key])
            } else if (key === 'end_date' && filters[key]) {
                query = query.where('created_at', '<=', filters[key])
            } else if (filters[key]) {
                query = query.where(key, filters[key])
            }
        })

        const [{ count }] = await query.count('* as count')
        return parseInt(count)
    }

    /**
     * Resumo estatístico de ações por período
     */
    async getStatsSummary(startDate) {
        const results = await this.db(this.table)
            .select(
                'action',
                this.db.raw('COUNT(*) as count'),
                this.db.raw('COUNT(DISTINCT user_id) as unique_users')
            )
            .where('created_at', '>=', startDate)
            .groupBy('action')
            .orderBy('count', 'desc')

        const totalActions = await this.db(this.table)
            .where('created_at', '>=', startDate)
            .count('* as count')
            .first()

        const uniqueUsers = await this.db(this.table)
            .where('created_at', '>=', startDate)
            .countDistinct('user_id as count')
            .first()

        return {
            total_actions: parseInt(totalActions.count),
            unique_users: parseInt(uniqueUsers.count),
            actions_breakdown: results.map(row => ({
                action: row.action,
                count: parseInt(row.count),
                unique_users: parseInt(row.unique_users)
            }))
        }
    }
}

module.exports = new ActionRegister()