const kafkaService = require("./kafka")

/**
 * Scheduler Service - Agendamento de tarefas e jobs
 * Agenda tarefas para processamento futuro via Kafka
 */
class SchedulerService {
    constructor() {
        this.jobsTopic = "avi_scheduled_jobs"
    }

    /**
     * Agenda uma tarefa para execução futura
     */
    async scheduleJob(jobData) {
        const {
            job_type,
            handler,
            payload,
            scheduled_at,
            max_retries = 3,
            priority = "normal",
            tags = [],
        } = jobData

        const job = {
            job_type,
            handler,
            payload,
            scheduled_at: scheduled_at instanceof Date ? scheduled_at.toISOString() : scheduled_at,
            max_retries,
            priority,
            tags,
            created_at: new Date().toISOString(),
            attempts: 0,
        }

        try {
            await kafkaService.publish(this.jobsTopic, "executeJob", job)
            console.log(`Job scheduled: ${job_type} for ${scheduled_at}`)
            return job
        } catch (error) {
            console.error("Failed to schedule job:", error)
            throw error
        }
    }

    /**
     * Agenda correção obrigatória de resposta
     */
    async scheduleCompulsoryCorrection(responseId, delayMinutes = 30) {
        const scheduledAt = new Date()
        scheduledAt.setMinutes(scheduledAt.getMinutes() + delayMinutes)

        return this.scheduleJob({
            job_type: "compulsory_correction",
            handler: "answer/compulsorily-correct",
            payload: {
                response_id: responseId,
                reason: "timeout",
            },
            scheduled_at: scheduledAt,
            priority: "high",
            tags: ["correction", "timeout"],
        })
    }

    /**
     * Agenda limpeza de dados antigos
     */
    async scheduleDataCleanup(olderThanDays = 90) {
        const scheduledAt = new Date()
        scheduledAt.setHours(2, 0, 0, 0) // 2:00 AM
        scheduledAt.setDate(scheduledAt.getDate() + 1) // Próximo dia

        return this.scheduleJob({
            job_type: "data_cleanup",
            handler: "maintenance/cleanup-old-data",
            payload: {
                older_than_days: olderThanDays,
                tables: ["action_logs", "validations"],
            },
            scheduled_at: scheduledAt,
            priority: "low",
            tags: ["maintenance", "cleanup"],
        })
    }

    /**
     * Agenda relatório de estatísticas
     */
    async scheduleStatsReport(frequency = "daily") {
        const scheduledAt = new Date()
        
        if (frequency === "daily") {
            scheduledAt.setHours(8, 0, 0, 0) // 8:00 AM
            scheduledAt.setDate(scheduledAt.getDate() + 1)
        } else if (frequency === "weekly") {
            scheduledAt.setHours(8, 0, 0, 0)
            scheduledAt.setDate(scheduledAt.getDate() + (7 - scheduledAt.getDay())) // Próximo domingo
        }

        return this.scheduleJob({
            job_type: "stats_report",
            handler: "reports/generate-stats",
            payload: {
                frequency,
                recipients: ["admin@avi.com"],
            },
            scheduled_at: scheduledAt,
            priority: "low",
            tags: ["reports", "stats"],
        })
    }

    /**
     * Agenda reprocessamento de validação falhada
     */
    async scheduleRetryValidation(responseId, attempt = 1, delayMinutes = 5) {
        const scheduledAt = new Date()
        scheduledAt.setMinutes(scheduledAt.getMinutes() + delayMinutes * attempt) // Backoff exponencial

        return this.scheduleJob({
            job_type: "retry_validation",
            handler: "validation/retry-failed",
            payload: {
                response_id: responseId,
                attempt,
            },
            scheduled_at: scheduledAt,
            priority: "normal",
            tags: ["retry", "validation"],
        })
    }

    /**
     * Cancela jobs agendados (simulação - em produção seria via banco/cache)
     */
    async cancelJob(jobId) {
        console.log(`Job cancelled: ${jobId}`)
        // Em implementação real, marcaria job como cancelado no banco
    }

    /**
     * Lista jobs agendados (simulação)
     */
    async listScheduledJobs(filters = {}) {
        console.log("Listing scheduled jobs:", filters)
        // Em implementação real, buscaria jobs do banco
        return {
            data: [],
            meta: { total: 0, page: 1, limit: 50, totalPages: 0 }
        }
    }
}

module.exports = new SchedulerService()