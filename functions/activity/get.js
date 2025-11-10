/**
 * Obtém uma atividade específica
 * TMS-style com injeção de dependências
 */
module.exports = async (deps, { params }) => {
    const { Activity } = deps
    const { id } = params

    // Validar ID
    if (!id || isNaN(parseInt(id))) {
        const error = new Error("Invalid activity ID")
        error.status = 400
        throw error
    }

    // Buscar atividade no banco de dados
    const activity = await Activity.getById(parseInt(id))

    if (!activity) {
        const error = new Error("Activity not found")
        error.status = 404
        throw error
    }

    return {
        success: true,
        data: activity,
    }
}