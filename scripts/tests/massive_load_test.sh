#!/bin/bash

# 🚀 Teste de Carga Massiva - 260.000 Requisições
# 80% Leitura (208.000) / 20% Escrita (52.000)

set -euo pipefail

# Configurações
PRODUCTION_URL="http://localhost:3000"
API_BASE="${PRODUCTION_URL}/api"
TEST_DIR="./massive_load_results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parâmetros do teste
TOTAL_REQUESTS=26000
WRITE_PERCENTAGE=20
READ_PERCENTAGE=80
CONCURRENT_WORKERS=100  # Reduzido de 100 para 20 para melhor controle

# Calcular distribuição
WRITE_REQUESTS=$((TOTAL_REQUESTS * WRITE_PERCENTAGE / 100))
READ_REQUESTS=$((TOTAL_REQUESTS * READ_PERCENTAGE / 100))

# Distribuir entre workers
WRITES_PER_WORKER=$((WRITE_REQUESTS / CONCURRENT_WORKERS))
READS_PER_WORKER=$((READ_REQUESTS / CONCURRENT_WORKERS))

# Arquivos de resultado
mkdir -p "${TEST_DIR}"
RESULTS_LOG="${TEST_DIR}/massive_results_${TIMESTAMP}.csv"
SUMMARY_LOG="${TEST_DIR}/massive_summary_${TIMESTAMP}.md"
PROGRESS_LOG="${TEST_DIR}/massive_progress_${TIMESTAMP}.log"
ERROR_LOG="${TEST_DIR}/massive_errors_${TIMESTAMP}.log"

# Inicializar CSV
echo "timestamp,worker_id,operation,http_status,response_time_ms,activity_id" > "${RESULTS_LOG}"

# Função de log
log() {
    echo -e "${1}" | tee -a "${PROGRESS_LOG}"
}

# Capturar estatísticas iniciais do sistema
capture_initial_stats() {
    log "${CYAN}📊 Capturando estatísticas iniciais do sistema...${NC}"
    
    local initial_stats=$(curl -s "${API_BASE}/system/monitoring" 2>/dev/null || echo "{}")
    local queue_stats=$(curl -s "${API_BASE}/system/queue-stats" 2>/dev/null || echo "{}")
    
    echo "=== ESTATÍSTICAS INICIAIS ===" > "${PROGRESS_LOG}"
    echo "Timestamp: $(date)" >> "${PROGRESS_LOG}"
    echo "Total Requests: ${TOTAL_REQUESTS}" >> "${PROGRESS_LOG}"
    echo "├─ Writes: ${WRITE_REQUESTS} (${WRITE_PERCENTAGE}%)" >> "${PROGRESS_LOG}"
    echo "└─ Reads: ${READ_REQUESTS} (${READ_PERCENTAGE}%)" >> "${PROGRESS_LOG}"
    echo "Concurrent Workers: ${CONCURRENT_WORKERS}" >> "${PROGRESS_LOG}"
    echo "Operations per Worker:" >> "${PROGRESS_LOG}"
    echo "├─ Writes: ${WRITES_PER_WORKER}" >> "${PROGRESS_LOG}"
    echo "└─ Reads: ${READS_PER_WORKER}" >> "${PROGRESS_LOG}"
    echo "" >> "${PROGRESS_LOG}"
    echo "Initial System State:" >> "${PROGRESS_LOG}"
    echo "$initial_stats" | jq '.' >> "${PROGRESS_LOG}" 2>/dev/null || echo "$initial_stats" >> "${PROGRESS_LOG}"
    echo "" >> "${PROGRESS_LOG}"
    echo "Initial Queue State:" >> "${PROGRESS_LOG}"
    echo "$queue_stats" | jq '.' >> "${PROGRESS_LOG}" 2>/dev/null || echo "$queue_stats" >> "${PROGRESS_LOG}"
    echo "================================" >> "${PROGRESS_LOG}"
    echo "" >> "${PROGRESS_LOG}"
}

