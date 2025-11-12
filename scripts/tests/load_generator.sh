#!/bin/bash

# 🚀 Gerador de Carga - AVI API
# Gera requisições simultâneas para testar a API e enfileirar serviços

set -euo pipefail

# Configurações
PRODUCTION_URL="https://poc-avi.ip.tv"  # Altere para a URL da sua API
API_BASE="${PRODUCTION_URL}/api"
LOAD_DIR="./load_results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Arquivos de resultado
mkdir -p "${LOAD_DIR}"
RESULTS_LOG="${LOAD_DIR}/load_results_${TIMESTAMP}.csv"
SUMMARY_LOG="${LOAD_DIR}/load_summary_${TIMESTAMP}.txt"
MAIN_LOG="${LOAD_DIR}/load_${TIMESTAMP}.log"

# Função de log
log() {
    echo -e "${1}" | tee -a "${MAIN_LOG}"
}

# Função para gerar dados de teste únicos
generate_activity_data() {
    local worker_id="$1"
    local operation_id="$2"
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    
    # Gerar diferentes tipos de dificuldade
    local difficulties=("easy" "medium" "hard")
    local difficulty=${difficulties[$((operation_id % 3))]}
    
    cat <<EOF
{
    "title": "Load Test Activity W${worker_id}-${operation_id}",
    "question": "Teste de carga ${worker_id}-${operation_id}: Quanto é 2+2? (Worker ${worker_id} executando operação ${operation_id} em ${timestamp})",
    "expected_answer": "4",
    "difficulty": "${difficulty}"
}
EOF
}

# Função para fazer uma requisição CREATE
make_create_request() {
    local worker_id="$1"
    local operation_id="$2"
    local result_file="$3"
    
    local start_time=$(date +%s.%3N)
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    local data=$(generate_activity_data "$worker_id" "$operation_id")
    
    local response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total};SIZE:%{size_download}" \
                    -X POST "${API_BASE}/activity" \
                    -H "Content-Type: application/json" \
                    -d "$data" \
                    --connect-timeout 10 --max-time 30 \
                    2>/dev/null || echo "HTTPSTATUS:000;TIME:999;SIZE:0")
    
    local end_time=$(date +%s.%3N)
    local duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "999")
    
    # Extrair dados da resposta
    local status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local curl_time=$(echo "$response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)
    local size=$(echo "$response" | grep -o "SIZE:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTPSTATUS:.*$//')
    
    # Validar status
    [[ "$status" =~ ^[0-9]{3}$ ]] || status="000"
    [[ "$curl_time" =~ ^[0-9]+\.?[0-9]*$ ]] || curl_time="999"
    [[ "$size" =~ ^[0-9]+$ ]] || size="0"
    
    # Tentar extrair ID da atividade criada
    local activity_id=""
    if [ "$status" = "201" ]; then
        # Sua API retorna: {"success": true, "data": {"id": ..., ...}}
        activity_id=$(echo "$body" | jq -r '.data.id // .id // .activity_id // empty' 2>/dev/null || echo "")
    fi
    
    # Salvar resultado
    echo "CREATE,${worker_id},${operation_id},${status},${curl_time},${size},${timestamp},${activity_id}" >> "$result_file"
    
    # Retornar ID para possível uso posterior
    echo "$activity_id"
}

# Função para fazer uma requisição READ
make_read_request() {
    local worker_id="$1"
    local operation_id="$2"
    local activity_id="$3"
    local result_file="$4"
    
    local start_time=$(date +%s.%3N)
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    
    # Se não temos ID específico, fazer GET geral
    local endpoint="/activity"
    if [ -n "$activity_id" ] && [ "$activity_id" != "null" ] && [ "$activity_id" != "" ]; then
        endpoint="/activity/${activity_id}"
    fi
    
    local response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total};SIZE:%{size_download}" \
                    -X GET "${API_BASE}${endpoint}" \
                    --connect-timeout 10 --max-time 30 \
                    2>/dev/null || echo "HTTPSTATUS:000;TIME:999;SIZE:0")
    
    local end_time=$(date +%s.%3N)
    local duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "999")
    
    # Extrair dados da resposta
    local status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local curl_time=$(echo "$response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)
    local size=$(echo "$response" | grep -o "SIZE:[0-9]*" | cut -d: -f2)
    
    # Validar status
    [[ "$status" =~ ^[0-9]{3}$ ]] || status="000"
    [[ "$curl_time" =~ ^[0-9]+\.?[0-9]*$ ]] || curl_time="999"
    [[ "$size" =~ ^[0-9]+$ ]] || size="0"
    
    # Salvar resultado
    echo "READ,${worker_id},${operation_id},${status},${curl_time},${size},${timestamp},${activity_id}" >> "$result_file"
}

