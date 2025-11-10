/**
 * Cria uma nova atividade ou múltiplas atividades (batch)
 * TMS-style com injeção de dependências + PubSub + Cache
 */
module.exports = async (deps, { body, user, headers }) => {
    const { Activity, actionRegister, notification, pubSub } = deps

    // Detectar se é operação em batch
    if (Array.isArray(body) || body.activities) {
        return await handleBatchCreate(deps, { body, user, headers })
    }

    // Operação individual (comportamento original)
    const { title, question, expected_answer, difficulty } = body

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

    // Preparar dados para criação
    const activityData = {
        title: title.trim(),
        question: question.trim(),
        expected_answer: expected_answer ? expected_answer.trim() : null,
        difficulty: difficulty || "medium",
        status: "active",
        // created_by: user?.id || null,
        created_at: new Date(),
        updated_at: new Date(),
    }

    // Criar atividade no banco de dados (já publica evento via PubSub)
    const activity = await Activity.create(activityData)

    // Registrar ação no ActionRegister
    await actionRegister.registerCreate("activity", activity.id, user?.id, user?.name, {
        title: activity.title,
        difficulty: activity.difficulty,
        has_expected_answer: !!activity.expected_answer,
    })

    // Notificar criação (para admins/professores)
    try {
        await notification.notifyActivityCreated(activity, user?.name || "System")
    } catch (notificationError) {
        console.error("Failed to notify activity creation:", notificationError)
        // Não falha o processo principal
    }

    // Publicar evento interno para outros sistemas
    pubSub.publish('system', 'activity_created', {
        activity_id: activity.id,
        title: activity.title,
        difficulty: activity.difficulty,
        user_id: user?.id,
        user_name: user?.name,
        timestamp: new Date().toISOString()
    })

    return {
        success: true,
        data: activity,
        cache_invalidated: true, // Indica que caches foram limpos
    }
}

// Handler para operações em batch
async function handleBatchCreate(deps, { body, user, headers }) {
    const { Activity, actionRegister, pubSub } = deps
    const activities = Array.isArray(body) ? body : body.activities

    // Validação básica
    if (!Array.isArray(activities) || activities.length === 0) {
        const error = new Error('Array de atividades é obrigatório')
        error.status = 400
        throw error
    }

    if (activities.length > 1000) {
        const error = new Error('Máximo de 1000 atividades por batch')
        error.status = 400
        throw error
    }

    // Validar cada atividade
    const validationErrors = []
    const validDifficulties = ["easy", "medium", "hard"]
    
    activities.forEach((activity, index) => {
        if (!activity.title || activity.title.trim().length === 0) {
            validationErrors.push(`Atividade ${index}: título é obrigatório`)
        }
        if (!activity.question || activity.question.trim().length === 0) {
            validationErrors.push(`Atividade ${index}: pergunta é obrigatória`)
        }
        if (activity.difficulty && !validDifficulties.includes(activity.difficulty)) {
            validationErrors.push(`Atividade ${index}: dificuldade inválida`)
        }
    })

    if (validationErrors.length > 0) {
        const error = new Error(`Erros de validação: ${validationErrors.join(', ')}`)
        error.status = 400
        throw error
    }

    // Preparar dados para batch insert
    const activitiesData = activities.map(activity => ({
        title: activity.title.trim(),
        question: activity.question.trim(),
        expected_answer: activity.expected_answer ? activity.expected_answer.trim() : null,
        difficulty: activity.difficulty || "medium",
        status: "active",
        created_by: user?.id || null,
        created_at: new Date(),
        updated_at: new Date(),
    }))

    // Executar batch insert
    const results = await Activity.batchInsert(activitiesData)

    // Registrar ações em batch no ActionRegister
    const actionBatch = actionRegister.createBatch()
    
    results.forEach(activity => {
        actionBatch.push({
            user_id: user?.id || null,
            action_type: 'CREATE',
            entity_type: 'activity',
            entity_id: activity.id,
            metadata: {
                title: activity.title,
                difficulty: activity.difficulty,
                batch_operation: true,
                user_name: user?.name || 'System'
            },
            ip_address: headers?.ip_address,
            user_agent: headers?.user_agent
        })
    })

    // Flush das ações (não aguarda para não bloquear resposta)
    actionBatch.flush().catch(console.error)

    // Publicar evento de batch
    pubSub.publish('system', 'activities_batch_created', {
        count: results.length,
        activity_ids: results.map(r => r.id),
        user_id: user?.id,
        user_name: user?.name,
        timestamp: new Date().toISOString()
    })

    return {
        success: true,
        message: `${results.length} atividades criadas com sucesso`,
        data: {
            created_count: results.length,
            activities: results,
            batch_id: `batch_${Date.now()}`,
            batch_stats: {
                total_requested: activities.length,
                total_created: results.length,
                success_rate: (results.length / activities.length) * 100
            }
        },
        cache_invalidated: true
    }
}