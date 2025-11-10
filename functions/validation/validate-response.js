/**
 * Valida uma resposta usando IA (LLM)
 */
module.exports = async (deps, { body }) => {
    const { activity_id, response_id, answer, expected_answer, question } = body

    console.log(`Validating response ${response_id} for activity ${activity_id}`)

    try {
        // Simular chamada para LLM (OpenAI)
        const validation = await validateWithAI({
            question,
            answer,
            expected_answer,
        })

        const result = {
            id: Date.now(), // ID temporário
            response_id,
            activity_id,
            score: validation.score,
            max_score: 10,
            feedback: validation.feedback,
            is_correct: validation.is_correct,
            validated_at: new Date().toISOString(),
            ai_provider: "openai",
            ai_model: "gpt-4",
        }

        console.log(`Validation completed for response ${response_id}:`, result)

        return {
            success: true,
            data: result,
        }
    } catch (error) {
        console.error(`Error validating response ${response_id}:`, error)
        throw error
    }
}

/**
 * Simula validação com IA
 * Em um ambiente real, isso faria uma chamada para OpenAI ou outro LLM
 */
async function validateWithAI({ question, answer, expected_answer }) {
    // Simular delay de processamento
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Lógica simples de validação (será substituída por IA real)
    const answerLower = answer.toLowerCase().trim()
    const expectedLower = (expected_answer || "").toLowerCase().trim()

    let score = 0
    let is_correct = false
    let feedback = ""

    if (expectedLower && answerLower.includes(expectedLower)) {
        score = 10
        is_correct = true
        feedback = "Resposta correta! Excelente trabalho."
    } else if (expectedLower && answerLower.length > 0) {
        // Validação parcial baseada em similaridade
        const similarity = calculateSimilarity(answerLower, expectedLower)
        if (similarity > 0.7) {
            score = 8
            is_correct = true
            feedback = "Resposta muito boa! Demonstra bom entendimento do conceito."
        } else if (similarity > 0.4) {
            score = 6
            is_correct = false
            feedback = "A resposta está no caminho certo, mas precisa de mais detalhes ou precisão."
        } else {
            score = 3
            is_correct = false
            feedback = "A resposta não está correta. Revise o material e tente novamente."
        }
    } else {
        // Sem resposta esperada, avaliar por comprimento e coerência
        if (answerLower.length > 50) {
            score = 7
            is_correct = true
            feedback = "Resposta elaborada que demonstra reflexão sobre o tema."
        } else if (answerLower.length > 20) {
            score = 5
            is_correct = false
            feedback = "Resposta válida, mas poderia ser mais detalhada."
        } else {
            score = 2
            is_correct = false
            feedback = "Resposta muito curta. Elabore mais sua resposta."
        }
    }

    return { score, is_correct, feedback }
}

/**
 * Calcula similaridade simples entre duas strings
 */
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const editDistance = levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
}

/**
 * Calcula distância de Levenshtein
 */
function levenshteinDistance(str1, str2) {
    const matrix = []

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1]
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substituição
                    matrix[i][j - 1] + 1, // inserção
                    matrix[i - 1][j] + 1, // remoção
                )
            }
        }
    }

    return matrix[str2.length][str1.length]
}