# Função para fazer requisições de sistema (para enfileirar serviços)
make_system_requests() {
    local worker_id="$1"
    local result_file="$2"
    
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    
    # Testar batch stats (enfileira verificação)
    local batch_response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total}" \
                          -X GET "${API_BASE}/batch/stats" \
                          --connect-timeout 10 --max-time 20 \
                          2>/dev/null || echo "HTTPSTATUS:000;TIME:999")
    
    local batch_status=$(echo "$batch_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local batch_time=$(echo "$batch_response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)
    
    echo "BATCH,${worker_id},0,${batch_status},${batch_time},0,${timestamp}," >> "$result_file"
    
    # Testar cache management (formato correto da API)
    local cache_data='{
        "action": "stats"
    }'
    
    local cache_response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total}" \
                          -X POST "${API_BASE}/system/cache-management" \
                          -H "Content-Type: application/json" \
                          -d "$cache_data" \
                          --connect-timeout 10 --max-time 20 \
                          2>/dev/null || echo "HTTPSTATUS:000;TIME:999")
    
    local cache_status=$(echo "$cache_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local cache_time=$(echo "$cache_response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)
    
    echo "CACHE,${worker_id},0,${cache_status},${cache_time},0,${timestamp}," >> "$result_file"
    
    # Testar PubSub (formato correto com action)
    local pubsub_data='{
        "action": "publish",
        "channel": "load_test_channel",
        "event": "load_test_event",
        "data": {
            "worker_id": '${worker_id}',
            "timestamp": "'${timestamp}'",
            "test_session": "'${TIMESTAMP}'"
        }
    }'
    
    local pubsub_response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total}" \
                           -X POST "${API_BASE}/system/pubsub-test" \
                           -H "Content-Type: application/json" \
                           -d "$pubsub_data" \
                           --connect-timeout 10 --max-time 20 \
                           2>/dev/null || echo "HTTPSTATUS:000;TIME:999")
    
    local pubsub_status=$(echo "$pubsub_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local pubsub_time=$(echo "$pubsub_response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)
    
    echo "PUBSUB,${worker_id},0,${pubsub_status},${pubsub_time},0,${timestamp}," >> "$result_file"
}

# Função worker que executa operações
worker_function() {
    local worker_id="$1"
    local operations_per_worker="$2"
    local include_reads="$3"
    local include_system="$4"
    local result_file="$5"
    
    log "${CYAN}Worker ${worker_id} iniciado - ${operations_per_worker} operações${NC}"
    
    for i in $(seq 1 "$operations_per_worker"); do
        # Criar atividade
        local activity_id=$(make_create_request "$worker_id" "$i" "$result_file")
        
        # Pequena pausa para simular comportamento real
        sleep 0.1
        
        # Fazer leitura se solicitado
        if [ "$include_reads" = true ]; then
            make_read_request "$worker_id" "$i" "$activity_id" "$result_file"
            sleep 0.05
        fi
        
        # Fazer requisições de sistema para enfileirar serviços
        if [ "$include_system" = true ] && [ $((i % 2)) -eq 0 ]; then
            make_system_requests "$worker_id" "$result_file"
            sleep 0.1
        fi
        
        # Pausa entre operações
        sleep 0.2
    done
    
    log "${GREEN}Worker ${worker_id} finalizado${NC}"
}

