/**
 * Handler para correção de questões via IA
 * Processa evento 'correctQuestion' do tópico 'question_correction'
 */
module.exports = async (deps, { body }) => {
    const { Response, Validation, actionRegister, notification } = deps
    const { response_id, activity_id, answer, question, expected_answer } = body

    console.log(`Correcting question for response ${response_id}`)

    try {
        // Buscar resposta e atividade
        const response = await Response.getById(response_id)
        if (!response) {
            throw new Error(`Response ${response_id} not found`)
        }

        // Executar validação usando o sistema existente
        const validateResponse = require("../validation/validate-response")
        const validationResult = await validateResponse(deps, { body })

        // Salvar validação no banco
        const validationData = {
            ...validationResult.data,
            created_at: new Date(),
            updated_at: new Date(),
        }
        
        const validation = await Validation.create(validationData)

        // Atualizar status da resposta
        await Response.update(response_id, {
            status: "validated",
            updated_at: new Date(),
        })

        // Registrar ação no ActionRegister
        await actionRegister.registerValidation(response_id, validation, {
            handler: "correct-question-ai",
            processing_time_ms: Date.now() - new Date(body.timestamp || Date.now()).getTime(),
        })

        // Enviar notificação de conclusão
        await notification.notifyValidationCompleted(response, validation, {
            id: activity_id,
            title: question.substring(0, 50) + "...",
        })

        console.log(`Question correction completed for response ${response_id}`)

        return {
            success: true,
            data: {
                response_id,
                validation_id: validation.id,
                score: validation.score,
                is_correct: validation.is_correct,
            },
        }

    } catch (error) {
        console.error(`Error correcting question for response ${response_id}:`, error)

        // Atualizar status para erro
        try {
            await Response.update(response_id, {
                status: "validation_failed",
                updated_at: new Date(),
            })

            // Registrar erro no ActionRegister
            await actionRegister.register({
                action: "validation_failed",
                entity_type: "response",
                entity_id: response_id,
                metadata: {
                    error: error.message,
                    handler: "correct-question-ai",
                },
            })

            // Notificar erro
            await notification.notifyValidationFailed(
                { id: response_id, student_name: response?.student_name || "Unknown" },
                { id: activity_id, title: question.substring(0, 50) + "..." },
                error
            )

        } catch (updateError) {
            console.error("Failed to update response status after error:", updateError)
        }

        throw error
    }
}