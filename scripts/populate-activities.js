#!/usr/bin/env node

/**
 * Script para popular o banco com atividades de exemplo
 */

const { Activity } = require("../repository")

const sampleActivities = [
    {
        title: "Matemática Básica",
        question: "Quanto é 2 + 2?",
        expected_answer: "4",
        difficulty: "easy",
    },
    {
        title: "História do Brasil", 
        question: "Quando foi proclamada a independência do Brasil?",
        expected_answer: "7 de setembro de 1822",
        difficulty: "medium",
    },
    {
        title: "Programação JavaScript",
        question: "Explique o conceito de closures em JavaScript",
        expected_answer: "Closures são funções que mantêm acesso ao escopo da função externa mesmo após a função externa ter retornado",
        difficulty: "hard",
    },
    {
        title: "Geografia Mundial",
        question: "Qual é a capital da Austrália?",
        expected_answer: "Canberra",
        difficulty: "medium",
    },
    {
        title: "Ciências - Física",
        question: "O que é a velocidade da luz no vácuo?",
        expected_answer: "299.792.458 metros por segundo",
        difficulty: "medium",
    },
    {
        title: "Literatura Brasileira",
        question: "Quem escreveu 'O Cortiço'?",
        expected_answer: "Aluísio Azevedo", 
        difficulty: "easy",
    },
    {
        title: "Filosofia",
        question: "Explique o conceito de 'cogito ergo sum' de Descartes",
        expected_answer: "Penso, logo existo - uma proposição filosófica que afirma que o ato de duvidar da própria existência serve como prova da realidade da própria mente",
        difficulty: "hard",
    },
]

async function populateActivities() {
    try {
        console.log("🌱 Populando banco com atividades de exemplo...")

        for (const activityData of sampleActivities) {
            const activity = await Activity.create(activityData)
            console.log(`✅ Atividade criada: ${activity.id} - ${activity.title}`)
        }

        console.log(`\n🎉 ${sampleActivities.length} atividades criadas com sucesso!`)
        console.log("\n📚 Atividades disponíveis:")
        
        const activities = await Activity.list()
        activities.data.forEach(activity => {
            console.log(`  - ${activity.id}: ${activity.title} (${activity.difficulty})`)
        })

    } catch (error) {
        console.error("❌ Erro ao popular atividades:", error)
        process.exit(1)
    }
    
    process.exit(0)
}

if (require.main === module) {
    populateActivities()
}

module.exports = { populateActivities }