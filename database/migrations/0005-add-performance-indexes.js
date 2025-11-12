/**
 * Migration: Adicionar índices para otimização de performance
 * 
 * Índices criados:
 * - activities: created_at, difficulty, status
 * - responses: activity_id, created_at
 * - validations: response_id, created_at
 * - action_logs: entity_id, entity_type, created_at
 */

exports.up = async function(knex) {
    console.log('📊 Adicionando índices de performance...')
    
    // Índices para tabela activities
    await knex.schema.table('activities', (table) => {
        // Índice para ordenação por data (usado em listas)
        table.index(['created_at'], 'idx_activities_created_at')
        
        // Índice para filtro por dificuldade
        table.index(['difficulty'], 'idx_activities_difficulty')
        
        // Índice para filtro por status
        table.index(['status'], 'idx_activities_status')
        
        // Índice composto para queries com múltiplos filtros
        table.index(['status', 'difficulty', 'created_at'], 'idx_activities_status_difficulty_created')
        
        // Índice para busca por criador
        table.index(['created_by'], 'idx_activities_created_by')
    })
    
    // Índices para tabela responses (se existir)
    const hasResponses = await knex.schema.hasTable('responses')
    if (hasResponses) {
        await knex.schema.table('responses', (table) => {
            // Índice para buscar respostas por atividade
            table.index(['activity_id'], 'idx_responses_activity_id')
            
            // Índice para ordenação por data
            table.index(['created_at'], 'idx_responses_created_at')
            
            // Índice composto para queries com múltiplos filtros
            table.index(['activity_id', 'created_at'], 'idx_responses_activity_created')
            
            // Índice para busca por status
            table.index(['status'], 'idx_responses_status')
        })
    }
    
    // Índices para tabela validations (se existir)
    const hasValidations = await knex.schema.hasTable('validations')
    if (hasValidations) {
        await knex.schema.table('validations', (table) => {
            // Índice para buscar validações por resposta
            table.index(['response_id'], 'idx_validations_response_id')
            
            // Índice para ordenação por data
            table.index(['created_at'], 'idx_validations_created_at')
        })
    }
    
    // Índices para tabela action_logs (se existir)
    const hasActionLogs = await knex.schema.hasTable('action_logs')
    if (hasActionLogs) {
        await knex.schema.table('action_logs', (table) => {
            // Índice para buscar logs por entidade
            table.index(['entity_id'], 'idx_action_logs_entity_id')
            
            // Índice para buscar logs por tipo de entidade
            table.index(['entity_type'], 'idx_action_logs_entity_type')
            
            // Índice para ordenação por data
            table.index(['created_at'], 'idx_action_logs_created_at')
            
            // Índice composto para queries com múltiplos filtros
            table.index(['entity_type', 'entity_id', 'created_at'], 'idx_action_logs_entity_created')
        })
    }
    
    console.log('✅ Índices de performance criados com sucesso!')
}

exports.down = async function(knex) {
    console.log('🗑️ Removendo índices de performance...')
    
    // Remover índices da tabela activities
    await knex.schema.table('activities', (table) => {
        table.dropIndex(['created_at'], 'idx_activities_created_at')
        table.dropIndex(['difficulty'], 'idx_activities_difficulty')
        table.dropIndex(['status'], 'idx_activities_status')
        table.dropIndex(['status', 'difficulty', 'created_at'], 'idx_activities_status_difficulty_created')
        table.dropIndex(['created_by'], 'idx_activities_created_by')
    })
    
    // Remover índices da tabela responses (se existir)
    const hasResponses = await knex.schema.hasTable('responses')
    if (hasResponses) {
        await knex.schema.table('responses', (table) => {
            table.dropIndex(['activity_id'], 'idx_responses_activity_id')
            table.dropIndex(['created_at'], 'idx_responses_created_at')
            table.dropIndex(['activity_id', 'created_at'], 'idx_responses_activity_created')
            table.dropIndex(['status'], 'idx_responses_status')
        })
    }
    
    // Remover índices da tabela validations (se existir)
    const hasValidations = await knex.schema.hasTable('validations')
    if (hasValidations) {
        await knex.schema.table('validations', (table) => {
            table.dropIndex(['response_id'], 'idx_validations_response_id')
            table.dropIndex(['created_at'], 'idx_validations_created_at')
        })
    }
    
    // Remover índices da tabela action_logs (se existir)
    const hasActionLogs = await knex.schema.hasTable('action_logs')
    if (hasActionLogs) {
        await knex.schema.table('action_logs', (table) => {
            table.dropIndex(['entity_id'], 'idx_action_logs_entity_id')
            table.dropIndex(['entity_type'], 'idx_action_logs_entity_type')
            table.dropIndex(['created_at'], 'idx_action_logs_created_at')
            table.dropIndex(['entity_type', 'entity_id', 'created_at'], 'idx_action_logs_entity_created')
        })
    }
    
    console.log('✅ Índices removidos com sucesso!')
}
