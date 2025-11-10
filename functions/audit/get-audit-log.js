/**
 * Recupera logs de auditoria com filtros
 * TMS-style com injeção de dependências
 */
module.exports = async (deps, { query }) => {
    const { actionRegister } = deps
    
    const {
        action_type,
        entity_type, 
        entity_id,
        user_id,
        user_name,
        start_date,
        end_date,
        limit = 50,
        offset = 0
    } = query

    // Construir filtros
    const filters = {}
    
    if (action_type) filters.action_type = action_type
    if (entity_type) filters.entity_type = entity_type
    if (entity_id) filters.entity_id = entity_id
    if (user_id) filters.user_id = user_id
    if (user_name) filters.user_name = user_name
    if (start_date) filters.start_date = start_date
    if (end_date) filters.end_date = end_date

    // Buscar logs com filtros
    const logs = await actionRegister.getLogs(filters, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        orderBy: 'created_at',
        order: 'desc'
    })

    // Contar total para paginação
    const total = await actionRegister.countLogs(filters)

    return {
        success: true,
        data: {
            logs,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: (parseInt(offset) + parseInt(limit)) < total
            }
        }
    }
}