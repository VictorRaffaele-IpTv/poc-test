/**
 * Cria uma nova resposta ou múltiplas respostas (batch) para atividades
 * TMS-style com injeção de dependências
 */
module.exports = async (deps, { params, body, headers, user }) => {
    const { 
        Activity, 
        Response, 
        actionRegister, 
        notification, 
        scheduler,
        kafkaProducer 
    } = deps

    // Detectar se é operação em batch
    if (Array.isArray(body) || body.responses) {
        return await handleBatchCreate(deps, { body, headers, user })
    }
    
    // Operação individual (comportamento original)
    const { activity_id } = params
    const { answer, student_name } = body

    // Validação básica
    if (!answer || !student_name) {
        const error = new Error("Answer and student_name are required")
        error.status = 400
        throw error
    }

    if (!activity_id || isNaN(parseInt(activity_id))) {
        const error = new Error("Invalid activity ID")
        error.status = 400
        throw error
    }

    // Verificar se a atividade existe
    const activity = await Activity.getById(parseInt(activity_id))
    if (!activity) {
        const error = new Error("Activity not found")
        error.status = 404
        throw error
    }

    // Criar resposta no banco de dados
    const responseData = {
        activity_id: parseInt(activity_id),
        answer: answer.trim(),
        student_name: student_name.trim(),
        status: "submitted",
        created_at: new Date(),
        updated_at: new Date(),
    }

    const response = await Response.create(responseData)

    // Registrar ação no ActionRegister
    await actionRegister.registerCreate("response", response.id, null, student_name, {
        activity_id: activity.id,
        activity_title: activity.title,
        answer_length: answer.length,
    })

    // Enviar para correção via Kafka (novo tópico TMS-style)
    try {
        await kafkaProducer.publish("question_correction", "correctQuestion", {
            response_id: response.id,
            activity_id: activity.id,
            answer: response.answer,
            question: activity.question,
            expected_answer: activity.expected_answer,
            timestamp: new Date().toISOString(),
        })
        
        console.log(`Resposta criada: ${response.id}. Enviada para correção via question_correction`)
    } catch (kafkaError) {
        console.error("Erro ao enviar para Kafka:", kafkaError)
        // Continua mesmo se o Kafka falhar - a resposta já foi salva
    }

    // Enviar notificação de resposta submetida
    try {
        await notification.notifyResponseSubmitted(response, activity)
    } catch (notificationError) {
        console.error("Erro ao enviar notificação:", notificationError)
        // Não falha o processo principal
    }

    // Agendar correção obrigatória (caso a IA falhe)
    try {
        await scheduler.scheduleCompulsoryCorrection(response.id, 30) // 30 minutos
    } catch (schedulerError) {
        console.error("Erro ao agendar correção obrigatória:", schedulerError)
        // Não falha o processo principal
    }

    return {
        success: true,
        data: response,
        message: "Response submitted successfully. Validation in progress...",
    }
}

// Handler para operações em batch
async function handleBatchCreate(deps, { body, headers, user }) {
    const { Response, actionRegister, kafkaProducer } = deps
    const responses = Array.isArray(body) ? body : body.responses

    // Validação básica
    if (!Array.isArray(responses) || responses.length === 0) {
        const error = new Error('Array de respostas é obrigatório')
        error.status = 400
        throw error
    }

    if (responses.length > 1000) {
        const error = new Error('Máximo de 1000 respostas por batch')
        error.status = 400
        throw error
    }

    // Validar cada resposta
    const validationErrors = []
    responses.forEach((response, index) => {
        if (!response.activity_id) {
            validationErrors.push(`Resposta ${index}: activity_id é obrigatório`)
        }
        if (!response.answer || response.answer.trim().length === 0) {
            validationErrors.push(`Resposta ${index}: answer é obrigatório`)
        }
        if (!response.student_name || response.student_name.trim().length === 0) {
            validationErrors.push(`Resposta ${index}: student_name é obrigatório`)
        }
    })

    if (validationErrors.length > 0) {
        const error = new Error(`Erros de validação: ${validationErrors.join(', ')}`)
        error.status = 400
        throw error
    }

    // Preparar dados para batch insert
    const responsesData = responses.map(response => ({
        activity_id: response.activity_id,
        answer: response.answer.trim(),
        student_name: response.student_name.trim(),
        status: "submitted",
        created_at: new Date(),
        updated_at: new Date(),
    }))

    // Executar batch insert
    const results = await Response.batchInsert(responsesData)

    // Registrar ações em batch no ActionRegister
    const actionBatch = actionRegister.createBatch()
    
    results.forEach(response => {
        actionBatch.push({
            user_id: user?.id || null,
            action_type: 'CREATE',
            entity_type: 'response',
            entity_id: response.id,
            metadata: {
                activity_id: response.activity_id,
                student_name: response.student_name,
                answer: response.answer.substring(0, 100), // Primeiros 100 chars
                batch_operation: true
            },
            ip_address: headers?.ip_address,
            user_agent: headers?.user_agent
        })
    })

    // Flush das ações (não aguarda)
    actionBatch.flush().catch(console.error)

    // Enviar respostas para correção via Kafka em batch
    try {
        const kafkaBatch = kafkaProducer.createBatch("question_correction")
        
        results.forEach(response => {
            kafkaBatch.push("correctQuestion", {
                response_id: response.id,
                activity_id: response.activity_id,
                answer: response.answer,
                timestamp: new Date().toISOString(),
                batch_operation: true
            })
        })
        
        await kafkaBatch.flush()
        console.log(`Batch de ${results.length} respostas enviado para correção via Kafka`)
    } catch (kafkaError) {
        console.error("Erro ao enviar batch para Kafka:", kafkaError)
        // Continua mesmo se o Kafka falhar
    }

    return {
        success: true,
        message: `${results.length} respostas criadas com sucesso`,
        data: {
            created_count: results.length,
            responses: results,
            batch_id: `response_batch_${Date.now()}`,
            batch_stats: {
                total_requested: responses.length,
                total_created: results.length,
                success_rate: (results.length / responses.length) * 100
            }
        }
    }
}