# Função para exibir progresso em tempo real
show_progress() {
    local total_workers="$1"
    local operations_per_worker="$2"
    local result_file="$3"
    
    local total_expected=$((total_workers * operations_per_worker))
    
    while true; do
        if [ -f "$result_file" ]; then
            local completed=$(grep -c "^CREATE" "$result_file" 2>/dev/null || echo "0")
            local success=$(grep "^CREATE" "$result_file" 2>/dev/null | grep -c ",201," || echo "0")
            local errors=$(grep "^CREATE" "$result_file" 2>/dev/null | grep -c ",000," || echo "0")
            
            # Remover espaços em branco e quebras de linha
            completed=$(echo "$completed" | tr -d '\n\r ' | grep -o '[0-9]*' | head -1)
            success=$(echo "$success" | tr -d '\n\r ' | grep -o '[0-9]*' | head -1)
            errors=$(echo "$errors" | tr -d '\n\r ' | grep -o '[0-9]*' | head -1)
            
            # Garantir que são números válidos (usar 0 se estiver vazio)
            [ -z "$completed" ] && completed=0
            [ -z "$success" ] && success=0
            [ -z "$errors" ] && errors=0
            
            local percentage=0
            if [ "$total_expected" -gt 0 ] && [ "$completed" -gt 0 ]; then
                percentage=$(( completed * 100 / total_expected ))
            fi
            
            echo -ne "\r${CYAN}Progresso: ${completed}/${total_expected} (${percentage}%) - Sucessos: ${success} - Erros: ${errors}${NC}"
        fi
        
        sleep 2
    done
}

# Função principal para gerar carga
generate_load() {
    local concurrent_workers="$1"
    local operations_per_worker="$2"
    local include_reads="$3"
    local include_system="$4"
    
    log "\n${PURPLE}🚀 INICIANDO GERAÇÃO DE CARGA${NC}"
    log "${PURPLE}================================${NC}"
    log "${CYAN}URL: ${PRODUCTION_URL}${NC}"
    log "${CYAN}Workers simultâneos: ${concurrent_workers}${NC}"
    log "${CYAN}Operações por worker: ${operations_per_worker}${NC}"
    log "${CYAN}Incluir leituras: $(if [ "$include_reads" = true ]; then echo "SIM"; else echo "NÃO"; fi)${NC}"
    log "${CYAN}Incluir requisições de sistema: $(if [ "$include_system" = true ]; then echo "SIM"; else echo "NÃO"; fi)${NC}"
    
    local total_operations=$((concurrent_workers * operations_per_worker))
    if [ "$include_reads" = true ]; then
        total_operations=$((total_operations * 2))
    fi
    
    log "${CYAN}Total de operações esperadas: ${total_operations}${NC}"
    
    # Inicializar arquivo de resultados
    echo "operation,worker_id,operation_id,http_status,response_time,response_size,timestamp,activity_id" > "$RESULTS_LOG"
    
    # Iniciar exibição de progresso em background
    show_progress "$concurrent_workers" "$operations_per_worker" "$RESULTS_LOG" &
    local progress_pid=$!
    
    log "\n${YELLOW}🏃 Executando workers simultâneos...${NC}"
    
    # Iniciar workers em paralelo
    local pids=()
    for worker_id in $(seq 1 "$concurrent_workers"); do
        worker_function "$worker_id" "$operations_per_worker" "$include_reads" "$include_system" "$RESULTS_LOG" &
        pids+=($!)
    done
    
    # Aguardar conclusão de todos os workers
    log "\n${YELLOW}⏳ Aguardando conclusão dos workers...${NC}"
    for pid in "${pids[@]}"; do
        wait "$pid"
    done
    
    # Parar exibição de progresso
    kill $progress_pid 2>/dev/null || true
    wait $progress_pid 2>/dev/null || true
    
    log "\n${GREEN}✅ Geração de carga concluída!${NC}"
}