# Worker function - Executa operações de um worker
worker_function() {
    local worker_id=$1
    local writes=$2
    local reads=$3
    
    # Seed para geração de dados únicos
    local seed=$((worker_id * 10000))
    
    # Criar atividades (WRITE)
    for ((i=1; i<=writes; i++)); do
        local activity_id=$((seed + i))
        local start_time=$(date +%s%3N)
        
        local activity_data='{
            "title": "Massive Test Activity W'${worker_id}'-'${i}'",
            "question": "Load test question '${activity_id}'",
            "expected_answer": "42",
            "difficulty": "medium"
        }'
        
        local response=$(curl -s -w "\nHTTPSTATUS:%{http_code}" \
                        -X POST "${API_BASE}/activity" \
                        -H "Content-Type: application/json" \
                        -d "$activity_data" \
                        --connect-timeout 30 --max-time 60 2>/dev/null || echo "HTTPSTATUS:000")
        
        local http_status=$(echo "$response" | grep "HTTPSTATUS:" | cut -d: -f2)
        local response_body=$(echo "$response" | sed 's/HTTPSTATUS:.*$//')
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        
        # Extrair ID da atividade criada
        local created_id=$(echo "$response_body" | jq -r '.data.id // .id // empty' 2>/dev/null || echo "")
        
        # Registrar resultado
        echo "$(date +%s),${worker_id},CREATE,${http_status},${duration},${created_id}" >> "${RESULTS_LOG}"
        
        # Log de erros
        if [ "$http_status" != "201" ]; then
            echo "[Worker ${worker_id}] CREATE failed with status ${http_status}" >> "${ERROR_LOG}"
        fi
        
        # Delay ajustável baseado no número de workers (menos workers = mais delay)
        sleep 0.05  # 50ms entre requests para evitar sobrecarga
    done
    
    # Ler atividades (READ)
    for ((i=1; i<=reads; i++)); do
        local start_time=$(date +%s%3N)
        
        # Alternar entre listar e buscar por ID
        if [ $((i % 3)) -eq 0 ]; then
            # Listar atividades
            local response=$(curl -s -w "\nHTTPSTATUS:%{http_code}" \
                            -X GET "${API_BASE}/activity" \
                            --connect-timeout 30 --max-time 60 2>/dev/null || echo "HTTPSTATUS:000")
        else
            # Buscar atividade aleatória por ID
            local random_id=$((1 + RANDOM % 1000))
            local response=$(curl -s -w "\nHTTPSTATUS:%{http_code}" \
                            -X GET "${API_BASE}/activity/${random_id}" \
                            --connect-timeout 30 --max-time 60 2>/dev/null || echo "HTTPSTATUS:000")
        fi
        
        local http_status=$(echo "$response" | grep "HTTPSTATUS:" | cut -d: -f2)
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        
        # Registrar resultado
        echo "$(date +%s),${worker_id},READ,${http_status},${duration}," >> "${RESULTS_LOG}"
        
        # Log de erros
        if [ "$http_status" != "200" ]; then
            echo "[Worker ${worker_id}] READ failed with status ${http_status}" >> "${ERROR_LOG}"
        fi
        
        # Delay menor para reads (mais leves que writes)
        sleep 0.02  # 20ms entre reads
    done
}

# Função para monitorar progresso
monitor_progress() {
    local total_expected=$1
    local start_time=$(date +%s)
    
    while true; do
        sleep 5
        
        if [ -f "$RESULTS_LOG" ]; then
            local completed=$(($(wc -l < "$RESULTS_LOG") - 1))  # -1 para remover header
            local elapsed=$(($(date +%s) - start_time))
            
            if [ $completed -gt 0 ] && [ $elapsed -gt 0 ]; then
                local rate=$((completed / elapsed))
                local percentage=$((completed * 100 / total_expected))
                local remaining=$((total_expected - completed))
                local eta=$((remaining / rate))
                
                # Estatísticas de sucesso/erro
                local success=$(grep -c ",200,\|,201," "$RESULTS_LOG" 2>/dev/null || echo "0")
                local errors=$(grep -c ",000,\|,503,\|,429," "$RESULTS_LOG" 2>/dev/null || echo "0")
                
                echo -ne "\r${CYAN}📊 Progresso: ${completed}/${total_expected} (${percentage}%) | " \
                         "Taxa: ${rate} req/s | ETA: ${eta}s | ✅ ${success} | ❌ ${errors}${NC}"
                
                # Parar se completou
                if [ $completed -ge $total_expected ]; then
                    echo ""
                    break
                fi
            fi
        fi
    done
}

