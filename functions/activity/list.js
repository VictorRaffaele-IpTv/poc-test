/**
 * Lista todas as atividades
 * TMS-style com injeção de dependências
 */
module.exports = async (deps, { query }) => {
    const { Activity } = deps
    const { page = 1, limit = 10, difficulty, status } = query

    // Preparar filtros
    const filters = {
        page: parseInt(page),
        limit: parseInt(limit),
    }

    if (difficulty) {
        filters.difficulty = difficulty
    }

    if (status) {
        filters.status = status
    }

    // Buscar atividades no banco de dados
    const result = await Activity.list(filters)

    return {
        success: true,
        data: result.data,
        meta: result.meta,
    }
}