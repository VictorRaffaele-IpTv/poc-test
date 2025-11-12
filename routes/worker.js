/**
 * Worker Configuration - TMS Style
 * 
 * Serviço dedicado para processamento de eventos assíncronos via Kafka:
 * - Correção de questões com IA
 * - Envio de notificações
 * - Validação de respostas
 * 
 * Jobs agendados são processados pelo serviço avi-job (routes/job.js)
 */

module.exports = {
    engine: "kafka",
    
    // Dependências injetadas nos handlers (TMS style)
    deps: [
        "Activity",
        "Response", 
        "Validation",
        "kafkaService",
        "cache",
        "pubsub",
    ],
    
    // Configuração de consumers - eventos em tempo real
    functions: [
        {
            topic: "question_correction",
            event: "correctQuestion",
            handler: "functions/answer/correct-question-ai",
            priority: 2,
        },
        {
            topic: "avi_notifications",
            event: "sendNotification",
            handler: "functions/notification/send-notification",
            priority: 1,
        },
        {
            topic: "response_validation",
            event: "validateResponse",
            handler: "functions/validation/validate-response",
            priority: 2,
        },
    ],
}
