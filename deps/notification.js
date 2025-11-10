const kafkaService = require("./kafka")

/**
 * Notification System - Gerencia notificações via Kafka
 * Envia notificações para diferentes canais (push, email, sms, etc.)
 */
class NotificationService {
    constructor() {
        this.topic = "avi_notifications"
    }

    /**
     * Enfileira uma notificação para processamento
     */
    async enqueueNotification(notificationData) {
        const {
            type,
            recipient_id,
            recipient_name,
            recipient_email = null,
            title,
            message,
            data = {},
            channels = ["push"], // push, email, sms
            priority = "normal", // low, normal, high, urgent
            scheduled_at = null,
        } = notificationData

        const notification = {
            type,
            recipient: {
                id: recipient_id,
                name: recipient_name,
                email: recipient_email,
            },
            content: {
                title,
                message,
                data,
            },
            channels,
            priority,
            scheduled_at: scheduled_at || new Date().toISOString(),
            created_at: new Date().toISOString(),
        }

        try {
            await kafkaService.publish(this.topic, "sendNotification", notification)
            console.log(`Notification enqueued: ${type} for ${recipient_name}`)
        } catch (error) {
            console.error("Failed to enqueue notification:", error)
            throw error
        }
    }

    /**
     * Notificação de resposta submetida
     */
    async notifyResponseSubmitted(response, activity) {
        await this.enqueueNotification({
            type: "response_submitted",
            recipient_id: response.id,
            recipient_name: response.student_name,
            title: "Resposta Enviada",
            message: `Sua resposta para "${activity.title}" foi recebida e será validada em breve.`,
            data: {
                response_id: response.id,
                activity_id: activity.id,
                activity_title: activity.title,
            },
            channels: ["push"],
            priority: "normal",
        })
    }

    /**
     * Notificação de validação concluída
     */
    async notifyValidationCompleted(response, validation, activity) {
        const isCorrect = validation.is_correct
        const title = isCorrect ? "Parabéns! Resposta Correta" : "Resposta Avaliada"
        const message = isCorrect 
            ? `Você acertou a atividade "${activity.title}"! Pontuação: ${validation.score}/${validation.max_score}`
            : `Sua resposta para "${activity.title}" foi avaliada. Pontuação: ${validation.score}/${validation.max_score}`

        await this.enqueueNotification({
            type: "validation_completed",
            recipient_id: response.id,
            recipient_name: response.student_name,
            title,
            message,
            data: {
                response_id: response.id,
                validation_id: validation.id,
                activity_id: activity.id,
                activity_title: activity.title,
                score: validation.score,
                max_score: validation.max_score,
                is_correct: validation.is_correct,
                feedback: validation.feedback,
            },
            channels: ["push"],
            priority: isCorrect ? "high" : "normal",
        })
    }

    /**
     * Notificação de erro na validação
     */
    async notifyValidationFailed(response, activity, error) {
        await this.enqueueNotification({
            type: "validation_failed",
            recipient_id: response.id,
            recipient_name: response.student_name,
            title: "Erro na Validação",
            message: `Houve um problema ao validar sua resposta para "${activity.title}". Tente novamente.`,
            data: {
                response_id: response.id,
                activity_id: activity.id,
                activity_title: activity.title,
                error: error.message,
            },
            channels: ["push"],
            priority: "high",
        })
    }

    /**
     * Notificação batch para múltiplos destinatários
     */
    async enqueueBatchNotifications(notifications) {
        try {
            for (const notification of notifications) {
                await this.enqueueNotification(notification)
            }
            console.log(`Batch notifications enqueued: ${notifications.length} notifications`)
        } catch (error) {
            console.error("Failed to enqueue batch notifications:", error)
            throw error
        }
    }

    /**
     * Notificação de nova atividade criada (para admins)
     */
    async notifyActivityCreated(activity, creator) {
        // Em um sistema real, enviaria para admins/professores
        console.log(`New activity created: ${activity.title} by ${creator}`)
    }
}

module.exports = new NotificationService()