# Função para gerar relatório de carga
generate_load_report() {
    log "\n${BLUE}📊 Gerando relatório de carga...${NC}"
    
    if [ ! -f "$RESULTS_LOG" ]; then
        log "${RED}❌ Arquivo de resultados não encontrado${NC}"
        return 1
    fi
    
    # Calcular estatísticas (remover espaços e quebras de linha)
    local total_requests=$(tail -n +2 "$RESULTS_LOG" | wc -l | tr -d '\n\r ')
    local create_requests=$(grep "^CREATE" "$RESULTS_LOG" | wc -l | tr -d '\n\r ')
    local read_requests=$(grep "^READ" "$RESULTS_LOG" | wc -l | tr -d '\n\r ')
    local system_requests=$(grep -E "^(BATCH|CACHE|PUBSUB)" "$RESULTS_LOG" | wc -l | tr -d '\n\r ')
    
    local successful_creates=$(grep "^CREATE" "$RESULTS_LOG" | grep -c ",201," 2>/dev/null | tr -d '\n\r ' || echo "0")
    local successful_reads=$(grep "^READ" "$RESULTS_LOG" | grep -c ",200," 2>/dev/null | tr -d '\n\r ' || echo "0")
    local successful_system=$(grep -E "^(BATCH|CACHE|PUBSUB)" "$RESULTS_LOG" | grep -cE ",200,|,201," 2>/dev/null | tr -d '\n\r ' || echo "0")
    
    # Garantir valores válidos
    [ -z "$total_requests" ] && total_requests=0
    [ -z "$create_requests" ] && create_requests=0
    [ -z "$read_requests" ] && read_requests=0
    [ -z "$system_requests" ] && system_requests=0
    [ -z "$successful_creates" ] && successful_creates=0
    [ -z "$successful_reads" ] && successful_reads=0
    [ -z "$successful_system" ] && successful_system=0
    
    local avg_create_time="0"
    local avg_read_time="0"
    
    if [ "$create_requests" -gt 0 ]; then
        avg_create_time=$(grep "^CREATE" "$RESULTS_LOG" | awk -F',' '{sum+=$5; count++} END {printf "%.3f", sum/count}')
    fi
    
    if [ "$read_requests" -gt 0 ]; then
        avg_read_time=$(grep "^READ" "$RESULTS_LOG" | awk -F',' '{sum+=$5; count++} END {printf "%.3f", sum/count}')
    fi
    
    # Gerar relatório
    cat > "$SUMMARY_LOG" << EOF
========================================
🚀 RELATÓRIO DE GERAÇÃO DE CARGA
========================================

URL Testada: ${PRODUCTION_URL}
Timestamp: $(date)

📊 RESUMO DAS OPERAÇÕES
------------------------
Total de Requisições: ${total_requests}
├─ CREATE Operations: ${create_requests} (${successful_creates} sucessos)
├─ READ Operations: ${read_requests} (${successful_reads} sucessos)
└─ SYSTEM Operations: ${system_requests} (${successful_system} sucessos)

⏱️ TEMPOS DE RESPOSTA
---------------------
CREATE Médio: ${avg_create_time}s
READ Médio: ${avg_read_time}s

📈 TAXAS DE SUCESSO
-------------------
CREATE: $(if [ "$create_requests" -gt 0 ]; then echo "scale=1; $successful_creates * 100 / $create_requests" | bc; else echo "0"; fi)%
READ: $(if [ "$read_requests" -gt 0 ]; then echo "scale=1; $successful_reads * 100 / $read_requests" | bc; else echo "0"; fi)%
SYSTEM: $(if [ "$system_requests" -gt 0 ]; then echo "scale=1; $successful_system * 100 / $system_requests" | bc; else echo "0"; fi)%

📂 ARQUIVOS GERADOS
-------------------
- Resultados Detalhados: load_results_${TIMESTAMP}.csv
- Resumo: load_summary_${TIMESTAMP}.txt
- Log Principal: load_${TIMESTAMP}.log

$(date)
EOF

    log "${GREEN}✅ Relatório de carga gerado: ${SUMMARY_LOG}${NC}"
    
    # Mostrar resumo na tela
    echo ""
    cat "$SUMMARY_LOG"
}

