// Admin Panel JavaScript - TMS Style
class AdminPanel {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 10;
        this.currentActivities = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTabs();
        this.loadActivities();
        this.loadStats();
    }

    setupEventListeners() {
        // Form submission
        document.getElementById('activity-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createActivity();
        });

        // Edit form submission
        document.getElementById('edit-activity-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateActivity();
        });

        // Filters
        document.getElementById('filter-difficulty').addEventListener('change', () => {
            this.loadActivities();
        });

        document.getElementById('filter-status').addEventListener('change', () => {
            this.loadActivities();
        });

        // Pagination
        document.getElementById('prev-page').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadActivities();
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            this.currentPage++;
            this.loadActivities();
        });

        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.refreshAll();
        });

        // Modal handlers
        document.querySelectorAll('.modal .close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                this.closeModal(e.target.closest('.modal').id);
            });
        });

        // Confirm modal
        document.getElementById('confirm-yes').addEventListener('click', () => {
            if (this.pendingAction) {
                this.pendingAction();
                this.pendingAction = null;
            }
            this.closeModal('confirm-modal');
        });

        document.getElementById('confirm-no').addEventListener('click', () => {
            this.closeModal('confirm-modal');
        });
    }

    setupTabs() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                this.switchTab(tabId);
            });
        });
    }

    switchTab(tabId) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`tab-${tabId}`).classList.add('active');

        // Load tab-specific data
        if (tabId === 'responses') {
            this.loadResponses();
        } else if (tabId === 'stats') {
            this.loadStats();
        }
    }

    async createActivity() {
        const form = document.getElementById('activity-form');
        const formData = new FormData(form);
        
        const activityData = {
            title: formData.get('title'),
            question: formData.get('question'),
            expected_answer: formData.get('expected_answer'),
            difficulty: formData.get('difficulty')
        };

        try {
            this.showLoading('Criando atividade...');
            
            const response = await fetch('/api/activity', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-ID': '1',
                    'User-Name': 'Admin'
                },
                body: JSON.stringify(activityData)
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('✅ Atividade criada com sucesso!', 'success');
                form.reset();
                this.loadActivities();
                this.loadStats();
            } else {
                throw new Error(result.error?.message || 'Erro ao criar atividade');
            }
        } catch (error) {
            console.error('Erro ao criar atividade:', error);
            this.showToast('❌ Erro ao criar atividade: ' + error.message, 'error');
        }
    }

    async loadActivities() {
        const difficultyFilter = document.getElementById('filter-difficulty').value;
        const statusFilter = document.getElementById('filter-status').value;
        
        let url = `/api/activity?page=${this.currentPage}&limit=${this.pageSize}`;
        if (difficultyFilter) url += `&difficulty=${difficultyFilter}`;
        if (statusFilter) url += `&status=${statusFilter}`;

        try {
            document.getElementById('activities-loading').style.display = 'block';
            document.getElementById('activities-table-container').style.display = 'none';

            const response = await fetch(url);
            const result = await response.json();

            if (result.success) {
                this.currentActivities = result.data;
                this.renderActivitiesTable(result.data, result.meta);
                this.updatePagination(result.meta);
            } else {
                throw new Error('Erro ao carregar atividades');
            }
        } catch (error) {
            console.error('Erro ao carregar atividades:', error);
            this.showToast('❌ Erro ao carregar atividades', 'error');
        } finally {
            document.getElementById('activities-loading').style.display = 'none';
            document.getElementById('activities-table-container').style.display = 'block';
        }
    }

    renderActivitiesTable(activities, meta) {
        const tbody = document.getElementById('activities-tbody');
        tbody.innerHTML = '';

        if (activities.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <div class="emoji">📝</div>
                        <h3>Nenhuma atividade encontrada</h3>
                        <p>Crie sua primeira atividade na aba "Criar Atividade"</p>
                    </td>
                </tr>
            `;
            return;
        }

        activities.forEach(activity => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${activity.id}</td>
                <td>
                    <strong>${this.escapeHtml(activity.title)}</strong>
                    <br>
                    <small>${this.escapeHtml(activity.question.substring(0, 80))}${activity.question.length > 80 ? '...' : ''}</small>
                </td>
                <td>
                    <span class="difficulty-badge difficulty-${activity.difficulty}">
                        ${this.getDifficultyIcon(activity.difficulty)} ${this.getDifficultyText(activity.difficulty)}
                    </span>
                </td>
                <td>
                    <span class="status-badge status-${activity.status}">
                        ${activity.status === 'active' ? '🟢 Ativo' : '🔴 Inativo'}
                    </span>
                </td>
                <td>${this.formatDate(activity.created_at)}</td>
                <td>
                    <button class="btn btn-small btn-view" onclick="adminPanel.viewResponses(${activity.id})">
                        💬 Ver Respostas
                    </button>
                </td>
                <td>
                    <div class="action-btns">
                        <button class="btn btn-small btn-edit" onclick="adminPanel.editActivity(${activity.id})">
                            ✏️ Editar
                        </button>
                        <button class="btn btn-small btn-delete" onclick="adminPanel.deleteActivity(${activity.id})">
                            🗑️ Excluir
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    updatePagination(meta) {
        const pagination = document.getElementById('pagination');
        const pageInfo = document.getElementById('page-info');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');

        pageInfo.textContent = `Página ${meta.page} de ${meta.totalPages} (${meta.total} itens)`;
        
        prevBtn.disabled = meta.page <= 1;
        nextBtn.disabled = meta.page >= meta.totalPages;

        pagination.style.display = meta.totalPages > 1 ? 'flex' : 'none';
    }

    async editActivity(id) {
        const activity = this.currentActivities.find(a => a.id === id);
        if (!activity) return;

        // Populate edit form
        document.getElementById('edit-id').value = activity.id;
        document.getElementById('edit-title').value = activity.title;
        document.getElementById('edit-question').value = activity.question;
        document.getElementById('edit-expected-answer').value = activity.expected_answer || '';
        document.getElementById('edit-difficulty').value = activity.difficulty;

        this.openModal('edit-modal');
    }

    async updateActivity() {
        const id = document.getElementById('edit-id').value;
        const formData = {
            title: document.getElementById('edit-title').value,
            question: document.getElementById('edit-question').value,
            expected_answer: document.getElementById('edit-expected-answer').value,
            difficulty: document.getElementById('edit-difficulty').value
        };

        try {
            const response = await fetch(`/api/activity/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'User-ID': '1',
                    'User-Name': 'Admin'
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('✅ Atividade atualizada com sucesso!', 'success');
                this.closeModal('edit-modal');
                this.loadActivities();
            } else {
                throw new Error(result.error?.message || 'Erro ao atualizar atividade');
            }
        } catch (error) {
            console.error('Erro ao atualizar atividade:', error);
            this.showToast('❌ Erro ao atualizar atividade: ' + error.message, 'error');
        }
    }

    deleteActivity(id) {
        const activity = this.currentActivities.find(a => a.id === id);
        if (!activity) return;

        document.getElementById('confirm-message').textContent = 
            `Tem certeza que deseja excluir a atividade "${activity.title}"? Esta ação não pode ser desfeita.`;
        
        this.pendingAction = async () => {
            try {
                const response = await fetch(`/api/activity/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'User-ID': '1',
                        'User-Name': 'Admin'
                    }
                });

                const result = await response.json();

                if (result.success) {
                    this.showToast('✅ Atividade excluída com sucesso!', 'success');
                    this.loadActivities();
                    this.loadStats();
                } else {
                    throw new Error(result.error?.message || 'Erro ao excluir atividade');
                }
            } catch (error) {
                console.error('Erro ao excluir atividade:', error);
                this.showToast('❌ Erro ao excluir atividade: ' + error.message, 'error');
            }
        };

        this.openModal('confirm-modal');
    }

    async viewResponses(activityId) {
        this.switchTab('responses');
        
        try {
            document.getElementById('responses-loading').style.display = 'block';
            document.getElementById('responses-loading').textContent = 'Carregando respostas...';

            // Simular carregamento das respostas (implementar endpoint depois)
            setTimeout(() => {
                document.getElementById('responses-loading').style.display = 'none';
                document.getElementById('responses-container').innerHTML = `
                    <div class="empty-state">
                        <div class="emoji">💬</div>
                        <h3>Funcionalidade em desenvolvimento</h3>
                        <p>A visualização de respostas será implementada em breve.</p>
                    </div>
                `;
            }, 1000);
        } catch (error) {
            console.error('Erro ao carregar respostas:', error);
            this.showToast('❌ Erro ao carregar respostas', 'error');
        }
    }

    async loadStats() {
        try {
            document.getElementById('stats-loading').style.display = 'block';
            document.getElementById('stats-container').innerHTML = '';

            // Por enquanto, vamos simular estatísticas básicas
            setTimeout(() => {
                document.getElementById('stats-loading').style.display = 'none';
                document.getElementById('stats-container').innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <h3>📚 Total de Atividades</h3>
                            <p class="stat-number">${this.currentActivities.length}</p>
                        </div>
                        <div class="stat-card">
                            <h3>💬 Respostas Recebidas</h3>
                            <p class="stat-number">-</p>
                        </div>
                        <div class="stat-card">
                            <h3>✅ Taxa de Aprovação</h3>
                            <p class="stat-number">-</p>
                        </div>
                        <div class="stat-card">
                            <h3>🤖 Correções IA</h3>
                            <p class="stat-number">-</p>
                        </div>
                    </div>
                    <div class="empty-state">
                        <div class="emoji">📊</div>
                        <h3>Estatísticas Detalhadas</h3>
                        <p>Funcionalidade em desenvolvimento. Estatísticas completas serão implementadas em breve.</p>
                    </div>
                `;
            }, 800);
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error);
            this.showToast('❌ Erro ao carregar estatísticas', 'error');
        }
    }

    refreshAll() {
        this.showLoading('Atualizando dados...');
        this.loadActivities();
        this.loadStats();
        this.showToast('🔄 Dados atualizados!', 'info');
    }

    // Utility Methods
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
        modal.style.display = 'block';
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
        modal.style.display = 'none';
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        toast.innerHTML = `${icon} ${message}`;
        
        container.appendChild(toast);

        // Auto remove after 4 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 4000);
    }

    showLoading(message) {
        // Simple loading implementation
        console.log('Loading:', message);
    }

    getDifficultyIcon(difficulty) {
        const icons = {
            easy: '🟢',
            medium: '🟡', 
            hard: '🔴'
        };
        return icons[difficulty] || '⚪';
    }

    getDifficultyText(difficulty) {
        const texts = {
            easy: 'Fácil',
            medium: 'Médio',
            hard: 'Difícil'
        };
        return texts[difficulty] || difficulty;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global function for modal closing (used in HTML onclick)
function closeModal(modalId) {
    if (window.adminPanel) {
        window.adminPanel.closeModal(modalId);
    }
}

// Initialize admin panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
});

// Close modals when clicking outside
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
        event.target.style.display = 'none';
    }
});