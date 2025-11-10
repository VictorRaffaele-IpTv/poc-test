/**
 * Estatísticas da aplicação - endpoint para fornecer dados precisos ao monitor
 */
module.exports = async (deps, { query }) => {
    const { Activity, Response, Validation } = deps
    const { include_detailed = 'false', time_window = '10' } = query

    try {
        // Estatísticas básicas
        const now = new Date()
        const timeWindowMinutes = parseInt(time_window) || 10
        const timeThreshold = new Date(now.getTime() - (timeWindowMinutes * 60 * 1000))

        // Contar total de atividades
        const totalActivities = await Activity.count()

        // Contar atividades recentes (últimos X minutos)
        const recentActivities = await Activity.countRecent(timeThreshold)

        // Obter ID máximo
        const maxId = await Activity.getMaxId()

        // Estatísticas de respostas (se existir)
        let responseStats = null
        if (Response) {
            responseStats = {
                total_responses: await Response.count(),
                recent_responses: await Response.countRecent(timeThreshold)
            }
        }

        // Estatísticas de validações (se existir)
        let validationStats = null
        if (Validation) {
            validationStats = {
                total_validations: await Validation.count(),
                recent_validations: await Validation.countRecent(timeThreshold)
            }
        }

        // Taxa de crescimento (atividades por minuto nos últimos X minutos)
        const growthRate = timeWindowMinutes > 0 ? (recentActivities / timeWindowMinutes).toFixed(2) : "0"

        const result = {
            success: true,
            data: {
                timestamp: now.toISOString(),
                time_window_minutes: timeWindowMinutes,
                
                // Estatísticas principais
                activities: {
                    total: totalActivities,
                    recent: recentActivities,
                    max_id: maxId,
                    growth_rate_per_minute: parseFloat(growthRate)
                },

                // Estatísticas de outros componentes
                ...(responseStats && { responses: responseStats }),
                ...(validationStats && { validations: validationStats }),

                // Metadados úteis
                meta: {
                    time_threshold: timeThreshold.toISOString(),
                    server_time: now.toISOString(),
                    query_time_window: `${timeWindowMinutes} minutes`
                }
            }
        }

        // Incluir dados detalhados se solicitado
        if (include_detailed === 'true') {
            // Buscar algumas atividades recentes como exemplo
            const recentSamples = await Activity.findRecent(timeThreshold, 5)
            result.data.recent_samples = recentSamples.map(activity => ({
                id: activity.id,
                title: activity.title,
                created_at: activity.created_at,
                difficulty: activity.difficulty
            }))

            // Distribuição por dificuldade
            const difficultyStats = await Activity.countByDifficulty()
            result.data.difficulty_distribution = difficultyStats
        }

        return result

    } catch (error) {
        console.error('Erro ao obter estatísticas da aplicação:', error)
        
        return {
            success: false,
            error: 'Failed to retrieve application statistics',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        }
    }
}