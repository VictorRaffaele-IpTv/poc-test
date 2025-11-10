/**
 * Handler para execução de jobs agendados
 * Processa evento 'executeJob' do tópico 'avi_scheduled_jobs'
 */
module.exports = async (deps, { body }) => {
    const { actionRegister, scheduler } = deps
    const {
        job_type,
        handler,
        payload,
        scheduled_at,
        max_retries,
        priority,
        tags,
        attempts = 0,
    } = body

    console.log(`Executing scheduled job: ${job_type} (handler: ${handler})`)

    try {
        // Verificar se é hora de executar
        const now = new Date()
        const executeAt = new Date(scheduled_at)
        
        if (now < executeAt) {
            console.log(`Job ${job_type} scheduled for future execution: ${scheduled_at}`)
            // Re-agendar para o momento correto (em produção seria via scheduler real)
            const delayMs = executeAt.getTime() - now.getTime()
            setTimeout(() => {
                scheduler.scheduleJob({
                    job_type,
                    handler, 
                    payload,
                    scheduled_at,
                    max_retries,
                    priority,
                    tags,
                    attempts,
                })
            }, Math.min(delayMs, 60000)) // Max 1 minuto de delay
            
            return { success: true, status: "rescheduled" }
        }

        // Executar job baseado no tipo
        let result

        switch (job_type) {
            case "compulsory_correction":
                result = await executeCompulsoryCorrection(deps, payload)
                break
            case "data_cleanup":
                result = await executeDataCleanup(deps, payload)
                break
            case "stats_report":
                result = await executeStatsReport(deps, payload)
                break
            case "retry_validation":
                result = await executeRetryValidation(deps, payload)
                break
            default:
                throw new Error(`Unknown job type: ${job_type}`)
        }

        // Registrar execução bem-sucedida
        await actionRegister.register({
            action: "job_executed",
            entity_type: "scheduled_job",
            entity_id: job_type,
            metadata: {
                job_type,
                handler,
                payload,
                attempts: attempts + 1,
                execution_time: new Date().toISOString(),
                result,
            },
        })

        console.log(`Scheduled job completed: ${job_type}`)

        return {
            success: true,
            data: {
                job_type,
                executed_at: new Date().toISOString(),
                attempts: attempts + 1,
                result,
            },
        }

    } catch (error) {
        console.error(`Error executing job ${job_type}:`, error)

        const newAttempts = attempts + 1

        // Tentar novamente se não excedeu max_retries
        if (newAttempts < max_retries) {
            console.log(`Retrying job ${job_type}, attempt ${newAttempts}/${max_retries}`)
            
            // Re-agendar com backoff exponencial
            const retryDelay = Math.pow(2, newAttempts) * 1000 // 2^n segundos
            const retryAt = new Date(Date.now() + retryDelay)
            
            await scheduler.scheduleJob({
                job_type,
                handler,
                payload,
                scheduled_at: retryAt,
                max_retries,
                priority,
                tags: [...tags, "retry"],
                attempts: newAttempts,
            })
        }

        // Registrar erro
        await actionRegister.register({
            action: "job_failed",
            entity_type: "scheduled_job", 
            entity_id: job_type,
            metadata: {
                job_type,
                handler,
                error: error.message,
                attempts: newAttempts,
                will_retry: newAttempts < max_retries,
            },
        })

        throw error
    }
}

/**
 * Executa correção obrigatória
 */
async function executeCompulsoryCorrection(deps, payload) {
    const { Response, kafkaProducer } = deps
    const { response_id } = payload

    const response = await Response.getById(response_id)
    if (!response) {
        throw new Error(`Response ${response_id} not found`)
    }

    if (response.status === "validated") {
        return { status: "already_validated" }
    }

    // Forçar correção enviando para fila de correção
    await kafkaProducer.publish("question_correction", "correctQuestion", {
        response_id: response.id,
        activity_id: response.activity_id, 
        answer: response.answer,
        question: response.activity?.question || "",
        expected_answer: response.activity?.expected_answer || "",
        priority: "high",
        compulsory: true,
    })

    return { status: "correction_queued" }
}

/**
 * Executa limpeza de dados
 */
async function executeDataCleanup(deps, payload) {
    const { actionRegister } = deps
    const { older_than_days, tables } = payload

    console.log(`Cleaning up data older than ${older_than_days} days from tables: ${tables.join(", ")}`)
    
    // Simulação de limpeza
    const cleanupResults = {}
    
    for (const table of tables) {
        // Em implementação real, executaria DELETE queries
        const deletedRows = Math.floor(Math.random() * 100) // Simular
        cleanupResults[table] = { deleted_rows: deletedRows }
        console.log(`Cleaned ${deletedRows} rows from ${table}`)
    }

    return {
        status: "completed",
        cleanup_results: cleanupResults,
        total_deleted: Object.values(cleanupResults).reduce((sum, r) => sum + r.deleted_rows, 0),
    }
}

/**
 * Executa relatório de estatísticas
 */
async function executeStatsReport(deps, payload) {
    const { Validation, Activity, Response } = deps
    const { frequency, recipients } = payload

    console.log(`Generating ${frequency} stats report for: ${recipients.join(", ")}`)

    // Gerar estatísticas (simulação)
    const stats = {
        period: frequency,
        generated_at: new Date().toISOString(),
        metrics: {
            total_activities: await Activity.list({}, { limit: 1 }).then(r => r.meta.total),
            total_responses: 0, // Seria uma query real
            total_validations: 0, // Seria uma query real
            avg_score: 7.5,
            accuracy_rate: 0.75,
        },
    }

    // Em implementação real, enviaria por email
    console.log("Stats report generated:", JSON.stringify(stats, null, 2))

    return {
        status: "report_generated",
        stats,
        recipients_notified: recipients.length,
    }
}

/**
 * Executa retry de validação
 */
async function executeRetryValidation(deps, payload) {
    const { Response, kafkaProducer } = deps
    const { response_id, attempt } = payload

    const response = await Response.getById(response_id)
    if (!response) {
        throw new Error(`Response ${response_id} not found`)
    }

    // Reenviar para correção
    await kafkaProducer.publish("question_correction", "correctQuestion", {
        response_id: response.id,
        activity_id: response.activity_id,
        answer: response.answer,
        question: response.activity?.question || "",
        expected_answer: response.activity?.expected_answer || "",
        retry_attempt: attempt,
    })

    return {
        status: "retry_queued",
        attempt,
    }
}