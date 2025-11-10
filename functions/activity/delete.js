/**
 * Exclui uma atividade ou múltiplas atividades (batch)
 * TMS-style com injeção de dependências
 */
module.exports = async (deps, { params, body, headers, user }) => {
    const { Activity, Response, actionRegister } = deps
    
    // Detectar se é operação em batch
    if (Array.isArray(body) || body.activity_ids) {
        return await handleBatchDelete(deps, { body, headers, user })
    }

    // Operação individual (comportamento original)
    const { id } = params
    
    // Extrair info do usuário dos headers (simples para o admin)
    const userId = headers['user-id'] || user?.id || null
    const userName = headers['user-name'] || user?.name || 'System'

    // Verificar se a atividade existe
    const activity = await Activity.getById(parseInt(id))
    if (!activity) {
        const error = new Error("Activity not found")
        error.status = 404
        throw error
    }

    // Verificar se há respostas associadas (opcional - avisar o usuário)
    const hasResponses = await Response.hasResponsesForActivity(parseInt(id))

    // Excluir a atividade (cascade delete das respostas será feito pelo banco)
    await Activity.delete(parseInt(id))

    // Registrar ação no ActionRegister
    await actionRegister.register({
        action: "delete",
        entity_type: "activity",
        entity_id: parseInt(id),
        user_id: userId,
        user_name: userName,
        metadata: {
            title: activity.title,
            difficulty: activity.difficulty,
            had_responses: hasResponses
        }
    })

    return {
        success: true,
        message: `Activity "${activity.title}" deleted successfully`,
        data: {
            id: parseInt(id),
            title: activity.title,
            had_responses: hasResponses
        }
    }
}

// Handler para operações em batch
async function handleBatchDelete(deps, { body, headers, user }) {
    const { Activity, actionRegister } = deps
    const activity_ids = Array.isArray(body) ? body : body.activity_ids

    // Validação básica
    if (!Array.isArray(activity_ids) || activity_ids.length === 0) {
        const error = new Error('Array de IDs é obrigatório')
        error.status = 400
        throw error
    }

    if (activity_ids.length > 500) {
        const error = new Error('Máximo de 500 exclusões por batch')
        error.status = 400
        throw error
    }

    // Validar IDs
    const invalidIds = activity_ids.filter(id => !id || (typeof id !== 'number' && typeof id !== 'string'))
    if (invalidIds.length > 0) {
        const error = new Error('IDs inválidos encontrados')
        error.status = 400
        throw error
    }

    // Buscar atividades antes de deletar (para logs)
    const activitiesToDelete = await Promise.all(
        activity_ids.map(id => Activity.getById(id))
    )
    const validActivities = activitiesToDelete.filter(Boolean)

    if (validActivities.length === 0) {
        const error = new Error('Nenhuma atividade válida encontrada para exclusão')
        error.status = 404
        throw error
    }

    // Executar batch delete
    const deletedCount = await Activity.batchDelete(activity_ids)

    // Registrar ações em batch no ActionRegister
    const actionBatch = actionRegister.createBatch()
    
    validActivities.forEach(activity => {
        actionBatch.push({
            user_id: user?.id || null,
            action_type: 'DELETE',
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

    // Flush das ações (não aguarda)
    actionBatch.flush().catch(console.error)

    return {
        success: true,
        message: `${deletedCount} atividades removidas com sucesso`,
        data: {
            deleted_count: deletedCount,
            batch_id: `delete_batch_${Date.now()}`,
            batch_stats: {
                total_requested: activity_ids.length,
                total_deleted: deletedCount,
                success_rate: (deletedCount / activity_ids.length) * 100
            }
        }
    }
}