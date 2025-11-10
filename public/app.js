// Estado da aplicação
let activities = []
let currentActivity = null

// Elementos DOM
const activitiesList = document.getElementById('activities-list')
const loading = document.getElementById('loading')
const activityModal = document.getElementById('activity-modal')
const resultModal = document.getElementById('result-modal')
const responseForm = document.getElementById('response-form')

// API Base URL
const API_BASE = '/api'

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', () => {
    loadActivities()
    setupEventListeners()
})

// Event Listeners
function setupEventListeners() {
    // Fechar modals
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', closeModals)
    })

    // Botão cancelar
    document.getElementById('cancel-btn').addEventListener('click', closeModals)
    
    // Botão fechar resultado
    document.getElementById('close-result-btn').addEventListener('click', closeModals)

    // Submissão do formulário
    responseForm.addEventListener('submit', handleResponseSubmit)

    // Fechar modal ao clicar fora
    window.addEventListener('click', (event) => {
        if (event.target === activityModal || event.target === resultModal) {
            closeModals()
        }
    })
}

// Carregar atividades da API
async function loadActivities() {
    try {
        showLoading(true)
        const response = await fetch(`${API_BASE}/activity`)
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        
        if (result.success) {
            activities = result.data
            renderActivities()
        } else {
            showError('Erro ao carregar atividades')
        }
    } catch (error) {
        console.error('Erro ao carregar atividades:', error)
        showError('Erro ao conectar com o servidor. Verifique se o servidor está rodando.')
    } finally {
        showLoading(false)
    }
}

// Renderizar lista de atividades
function renderActivities() {
    if (activities.length === 0) {
        activitiesList.innerHTML = '<p class="no-activities">Nenhuma atividade encontrada.</p>'
        return
    }

    activitiesList.innerHTML = activities.map(activity => `
        <div class="activity-card" onclick="openActivityModal(${activity.id})">
            <div class="activity-title">${escapeHtml(activity.title)}</div>
            <div class="activity-question">${escapeHtml(truncateText(activity.question, 100))}</div>
            <div class="activity-meta">
                <span class="difficulty ${activity.difficulty}">${getDifficultyText(activity.difficulty)}</span>
                <span class="date">${formatDate(activity.created_at)}</span>
            </div>
        </div>
    `).join('')
}

// Abrir modal de atividade
async function openActivityModal(activityId) {
    try {
        showLoading(true)
        const response = await fetch(`${API_BASE}/activity/${activityId}`)
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        
        if (result.success) {
            currentActivity = result.data
            document.getElementById('modal-title').textContent = currentActivity.title
            document.getElementById('modal-question').textContent = currentActivity.question
            
            // Limpar formulário
            document.getElementById('student-name').value = ''
            document.getElementById('answer').value = ''
            
            activityModal.style.display = 'block'
        } else {
            showError('Erro ao carregar atividade')
        }
    } catch (error) {
        console.error('Erro ao carregar atividade:', error)
        showError('Erro ao carregar atividade')
    } finally {
        showLoading(false)
    }
}

// Submeter resposta
async function handleResponseSubmit(event) {
    event.preventDefault()
    
    if (!currentActivity) return

    const studentName = document.getElementById('student-name').value.trim()
    const answer = document.getElementById('answer').value.trim()

    if (!studentName || !answer) {
        showError('Por favor, preencha todos os campos')
        return
    }

    try {
        showLoading(true)
        
        const response = await fetch(`${API_BASE}/activity/${currentActivity.id}/response`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                student_name: studentName,
                answer: answer
            })
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        
        if (result.success) {
            closeModals()
            showSuccessMessage('Resposta enviada com sucesso! Aguarde a validação...')
            
            // Simular delay para validação e mostrar resultado
            setTimeout(() => {
                showMockValidationResult(result.data)
            }, 2000)
        } else {
            showError('Erro ao enviar resposta')
        }
    } catch (error) {
        console.error('Erro ao enviar resposta:', error)
        showError('Erro ao enviar resposta')
    } finally {
        showLoading(false)
    }
}

// Mostrar resultado simulado (já que não temos IA real ainda)
function showMockValidationResult(response) {
    const mockValidation = {
        score: Math.floor(Math.random() * 6) + 5, // Score entre 5-10
        max_score: 10,
        is_correct: Math.random() > 0.3, // 70% de chance de estar correto
        feedback: "Esta é uma validação simulada. A IA real será implementada posteriormente.",
        validated_at: new Date().toISOString()
    }

    showValidationResult({
        ...response,
        validation: mockValidation
    })
}

// Mostrar resultado da validação
function showValidationResult(response) {
    const validation = response.validation
    
    const resultContent = `
        <div class="result-score">
            <div class="score-display">${validation.score}/${validation.max_score}</div>
        </div>
        
        <div class="result-status ${validation.is_correct ? 'correct' : 'incorrect'}">
            ${validation.is_correct ? '✅ Resposta Correta!' : '❌ Resposta Incorreta'}
        </div>
        
        <div class="result-feedback">
            <strong>Feedback:</strong><br>
            ${escapeHtml(validation.feedback)}
        </div>
        
        <div class="result-meta">
            Validado em: ${formatDateTime(validation.validated_at)}<br>
            Estudante: ${escapeHtml(response.student_name)}
        </div>
    `
    
    document.getElementById('result-content').innerHTML = resultContent
    resultModal.style.display = 'block'
}

// Utility Functions
function closeModals() {
    activityModal.style.display = 'none'
    resultModal.style.display = 'none'
    currentActivity = null
}

function showLoading(show) {
    if (show) {
        loading.style.display = 'block'
        activitiesList.style.display = 'none'
    } else {
        loading.style.display = 'none'
        activitiesList.style.display = 'grid'
    }
}

function showError(message) {
    // Simples alert por enquanto - pode ser melhorado com toast notifications
    alert(`❌ Erro: ${message}`)
}

function showSuccessMessage(message) {
    // Simples alert por enquanto - pode ser melhorado com toast notifications
    alert(`✅ ${message}`)
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
}

function getDifficultyText(difficulty) {
    const difficulties = {
        easy: 'Fácil',
        medium: 'Médio', 
        hard: 'Difícil'
    }
    return difficulties[difficulty] || difficulty
}

function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString('pt-BR')
}

function formatDateTime(dateString) {
    const date = new Date(dateString)
    return date.toLocaleString('pt-BR')
}