# Função para gerar relatório final
generate_report() {
    log "\n${BLUE}📊 Gerando relatório final...${NC}"
    
    local end_time=$(date +%s)
    local start_time=$(head -2 "$RESULTS_LOG" | tail -1 | cut -d',' -f1)
    local duration=$((end_time - start_time))
    local duration_min=$((duration / 60))
    local duration_sec=$((duration % 60))
    
    # Estatísticas gerais
    local total_requests=$(($(wc -l < "$RESULTS_LOG") - 1))
    local total_writes=$(grep -c "^[0-9]*,[0-9]*,CREATE," "$RESULTS_LOG" 2>/dev/null || echo "0")
    local total_reads=$(grep -c "^[0-9]*,[0-9]*,READ," "$RESULTS_LOG" 2>/dev/null || echo "0")
    
    # Estatísticas de sucesso
    local successful_writes=$(grep "^[0-9]*,[0-9]*,CREATE,201," "$RESULTS_LOG" | wc -l)
    local successful_reads=$(grep "^[0-9]*,[0-9]*,READ,200," "$RESULTS_LOG" | wc -l)
    
    # Estatísticas de erro
    local error_503=$(grep ",503," "$RESULTS_LOG" | wc -l)
    local error_429=$(grep ",429," "$RESULTS_LOG" | wc -l)
    local error_timeout=$(grep ",000," "$RESULTS_LOG" | wc -l)
    
    # Tempos de resposta
    local avg_write_time=$(grep "^[0-9]*,[0-9]*,CREATE," "$RESULTS_LOG" | awk -F',' '{sum+=$5; count++} END {if(count>0) printf "%.0f", sum/count; else print "0"}')
    local avg_read_time=$(grep "^[0-9]*,[0-9]*,READ," "$RESULTS_LOG" | awk -F',' '{sum+=$5; count++} END {if(count>0) printf "%.0f", sum/count; else print "0"}')
    
    # Taxa de requisições
    local req_per_sec=$((total_requests / duration))
    
    # Capturar estatísticas finais do sistema
    local final_stats=$(curl -s "${API_BASE}/system/monitoring" 2>/dev/null || echo "{}")
    local final_queue=$(curl -s "${API_BASE}/system/queue-stats" 2>/dev/null || echo "{}")
    
    # Gerar relatório em Markdown
    cat > "$SUMMARY_LOG" << EOF
# 🚀 Relatório de Teste de Carga Massiva

## 📋 Informações do Teste

| Parâmetro | Valor |
|-----------|-------|
| **URL Testada** | \`${PRODUCTION_URL}\` |
| **Total de Requisições** | ${TOTAL_REQUESTS} planejadas / ${total_requests} executadas |
| **Duração Total** | ${duration_min}m ${duration_sec}s |
| **Taxa Média** | ${req_per_sec} req/s |
| **Workers Simultâneos** | ${CONCURRENT_WORKERS} |
| **Timestamp** | $(date) |

## 📊 Distribuição de Requisições

| Tipo | Planejadas | Executadas | Taxa | Sucesso | Taxa Sucesso |
|------|-----------|------------|------|---------|--------------|
| **WRITE (CREATE)** | ${WRITE_REQUESTS} | ${total_writes} | ${WRITE_PERCENTAGE}% | ${successful_writes} | $(awk "BEGIN {printf \"%.1f\", ($successful_writes * 100.0 / $total_writes)}") % |
| **READ** | ${READ_REQUESTS} | ${total_reads} | ${READ_PERCENTAGE}% | ${successful_reads} | $(awk "BEGIN {printf \"%.1f\", ($successful_reads * 100.0 / $total_reads)}") % |

## ⏱️ Performance

| Métrica | WRITE | READ |
|---------|-------|------|
| **Tempo Médio** | ${avg_write_time} ms | ${avg_read_time} ms |
| **Taxa de Sucesso** | $(awk "BEGIN {printf \"%.1f\", ($successful_writes * 100.0 / $total_writes)}") % | $(awk "BEGIN {printf \"%.1f\", ($successful_reads * 100.0 / $total_reads)}") % |

## ❌ Análise de Erros

| Tipo de Erro | Quantidade | Percentual |
|--------------|------------|------------|
| **503 Service Unavailable** | ${error_503} | $(awk "BEGIN {printf \"%.1f\", ($error_503 * 100.0 / $total_requests)}") % |
| **429 Too Many Requests** | ${error_429} | $(awk "BEGIN {printf \"%.1f\", ($error_429 * 100.0 / $total_requests)}") % |
| **000 Timeout/Connection** | ${error_timeout} | $(awk "BEGIN {printf \"%.1f\", ($error_timeout * 100.0 / $total_requests)}") % |
| **Total de Erros** | $((error_503 + error_429 + error_timeout)) | $(awk "BEGIN {printf \"%.1f\", ((($error_503 + $error_429 + $error_timeout) * 100.0) / $total_requests)}") % |

## 📈 Estatísticas do Sistema

### Estado Final do Sistema

\`\`\`json
${final_stats}
\`\`\`

### Estado das Filas

\`\`\`json
${final_queue}
\`\`\`

## 📂 Arquivos Gerados

- **Resultados Detalhados**: \`$(basename $RESULTS_LOG)\`
- **Log de Progresso**: \`$(basename $PROGRESS_LOG)\`
- **Log de Erros**: \`$(basename $ERROR_LOG)\`
- **Resumo**: \`$(basename $SUMMARY_LOG)\`

## 💡 Recomendações

$(if [ $error_503 -gt $((total_requests * 10 / 100)) ]; then
    echo "⚠️ **Alta taxa de erros 503**: Considere aumentar \`maxQueueSize\` ou \`maxConcurrent\`"
fi)

$(if [ $error_429 -gt $((total_requests * 5 / 100)) ]; then
    echo "⚠️ **Alta taxa de erros 429**: Ajuste os limites de rate limiting"
fi)

$(if [ $((successful_writes + successful_reads)) -gt $((total_requests * 95 / 100)) ]; then
    echo "✅ **Excelente performance**: Taxa de sucesso > 95%"
fi)

---

*Teste executado em $(date)*
EOF

    log "${GREEN}✅ Relatório gerado: ${SUMMARY_LOG}${NC}"
    
    # Exibir resumo no terminal
    echo ""
    echo -e "${PURPLE}========================================${NC}"
    echo -e "${PURPLE}   RESUMO DO TESTE DE CARGA MASSIVA${NC}"
    echo -e "${PURPLE}========================================${NC}"
    echo ""
    echo -e "${CYAN}Total Executado:${NC} ${total_requests}/${TOTAL_REQUESTS} requisições"
    echo -e "${CYAN}Duração:${NC} ${duration_min}m ${duration_sec}s (${req_per_sec} req/s)"
    echo ""
    echo -e "${GREEN}✅ Sucessos:${NC}"
    echo -e "  ├─ WRITE: ${successful_writes}/${total_writes} ($(awk "BEGIN {printf \"%.1f\", ($successful_writes * 100.0 / $total_writes)}")%)"
    echo -e "  └─ READ:  ${successful_reads}/${total_reads} ($(awk "BEGIN {printf \"%.1f\", ($successful_reads * 100.0 / $total_reads)}")%)"
    echo ""
    echo -e "${RED}❌ Erros:${NC}"
    echo -e "  ├─ 503: ${error_503}"
    echo -e "  ├─ 429: ${error_429}"
    echo -e "  └─ Timeout: ${error_timeout}"
    echo ""
    echo -e "${BLUE}⏱️  Performance:${NC}"
    echo -e "  ├─ WRITE: ${avg_write_time}ms médio"
    echo -e "  └─ READ:  ${avg_read_time}ms médio"
    echo ""
    echo -e "${PURPLE}========================================${NC}"
}

# Função principal
main() {
    log "${PURPLE}"
    log "=========================================="
    log "🚀 TESTE DE CARGA MASSIVA - 260K REQUESTS"
    log "=========================================="
    log "${NC}"
    
    log "${CYAN}Configuração do Teste:${NC}"
    log "├─ Total: ${TOTAL_REQUESTS} requisições"
    log "├─ WRITE: ${WRITE_REQUESTS} (${WRITE_PERCENTAGE}%)"
    log "├─ READ: ${READ_REQUESTS} (${READ_PERCENTAGE}%)"
    log "├─ Workers: ${CONCURRENT_WORKERS} simultâneos"
    log "└─ URL: ${PRODUCTION_URL}"
    log ""
    
    # Confirmar execução
    read -p "Deseja iniciar o teste? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "${YELLOW}Teste cancelado pelo usuário${NC}"
        exit 0
    fi
    
    # Capturar estatísticas iniciais
    capture_initial_stats
    
    log "${GREEN}🚀 Iniciando teste com ${CONCURRENT_WORKERS} workers...${NC}"
    log ""
    
    # Iniciar monitor de progresso em background
    monitor_progress $TOTAL_REQUESTS &
    local monitor_pid=$!
    
    # Iniciar workers em paralelo
    for ((worker=1; worker<=CONCURRENT_WORKERS; worker++)); do
        worker_function $worker $WRITES_PER_WORKER $READS_PER_WORKER &
    done
    
    # Aguardar todos os workers terminarem
    wait
    
    # Parar monitor
    kill $monitor_pid 2>/dev/null || true
    
    log "\n${GREEN}✅ Todos os workers completaram!${NC}"
    
    # Gerar relatório
    generate_report
    
    log "\n${CYAN}📊 Teste concluído! Verifique os resultados em:${NC}"
    log "${YELLOW}${TEST_DIR}/${NC}"
}

# Executar
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
