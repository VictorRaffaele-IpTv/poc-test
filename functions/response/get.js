const { Response, Validation } = require("../../repository")

/**
 * Obtém uma resposta específica com sua validação
 */
module.exports = async (deps, { params }) => {
    const { id } = params

    // Validar ID
    if (!id || isNaN(parseInt(id))) {
        const error = new Error("Invalid response ID")
        error.status = 400
        throw error
    }

    // Buscar resposta no banco de dados
    const response = await Response.getById(parseInt(id))

    if (!response) {
        const error = new Error("Response not found")
        error.status = 404
        throw error
    }

    // Buscar validação associada, se existir
    let validation = null
    try {
        validation = await Validation.getByResponseId(response.id)
    } catch (error) {
        // Validação ainda não existe ou erro ao buscar
        console.log(`Validation not found for response ${response.id}`)
    }

    // Combinar resposta com validação
    const result = {
        ...response,
        validation,
    }

    return {
        success: true,
        data: result,
    }
}