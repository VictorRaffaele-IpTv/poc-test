/**
 * Recupera estatísticas do sistema
 * TMS-style com injeção de dependências
 */
module.exports = async (deps, { query }) => {
    const { Activity, Response, Validation, actionRegister } = deps
    const { period = "30d", detailed = false } = query

    try {
        // Calcular datas baseado no período
        let startDate = new Date()
        switch (period) {
            case "24h":
                startDate.setHours(startDate.getHours() - 24)
                break
            case "7d":
                startDate.setDate(startDate.getDate() - 7)
                break
            case "30d":
                startDate.setDate(startDate.getDate() - 30)
                break
            case "90d":
                startDate.setDate(startDate.getDate() - 90)
                break
            default:
                startDate.setDate(startDate.getDate() - 30)
        }

        // Estatísticas básicas
        const [
            totalActivities,
            totalResponses, 
            totalValidations,
            recentActivities,
            recentResponses,
            recentValidations
        ] = await Promise.all([
            Activity.count(),
            Response.count(),
            Validation.count(),
            Activity.countSince(startDate),
            Response.countSince(startDate),
            Validation.countSince(startDate)
        ])

        // Estatísticas por dificuldade
        const activitiesByDifficulty = await Activity.countByDifficulty()

        // Estatísticas de validação
        const validationStats = await Validation.getStats()

        const stats = {
            overview: {
                total_activities: totalActivities,
                total_responses: totalResponses,
                total_validations: totalValidations,
                period_activities: recentActivities,
                period_responses: recentResponses,
                period_validations: recentValidations
            },
            activities: {
                by_difficulty: activitiesByDifficulty,
                recent_count: recentActivities
            },
            validations: {
                accuracy_rate: validationStats.accuracy_rate || 0,
                avg_confidence: validationStats.avg_confidence || 0,
                total_processed: validationStats.total_processed || 0,
                recent_count: recentValidations
            },
            audit: await actionRegister.getStatsSummary(startDate)
        }

        // Se solicitado, adicionar detalhes granulares
        if (detailed === "true") {
            stats.detailed = {
                daily_activities: await Activity.getDailyStats(startDate),
                daily_responses: await Response.getDailyStats(startDate),
                daily_validations: await Validation.getDailyStats(startDate),
                top_activities: await Activity.getTopByResponses(10),
                validation_trends: await Validation.getTrends(startDate)
            }
        }

        return {
            success: true,
            data: stats
        }

    } catch (error) {
        console.error("Error getting statistics:", error)
        throw error
    }
}