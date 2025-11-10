const { OpenAI } = require("openai")
const config = require("../config")

class Agent {
    constructor() {
        this.openai = new OpenAI({
            apiKey: config.openai.apiKey,
        })
        this.model = config.openai.model
        this.provider = config.defaultLlmProvider
    }

    async validateResponse({ question, answer, expectedAnswer, context = {} }) {
        if (!config.openai.apiKey) {
            console.warn("OpenAI API key not configured, using mock validation")
            return this.mockValidation({ answer, expectedAnswer })
        }

        try {
            const prompt = this.buildValidationPrompt({
                question,
                answer,
                expectedAnswer,
                context,
            })

            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: "Você é um assistente educacional especializado em avaliar respostas de estudantes. Forneça feedback construtivo e pontuação justa.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.3,
                max_tokens: 500,
            })

            return this.parseValidationResponse(response.choices[0].message.content)
        } catch (error) {
            console.error("Error calling OpenAI API:", error)
            // Fallback para validação mock em caso de erro
            return this.mockValidation({ answer, expectedAnswer })
        }
    }

    buildValidationPrompt({ question, answer, expectedAnswer, context }) {
        return `
Avalie a seguinte resposta de estudante:

PERGUNTA: ${question}

RESPOSTA DO ESTUDANTE: ${answer}

${expectedAnswer ? `RESPOSTA ESPERADA: ${expectedAnswer}` : ""}

${context.difficulty ? `NÍVEL DE DIFICULDADE: ${context.difficulty}` : ""}

Por favor, forneça:
1. Uma pontuação de 0 a 10
2. Se a resposta está correta (true/false)
3. Feedback construtivo e educativo

Formato da resposta (JSON):
{
    "score": [0-10],
    "is_correct": [true/false],
    "feedback": "Seu feedback aqui"
}
        `.trim()
    }

    parseValidationResponse(content) {
        try {
            // Tentar extrair JSON da resposta
            const jsonMatch = content.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0])
                return {
                    score: Math.max(0, Math.min(10, parseInt(parsed.score) || 0)),
                    is_correct: Boolean(parsed.is_correct),
                    feedback: parsed.feedback || "Feedback não disponível.",
                }
            }
        } catch (error) {
            console.error("Error parsing AI response:", error)
        }

        // Fallback: tentar extrair informações do texto
        return this.extractFromText(content)
    }

    extractFromText(content) {
        // Buscar pontuação
        const scoreMatch = content.match(/(?:score|pontu[aç]ão).*?(\d+)/i)
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 5

        // Buscar se está correto
        const correctMatch = content.match(/(?:correct|corret).*?(true|false|sim|não)/i)
        const isCorrect = correctMatch
            ? ["true", "sim"].includes(correctMatch[1].toLowerCase())
            : score >= 7

        return {
            score: Math.max(0, Math.min(10, score)),
            is_correct: isCorrect,
            feedback: content.substring(0, 200) + (content.length > 200 ? "..." : ""),
        }
    }

    mockValidation({ answer, expectedAnswer }) {
        const answerLower = answer.toLowerCase().trim()
        const expectedLower = (expectedAnswer || "").toLowerCase().trim()

        let score = 0
        let isCorrect = false
        let feedback = ""

        if (expectedLower && answerLower.includes(expectedLower)) {
            score = 10
            isCorrect = true
            feedback = "Resposta correta! Excelente trabalho."
        } else if (answerLower.length > 50) {
            score = 7
            isCorrect = true
            feedback = "Resposta elaborada que demonstra reflexão sobre o tema."
        } else if (answerLower.length > 20) {
            score = 5
            isCorrect = false
            feedback = "Resposta válida, mas poderia ser mais detalhada."
        } else {
            score = 2
            isCorrect = false
            feedback = "Resposta muito curta. Elabore mais sua resposta."
        }

        return { score, is_correct: isCorrect, feedback }
    }
}

module.exports = new Agent()