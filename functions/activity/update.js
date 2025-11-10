/**
 * Atualiza uma atividade existente ou múltiplas atividades (batch)
 * TMS-style com injeção de dependências
 */
module.exports = async (deps, { params, body, headers, user }) => {
    const { Activity, actionRegister } = deps
    
    // Detectar se é operação em batch
    if (Array.isArray(body) || body.updates) {
        return await handleBatchUpdate(deps, { body, headers, user })
    }

    // Operação individual (comportamento original)
    const { id } = params
    const { title, question, expected_answer, difficulty } = body
    
    // Extrair info do usuário dos headers (simples para o admin)
    const userId = headers['user-id'] || user?.id || null
    const userName = headers['user-name'] || user?.name || 'System'

    // Validação básica
    if (!title || !question) {
        const error = new Error("Title and question are required")
        error.status = 400
        throw error
    }

    // Validar dificuldade
    const validDifficulties = ["easy", "medium", "hard"]
    if (difficulty && !validDifficulties.includes(difficulty)) {
        const error = new Error("Invalid difficulty. Must be: easy, medium, or hard")
        error.status = 400
        throw error
    }

    // Verificar se a atividade existe
    const existingActivity = await Activity.getById(parseInt(id))
    if (!existingActivity) {
        const error = new Error("Activity not found")
        error.status = 404
        throw error
    }

    // Preparar dados para atualização
    const updateData = {
        title: title.trim(),
        question: question.trim(),
        expected_answer: expected_answer ? expected_answer.trim() : existingActivity.expected_answer,
        difficulty: difficulty || existingActivity.difficulty,
        updated_at: new Date(),
    }

    // Atualizar atividade no banco de dados
    const activity = await Activity.update(parseInt(id), updateData)

    // Registrar ação no ActionRegister
    await actionRegister.register({
        action: "update",
        entity_type: "activity",
        entity_id: activity.id,
        user_id: userId,
        user_name: userName,
        metadata: {
            title: activity.title,
            difficulty: activity.difficulty,
            changes: {
                title_changed: existingActivity.title !== activity.title,
                question_changed: existingActivity.question !== activity.question,
                difficulty_changed: existingActivity.difficulty !== activity.difficulty,
                expected_answer_changed: existingActivity.expected_answer !== activity.expected_answer
            }
        }
    })

    return {
        success: true,
        data: activity,
        message: "Activity updated successfully"
    }
}

// Handler para operações em batch
async function handleBatchUpdate(deps, { body, headers, user }) {
    const { Activity, actionRegister } = deps
    const updates = Array.isArray(body) ? body : body.updates

    // Validação básica
    if (!Array.isArray(updates) || updates.length === 0) {
        const error = new Error('Array de atualizações é obrigatório')
        error.status = 400
        throw error
    }

    if (updates.length > 500) {
        const error = new Error('Máximo de 500 atualizações por batch')
        error.status = 400
        throw error
    }

    // Validar cada atualização
    const validationErrors = []
    const validDifficulties = ["easy", "medium", "hard"]
    
    updates.forEach((update, index) => {
        if (!update.id) {
            validationErrors.push(`Update ${index}: ID da atividade é obrigatório`)
        }
        if (!update.data || typeof update.data !== 'object') {
            validationErrors.push(`Update ${index}: dados para atualização são obrigatórios`)
        }
        if (update.data?.difficulty && !validDifficulties.includes(update.data.difficulty)) {
            validationErrors.push(`Update ${index}: dificuldade inválida`)
        }
    })

    if (validationErrors.length > 0) {
        const error = new Error(`Erros de validação: ${validationErrors.join(', ')}`)
        error.status = 400
        throw error
    }

    // Executar batch update
    const results = await Activity.batchUpdate(updates)

    // Registrar ações em batch no ActionRegister
    const actionBatch = actionRegister.createBatch()
    
    results.forEach(activity => {
        const originalUpdate = updates.find(u => u.id === activity.id)
        
        actionBatch.push({
            user_id: user?.id || null,
            action_type: 'UPDATE',
            entity_type: 'activity',
            entity_id: activity.id,
            metadata: {
                title: activity.title,
                updated_fields: Object.keys(originalUpdate.data),
                batch_operation: true,
                user_name: user?.name || 'System'
            },
            ip_address: headers?.ip_address,
            user_agent: headers?.user_agent
        })
    })

    // Flush das ações (não aguarda)
    actionBatch.flush().catch(console.error)

    return {
        success: true,
        message: `${results.length} atividades atualizadas com sucesso`,
        data: {
            updated_count: results.length,
            activities: results,
            batch_id: `update_batch_${Date.now()}`,
            batch_stats: {
                total_requested: updates.length,
                total_updated: results.length,
                success_rate: (results.length / updates.length) * 100
            }
        }
    }
}