const config = require('../config')

class ActionRegister {
    constructor() {
        this.knex = config.database.connection
    }

    /**
     * Registra uma ação individual
     */
    async register(action) {
        const actionData = {
            user_id: action.user_id || null,
            action_type: action.action_type,
            entity_type: action.entity_type,
            entity_id: action.entity_id || null,
            metadata: JSON.stringify(action.metadata || {}),
            timestamp: new Date(),
            ip_address: action.ip_address || null,
            user_agent: action.user_agent || null
        }

        try {
            const [result] = await this.knex('action_register')
                .insert(actionData)
                .returning('*')

            return result
        } catch (error) {
            console.error('Erro ao registrar ação:', error)
            throw error
        }
    }

    /**
     * Registra múltiplas ações em batch
     */
    async registerBatch(actions) {
        if (!Array.isArray(actions) || actions.length === 0) {
            return []
        }

        const actionsData = actions.map(action => ({
            user_id: action.user_id || null,
            action_type: action.action_type,
            entity_type: action.entity_type,
            entity_id: action.entity_id || null,
            metadata: JSON.stringify(action.metadata || {}),
            timestamp: new Date(),
            ip_address: action.ip_address || null,
            user_agent: action.user_agent || null
        }))

        const trx = await this.knex.transaction()
        
        try {
            const results = await trx('action_register')
                .insert(actionsData)
                .returning('*')

            await trx.commit()
            
            console.log(`Registradas ${results.length} ações em batch`)
            return results
        } catch (error) {
            await trx.rollback()
            console.error('Erro ao registrar ações em batch:', error)
            throw error
        }
    }

    /**
     * Busca ações por filtros
     */
    async getActions(filters = {}) {
        let query = this.knex('action_register')

        if (filters.user_id) {
            query = query.where('user_id', filters.user_id)
        }

        if (filters.action_type) {
            query = query.where('action_type', filters.action_type)
        }

        if (filters.entity_type) {
            query = query.where('entity_type', filters.entity_type)
        }

        if (filters.entity_id) {
            query = query.where('entity_id', filters.entity_id)
        }

        if (filters.start_date) {
            query = query.where('timestamp', '>=', filters.start_date)
        }

        if (filters.end_date) {
            query = query.where('timestamp', '<=', filters.end_date)
        }

        if (filters.limit) {
            query = query.limit(filters.limit)
        }

        query = query.orderBy('timestamp', 'desc')

        try {
            const actions = await query
            return actions.map(action => ({
                ...action,
                metadata: JSON.parse(action.metadata || '{}')
            }))
        } catch (error) {
            console.error('Erro ao buscar ações:', error)
            throw error
        }
    }

    /**
     * Cria um batch register para operações em lote
     */
    createBatch() {
        return new ActionRegisterBatch(this)
    }
}

class ActionRegisterBatch {
    constructor(actionRegister) {
        this.actionRegister = actionRegister
        this.actions = []
        this.batchSize = 100
        this.maxWaitTime = 2000 // 2 segundos
        this.timer = null
    }

    push(action) {
        this.actions.push(action)

        if (this.actions.length >= this.batchSize) {
            this.flush()
        } else if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), this.maxWaitTime)
        }
    }

    async flush() {
        if (this.actions.length === 0) return

        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }

        const actionsToRegister = [...this.actions]
        this.actions = []

        try {
            const results = await this.actionRegister.registerBatch(actionsToRegister)
            return results
        } catch (error) {
            console.error('Erro ao fazer flush do batch de ações:', error)
            throw error
        }
    }

    getStats() {
        return {
            pending: this.actions.length,
            batchSize: this.batchSize,
            maxWaitTime: this.maxWaitTime,
            hasTimer: !!this.timer
        }
    }
}

module.exports = ActionRegister