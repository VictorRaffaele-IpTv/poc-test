/**
 * Job Routes Configuration - TMS Style
 * 
 * Serviço dedicado para processamento de jobs agendados (background jobs)
 * Similar ao tms-job do TMS, executa tarefas assíncronas como:
 * - Limpeza de dados antigos
 * - Geração de relatórios
 * - Tarefas de manutenção
 * - Processamento em lote
 */

module.exports = {
    engine: "kafka",
    
    // Dependências injetadas nos handlers
    deps: [
        "Activity",
        "Response", 
        "Validation",
        "ActionRegister",
        "scheduler",
        "cache",
        "pubsub",
    ],
    
    // Jobs agendados - apenas tópico de scheduled_jobs
    functions: [
        {
            topic: "avi_scheduled_jobs",
            event: "executeJob",
            handler: "functions/jobs/execute-scheduled-job",
            priority: 2,
        },
    ],
}
