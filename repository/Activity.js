const knex = require("knex")
const config = require("../config")
const { cache } = require("../deps/cache")
const pubSub = require("../deps/pubsub")

const db = knex(config.database)

class ActivityRepository {
    constructor() {
        this.table = "activities"
        this.db = db
        this.cache = cache.getCache('db') // Use database cache
        this.pubSub = pubSub
        
        // Cache TTL para diferentes tipos de consulta (OTIMIZADO: TTLs mais agressivos)
        this.cacheTTL = {
            single: 30 * 60 * 1000,    // 30 min para atividade individual (era 15 min)
            list: 10 * 60 * 1000,      // 10 min para listas (era 5 min)
            stats: 60 * 60 * 1000      // 60 min para estatísticas (era 30 min)
        }
    }

    async list(filters = {}, options = {}) {
        const { page = 1, limit = 10, status = "active", difficulty } = filters
        
        // Limitar máximo de resultados por página
        const safeLimit = Math.min(limit, 100) // Máximo 100 itens por página
        
        // Criar chave de cache baseada nos filtros
        const cacheKey = `activities:list:${JSON.stringify({ page, limit: safeLimit, status, difficulty })}`
        
        return await this.cache.getOrSet(
            cacheKey,
            async () => {
                let query = this.db(this.table)

                // Aplicar filtros
                if (status) {
                    query = query.where("status", status)
                }
                if (difficulty) {
                    query = query.where("difficulty", difficulty)
                }

                // OTIMIZAÇÃO: Contar total em paralelo com a busca de dados
                const offset = (page - 1) * safeLimit
                
                const [countResult, activities] = await Promise.all([
                    query.clone().count("* as count").first(),
                    query.clone()
                        .select('id', 'title', 'question', 'difficulty', 'status', 'created_at', 'updated_at') // Apenas colunas necessárias
                        .limit(safeLimit)
                        .offset(offset)
                        .orderBy("created_at", "desc")
                ])

                const total = parseInt(countResult.count)

                // Publicar evento de consulta (analytics)
                this.pubSub.publish('activity', 'list_queried', {
                    filters,
                    result_count: activities.length,
                    total_available: total
                })

                return {
                    data: activities,
                    meta: {
                        total,
                        page: parseInt(page),
                        limit: safeLimit,
                        totalPages: Math.ceil(total / safeLimit),
                    },
                }
            },
            this.cacheTTL.list
        )
    }

    async create(data) {
        const [activity] = await this.db(this.table).insert(data).returning("*")
        
        // Invalidar caches relacionados
        this.invalidateListCaches()
        
        // Publicar evento via PubSub
        this.pubSub.publish('activity', 'created', {
            activity_id: activity.id,
            title: activity.title,
            difficulty: activity.difficulty,
            created_by: data.created_by || 'system'
        })
        
        return activity
    }

    async getById(id) {
        const cacheKey = `activity:${id}`
        
        // Tentar cache primeiro
        return await this.cache.getOrSet(
            cacheKey,
            async () => {
                // OTIMIZAÇÃO: Selecionar apenas colunas necessárias
                const activity = await this.db(this.table)
                    .select('id', 'title', 'question', 'expected_answer', 'difficulty', 'status', 'created_at', 'updated_at', 'created_by')
                    .where({ id })
                    .first()
                
                // Publicar evento de acesso (para analytics)
                if (activity) {
                    this.pubSub.publish('activity', 'accessed', {
                        activity_id: id,
                        title: activity.title
                    })
                }
                
                return activity
            },
            this.cacheTTL.single
        )
    }

    async update(id, data) {
        const [activity] = await this.db(this.table).where({ id }).update({
            ...data,
            updated_at: new Date()
        }).returning("*")
        
        // Invalidar cache específico e listas
        this.cache.delete(`activity:${id}`)
        this.invalidateListCaches()
        
        // Publicar evento de atualização
        this.pubSub.publish('activity', 'updated', {
            activity_id: id,
            title: activity.title,
            changes: Object.keys(data)
        })
        
        return activity
    }