# Função de teste de conectividade
test_connectivity() {
    log "${BLUE}🌐 Testando conectividade...${NC}"
    
    local response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total}" \
                    -X GET "${API_BASE}/activity" \
                    --connect-timeout 10 --max-time 15 \
                    2>/dev/null || echo "HTTPSTATUS:000;TIME:999")
    
    local status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local time=$(echo "$response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)
    
    if [ "$status" = "200" ]; then
        log "${GREEN}✅ API Online (${time}s)${NC}"
        return 0
    else
        log "${RED}❌ API Offline (HTTP $status)${NC}"
        return 1
    fi
}

# Menu principal
show_menu() {
    echo -e "${PURPLE}"
    echo "=========================================="
    echo "🚀 GERADOR DE CARGA - AVI API"
    echo "=========================================="
    echo -e "${NC}"
    echo -e "${CYAN}URL: ${PRODUCTION_URL}${NC}"
    echo ""
    echo "Opções de Carga:"
    echo ""
    echo "1. 🟢 Carga LEVE (5 workers, 3 ops cada)"
    echo "2. 🟡 Carga MODERADA (10 workers, 5 ops cada)"
    echo "3. 🟠 Carga INTENSA (20 workers, 8 ops cada)"
    echo "4. 🔴 Carga PESADA (30 workers, 10 ops cada)"
    echo "5. ⚙️  Carga CUSTOMIZADA"
    echo ""
    echo "Utilitários:"
    echo ""
    echo "6. 🌐 Teste de Conectividade"
    echo "7. 📊 Gerar Relatório dos Últimos Dados"
    echo "8. 📂 Ver Arquivos de Resultado"
    echo "0. ❌ Sair"
    echo ""
}

# Função principal
main() {
    while true; do
        show_menu
        read -p "Escolha uma opção [0-8]: " choice
        
        case $choice in
            1)
                test_connectivity && generate_load 5 3 true true
                generate_load_report
                ;;
            2)
                test_connectivity && generate_load 10 5 true true
                generate_load_report
                ;;
            3)
                test_connectivity && generate_load 20 8 true true
                generate_load_report
                ;;
            4)
                test_connectivity && generate_load 30 10 true true
                generate_load_report
                ;;
            5)
                echo ""
                read -p "Número de workers simultâneos: " workers
                read -p "Operações por worker: " operations
                read -p "Incluir operações READ? (s/N): " include_reads_input
                read -p "Incluir requisições de sistema? (s/N): " include_system_input
                
                local include_reads=false
                local include_system=false
                [[ "$include_reads_input" =~ ^[Ss]$ ]] && include_reads=true
                [[ "$include_system_input" =~ ^[Ss]$ ]] && include_system=true
                
                test_connectivity && generate_load "$workers" "$operations" "$include_reads" "$include_system"
                generate_load_report
                ;;
            6)
                test_connectivity
                ;;
            7)
                generate_load_report
                ;;
            8)
                log "\n${BLUE}📂 Arquivos de resultado:${NC}"
                ls -la "${LOAD_DIR}/" 2>/dev/null || log "${YELLOW}Nenhum arquivo encontrado${NC}"
                ;;
            0)
                log "\n${GREEN}👋 Gerador de carga finalizado!${NC}"
                exit 0
                ;;
            *)
                log "${RED}❌ Opção inválida${NC}"
                ;;
        esac
        
        echo ""
        read -p "Pressione ENTER para continuar..."
        echo ""
    done
}

# Executar se chamado diretamente
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi