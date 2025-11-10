/**
 * Handler para envio de notificações
 * Processa evento 'sendNotification' do tópico 'avi_notifications'
 */
module.exports = async (deps, { body }) => {
    const { actionRegister } = deps
    const {
        type,
        recipient,
        content,
        channels,
        priority,
        scheduled_at,
        created_at,
    } = body

    console.log(`Sending notification: ${type} to ${recipient.name}`)

    try {
        // Simular envio para diferentes canais
        const results = []

        for (const channel of channels) {
            switch (channel) {
                case "push":
                    results.push(await sendPushNotification(recipient, content))
                    break
                case "email":
                    results.push(await sendEmailNotification(recipient, content))
                    break
                case "sms":
                    results.push(await sendSmsNotification(recipient, content))
                    break
                default:
                    console.warn(`Unknown notification channel: ${channel}`)
            }
        }

        // Registrar envio no ActionRegister
        await actionRegister.register({
            action: "notification_sent",
            entity_type: "notification",
            entity_id: `${type}_${recipient.id}`,
            metadata: {
                type,
                recipient_id: recipient.id,
                recipient_name: recipient.name,
                channels,
                priority,
                title: content.title,
                results,
            },
        })

        console.log(`Notification sent successfully: ${type}`)

        return {
            success: true,
            data: {
                type,
                recipient_id: recipient.id,
                channels_sent: results.filter(r => r.success).map(r => r.channel),
                sent_at: new Date().toISOString(),
            },
        }

    } catch (error) {
        console.error(`Error sending notification ${type}:`, error)

        // Registrar erro
        await actionRegister.register({
            action: "notification_failed", 
            entity_type: "notification",
            entity_id: `${type}_${recipient.id}`,
            metadata: {
                type,
                recipient_id: recipient.id,
                error: error.message,
                channels,
            },
        })

        throw error
    }
}

/**
 * Simula envio de push notification
 */
async function sendPushNotification(recipient, content) {
    // Simulação - integraria com FCM, APNs, etc.
    console.log(`📱 Push notification sent to ${recipient.name}: ${content.title}`)
    
    return {
        success: true,
        channel: "push",
        provider: "fcm",
        message_id: `push_${Date.now()}`,
        sent_at: new Date().toISOString(),
    }
}

/**
 * Simula envio de email
 */
async function sendEmailNotification(recipient, content) {
    // Simulação - integraria com SendGrid, SES, etc.
    if (!recipient.email) {
        throw new Error("Recipient email not provided")
    }

    console.log(`📧 Email sent to ${recipient.email}: ${content.title}`)
    
    return {
        success: true,
        channel: "email",
        provider: "sendgrid",
        message_id: `email_${Date.now()}`,
        sent_at: new Date().toISOString(),
    }
}

/**
 * Simula envio de SMS
 */
async function sendSmsNotification(recipient, content) {
    // Simulação - integraria com Twilio, AWS SNS, etc.
    console.log(`📱 SMS sent to ${recipient.name}: ${content.message.substring(0, 50)}...`)
    
    return {
        success: true,
        channel: "sms",
        provider: "twilio",
        message_id: `sms_${Date.now()}`,
        sent_at: new Date().toISOString(),
    }
}