    async delete(id) {
        // Buscar atividade antes de deletar (para evento)
        const activity = await this.getById(id)
        
        const deleted = await this.db(this.table).where({ id }).del()
        
        if (deleted > 0) {
            // Invalidar caches
            this.cache.delete(`activity:${id}`)
            this.invalidateListCaches()
            
            // Publicar evento de deleção
            this.pubSub.publish('activity', 'deleted', {
                activity_id: id,
                title: activity?.title || 'Unknown'
            })
        }
        
        return deleted
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
            .where("created_at", ">=", date)
            .count("* as count")
        return parseInt(count)
    }

    async countByDifficulty() {
        const cacheKey = 'activities:stats:difficulty_count'
        
        return await this.cache.getOrSet(
            cacheKey,
            async () => {
                const results = await this.db(this.table)
                    .select("difficulty")
                    .count("* as count")
                    .groupBy("difficulty")
                
                return results.reduce((acc, row) => {
                    acc[row.difficulty] = parseInt(row.count)
                    return acc
                }, {})
            },
            this.cacheTTL.stats
        )
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

    async getTopByResponses(limit = 10) {
        const cacheKey = `activities:top_by_responses:${limit}`
        
        return await this.cache.getOrSet(
            cacheKey,
            async () => {
                // OTIMIZAÇÃO: Usar subquery para contar responses
                const results = await this.db(this.table)
                    .select("activities.id", "activities.title", "activities.difficulty", "activities.created_at")
                    .select(this.db.raw("COUNT(responses.id) as response_count"))
                    .leftJoin("responses", "activities.id", "responses.activity_id")
                    .groupBy("activities.id", "activities.title", "activities.difficulty", "activities.created_at")
                    .orderBy("response_count", "desc")
                    .limit(limit)
                
                return results.map(row => ({
                    ...row,
                    response_count: parseInt(row.response_count)
                }))
            },
            this.cacheTTL.stats
        )
    }

    // Métodos de gerenciamento de cache

    /**
     * Invalida caches de listas (quando dados mudam)
     */
    invalidateListCaches() {
        this.cache.deleteByPattern('activities:list:.*')
        this.cache.deleteByPattern('activities:stats:.*')
        
        // Publicar evento de invalidação
        this.pubSub.publish('cache', 'invalidated', {
            entity: 'activity',
            type: 'lists_and_stats'
        })
    }

    /**
     * Invalida cache específico de atividade
     */
    invalidateActivityCache(id) {
        this.cache.delete(`activity:${id}`)
        
        this.pubSub.publish('cache', 'invalidated', {
            entity: 'activity',
            type: 'single',
            entity_id: id
        })
    }

    /**
     * Pré-aquece cache com atividades populares
     */
    async warmUpCache() {
        console.log('[ActivityRepository] Warming up cache...')
        
        // Carregar top 50 atividades mais acessadas
        const popular = await this.getTopByResponses(50)
        
        for (const activity of popular) {
            await this.getById(activity.id) // Isso vai cachear
        }
        
        // Carregar estatísticas
        await this.countByDifficulty()
        
        this.pubSub.publish('cache', 'warmed_up', {
            entity: 'activity',
            items_cached: popular.length
        })
        
        console.log(`[ActivityRepository] Cache warmed up with ${popular.length} activities`)
    }

    /**
     * Obtém estatísticas do cache
     */
    getCacheStats() {
        const stats = this.cache.getStats()
        
        // Contar itens específicos de activity
        const activityKeys = this.cache.keys().filter(key => 
            key.startsWith('activity:') || key.startsWith('activities:')
        )
        
        return {
            ...stats,
            activity_specific_items: activityKeys.length,
            activity_cache_keys: activityKeys.slice(0, 10) // Primeiras 10 para debug
        }
    }

    /**
     * Batch insert para múltiplas atividades
     */
    async batchInsert(activities) {
        if (!Array.isArray(activities) || activities.length === 0) {
            return []
        }

        const trx = await this.db.transaction()
        
        try {
            const results = await trx('activities')
                .insert(activities)
                .returning('*')

            await trx.commit()

            // Invalidar caches relacionados
            this.invalidateListCaches()
            
            // Publicar evento em batch
            this.pubSub.publish('activity', 'batch_created', {
                count: results.length,
                activity_ids: results.map(r => r.id)
            })

            console.log(`Batch insert: ${results.length} atividades criadas`)
            return results
        } catch (error) {
            await trx.rollback()
            console.error('Erro no batch insert de atividades:', error)
            throw error
        }
    }

    /**
     * Batch update para múltiplas atividades
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
                
                const result = await trx('activities')
                    .where({ id })
                    .update({ ...data, updated_at: new Date() })
                    .returning('*')

                if (result.length > 0) {
                    results.push(result[0])
                }
            }

            await trx.commit()

            // Invalidar caches relacionados  
            this.invalidateListCaches()
            results.forEach(r => this.invalidateActivityCache(r.id))
            
            // Publicar evento em batch
            this.pubSub.publish('activity', 'batch_updated', {
                count: results.length,
                activity_ids: results.map(r => r.id)
            })

            console.log(`Batch update: ${results.length} atividades atualizadas`)
            return results
        } catch (error) {
            await trx.rollback()
            console.error('Erro no batch update de atividades:', error)
            throw error
        }
    }

    /**
     * Batch delete para múltiplas atividades
     */
    async batchDelete(activityIds) {
        if (!Array.isArray(activityIds) || activityIds.length === 0) {
            return 0
        }

        const trx = await this.db.transaction()
        
        try {
            const deletedCount = await trx('activities')
                .whereIn('id', activityIds)
                .del()

            await trx.commit()

            // Invalidar caches relacionados
            this.invalidateListCaches()
            activityIds.forEach(id => this.invalidateActivityCache(id))
            
            // Publicar evento em batch
            this.pubSub.publish('activity', 'batch_deleted', {
                count: deletedCount,
                activity_ids: activityIds
            })

            console.log(`Batch delete: ${deletedCount} atividades removidas`)
            return deletedCount
        } catch (error) {
            await trx.rollback()
            console.error('Erro no batch delete de atividades:', error)
            throw error
        }
    }

    /**
     * Métodos para estatísticas do monitor
     */

    async count() {
        const cacheKey = 'activities:count'
        return await this.cache.getOrSet(
            cacheKey,
            async () => {
                const [{ count }] = await this.db(this.table).count('* as count')
                return parseInt(count)
            },
            this.cacheTTL.stats
        )
    }

    async countRecent(timeThreshold) {
        const cacheKey = `activities:count:recent:${timeThreshold.getTime()}`
        return await this.cache.getOrSet(
            cacheKey,
            async () => {
                const [{ count }] = await this.db(this.table)
                    .where('created_at', '>=', timeThreshold)
                    .count('* as count')
                return parseInt(count)
            },
            2 * 60 * 1000 // Cache por 2 minutos apenas
        )
    }

    async getMaxId() {
        const cacheKey = 'activities:max_id'
        return await this.cache.getOrSet(
            cacheKey,
            async () => {
                const result = await this.db(this.table).max('id as max_id').first()
                return result ? parseInt(result.max_id) || 0 : 0
            },
            this.cacheTTL.stats
        )
    }

    async findRecent(timeThreshold, limit = 5) {
        return await this.db(this.table)
            .where('created_at', '>=', timeThreshold)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .select('id', 'title', 'created_at', 'difficulty')
    }

    async countByDifficulty() {
        const cacheKey = 'activities:count_by_difficulty'
        return await this.cache.getOrSet(
            cacheKey,
            async () => {
                const results = await this.db(this.table)
                    .select('difficulty')
                    .count('* as count')
                    .groupBy('difficulty')
                
                return results.reduce((acc, row) => {
                    acc[row.difficulty] = parseInt(row.count)
                    return acc
                }, {})
            },
            this.cacheTTL.stats
        )
    }
}

module.exports = new ActivityRepository()