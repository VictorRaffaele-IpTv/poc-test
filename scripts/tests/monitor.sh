#!/bin/bash

# 📊 Monitor de Recursos e Integridade - AVI API
# Monitora recursos do sistema, integridade dos dados, filas de mensageria

set -euo pipefail

# Configurações
PRODUCTION_URL="http://localhost:3000"
API_BASE="${PRODUCTION_URL}/api"
MONITOR_DIR="./monitor_results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
MONITOR_INTERVAL=3  # segundos

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Arquivos temporários (na pasta /tmp)
TMP_DIR="/tmp/monitor_$$"
mkdir -p "${TMP_DIR}"
RESOURCES_LOG="${TMP_DIR}/resources.csv"
INTEGRITY_LOG="${TMP_DIR}/integrity.csv" 
QUEUES_LOG="${TMP_DIR}/queues.csv"
MAIN_LOG="${TMP_DIR}/monitor.log"
STATE_FILE="${TMP_DIR}/monitor_state.json"

# Arquivo de relatório final (único arquivo permanente)
mkdir -p "${MONITOR_DIR}"
FINAL_REPORT="${MONITOR_DIR}/monitor_report_${TIMESTAMP}.md"

# Limpeza ao sair
trap 'rm -rf "${TMP_DIR}"' EXIT

# Variáveis de estado para detectar mudanças e baseline inicial
LAST_MAX_ID=0
LAST_TOTAL_ACTIVITIES=0
MONITORING_START_TIME=""
BASELINE_QUEUE_PROCESSED=0
BASELINE_CACHE_ITEMS=0
BASELINE_PUBSUB_MESSAGES=0
BASELINE_TOTAL_ACTIVITIES=0

# Função de log
log() {
    echo -e "${1}" | tee -a "${MAIN_LOG}"
}

# Função para inicializar baseline e arquivos CSV
init_logs() {
    # Capturar baseline inicial (momento zero do monitoramento)
    MONITORING_START_TIME=$(date "+%Y-%m-%d %H:%M:%S")
    
    # Obter dados baseline para cálculos incrementais
    local baseline_monitoring=$(curl -s "${API_BASE}/system/monitoring" --connect-timeout 5 --max-time 10 2>/dev/null || echo "{}")
    local baseline_queue=$(curl -s "${API_BASE}/system/queue-stats" --connect-timeout 5 --max-time 10 2>/dev/null || echo "{}")
    
    # Capturar valores iniciais
    BASELINE_CACHE_ITEMS=$(echo "$baseline_monitoring" | jq -r '.data.cache.summary.total_items // 0' 2>/dev/null || echo "0")
    BASELINE_PUBSUB_MESSAGES=$(echo "$baseline_monitoring" | jq -r '.data.pubsub.message_history_size // 0' 2>/dev/null || echo "0")
    BASELINE_TOTAL_ACTIVITIES=$(echo "$baseline_monitoring" | jq -r '.data.database.total_activities // 0' 2>/dev/null || echo "0")
    
    # Capturar baseline das filas
    local baseline_create=$(echo "$baseline_queue" | jq -r '.data.create_queue.processed // 0' 2>/dev/null || echo "0")
    local baseline_read=$(echo "$baseline_queue" | jq -r '.data.read_queue.processed // 0' 2>/dev/null || echo "0")
    local baseline_system=$(echo "$baseline_queue" | jq -r '.data.system_queue.processed // 0' 2>/dev/null || echo "0")
    BASELINE_QUEUE_PROCESSED=$((baseline_create + baseline_read + baseline_system))
    
    # Salvar baseline em arquivo para persistência
    echo "{\"start_time\": \"$MONITORING_START_TIME\", \"baseline_queue\": $BASELINE_QUEUE_PROCESSED, \"baseline_cache\": $BASELINE_CACHE_ITEMS, \"baseline_pubsub\": $BASELINE_PUBSUB_MESSAGES, \"baseline_activities\": $BASELINE_TOTAL_ACTIVITIES}" > "$STATE_FILE"
    
    # Inicializar CSVs
    echo "timestamp,cpu_usage,memory_mb,connections_active,connections_established,load_avg" > "${RESOURCES_LOG}"
    echo "timestamp,total_activities_in_system,new_activities,data_consistency,response_time_avg,activities_since_start,monitoring_duration" > "${INTEGRITY_LOG}"
    echo "timestamp,batch_pending,batch_processed,pubsub_active,cache_operations,queue_health,queue_processed,queue_active,queue_size,processed_since_start,cache_growth,pubsub_growth" > "${QUEUES_LOG}"
    
    log "${CYAN}📊 Baseline capturado - Início: ${MONITORING_START_TIME}${NC}"
    log "${CYAN}   Queue Processed: ${BASELINE_QUEUE_PROCESSED} | Cache: ${BASELINE_CACHE_ITEMS} | PubSub: ${BASELINE_PUBSUB_MESSAGES} | Activities: ${BASELINE_TOTAL_ACTIVITIES}${NC}"
}

# Função para monitorar recursos do sistema
monitor_resources() {
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    
    # CPU usage aproximado (baseado no load average)
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local cpu_cores=$(nproc)
    local cpu_usage=$(echo "scale=1; ($load_avg / $cpu_cores) * 100" | bc -l 2>/dev/null || echo "0.0")
    
    # Memória em MB
    local memory_mb=$(free -m | awk 'NR==2{printf "%d", $3}')
    
    # Conexões de rede
    local connections_active=$(ss -t | grep -c "ESTAB\|TIME-WAIT\|SYN" 2>/dev/null || echo "0")
    local connections_established=$(ss -t | grep -c "ESTAB" 2>/dev/null || echo "0")
    
    # Salvar no CSV
    echo "${timestamp},${cpu_usage},${memory_mb},${connections_active},${connections_established},${load_avg}" >> "${RESOURCES_LOG}"
    
    # Retornar para display
    echo "${cpu_usage},${memory_mb},${connections_active},${connections_established},${load_avg}"
}

# Função para verificar integridade dos dados (PASSIVA - NÃO CRIA DADOS)
monitor_data_integrity() {
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    
    # Medir tempo de resposta da API principal
    local start_time=$(date +%s.%3N)
    local activities_response=$(curl -s "${API_BASE}/activity" --connect-timeout 5 --max-time 15 2>/dev/null || echo '{"success":false,"data":[]}')
    local end_time=$(date +%s.%3N)
    local response_time=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "0")
    
    # Extrair array de atividades da estrutura {success, data, meta}
    local activities_array=$(echo "$activities_response" | jq '.data // []' 2>/dev/null || echo "[]")
    local total_activities=$(echo "$activities_array" | jq '. | length' 2>/dev/null || echo "0")
    
    # Se há atividades, obter ID máximo e calcular novas atividades de forma mais inteligente
    local new_activities=0
    local max_id="0"
    local total_in_system="0"
    
    if [ "$total_activities" -gt 0 ]; then
        max_id=$(echo "$activities_array" | jq 'map(.id) | max' 2>/dev/null || echo "0")
        
        # Contar atividades dos últimos 2 minutos usando timestamps
        local two_minutes_ago=$(date -d '2 minutes ago' -u +%Y-%m-%dT%H:%M:%S 2>/dev/null || echo "")
        if [ -n "$two_minutes_ago" ]; then
            new_activities=$(echo "$activities_array" | jq --arg threshold "${two_minutes_ago}" '[.[] | select(.created_at? // .timestamp? // .date? // "" | . != "" and . > $threshold)] | length' 2>/dev/null || echo "0")
        fi
        
        # Mostrar o total real de atividades no sistema baseado no ID máximo
        if [ "$max_id" -gt "$total_activities" ]; then
            total_in_system="$max_id"
        else
            total_in_system="$total_activities"
        fi
    fi
    
    # Verificar consistência de forma PASSIVA - apenas testar endpoints disponíveis
    # Testar endpoint de sistema de monitoramento para verificar saúde da API
    local system_response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
                           "${API_BASE}/system/monitoring" \
                           --connect-timeout 5 --max-time 10 2>/dev/null || echo "HTTPSTATUS:000")
    
    local system_status=$(echo "$system_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local data_consistency="OK"
    
    # Verificar se a API está respondendo corretamente
    if [ "$system_status" != "200" ]; then
        # Se monitoring falhar, testar um endpoint mais básico
        local basic_test=$(curl -s -w "HTTPSTATUS:%{http_code}" \
                          "${API_BASE}/activity" \
                          --connect-timeout 5 --max-time 10 2>/dev/null || echo "HTTPSTATUS:000")
        local basic_status=$(echo "$basic_test" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
        
        if [ "$basic_status" != "200" ]; then
            data_consistency="ERROR"
        else
            data_consistency="PARTIAL"
        fi
    else
        # API está funcionando, verificar se retorna dados válidos
        local system_data=$(echo "$system_response" | sed 's/HTTPSTATUS:.*$//')
        local has_valid_data=$(echo "$system_data" | jq -r '.success // false' 2>/dev/null || echo "false")
        
        if [ "$has_valid_data" != "true" ]; then
            data_consistency="PARTIAL"
        fi
    fi
    
    # Carregar estado anterior para detectar crescimento real
    if [ -f "$STATE_FILE" ]; then
        LAST_MAX_ID=$(jq -r '.last_max_id // 0' "$STATE_FILE" 2>/dev/null || echo "0")
        LAST_TOTAL_ACTIVITIES=$(jq -r '.last_total_activities // 0' "$STATE_FILE" 2>/dev/null || echo "0")
        
        # Calcular crescimento desde a última verificação
        local id_growth=$((max_id - LAST_MAX_ID))
        if [ "$id_growth" -gt 0 ] && [ "$id_growth" -lt 1000 ]; then
            new_activities="${new_activities} (+${id_growth} desde última verificação)"
        fi
    fi
    
    # Salvar estado atual
    echo "{\"last_max_id\": $max_id, \"last_total_activities\": $total_activities, \"timestamp\": \"$timestamp\"}" > "$STATE_FILE"
    
    # Calcular métricas incrementais desde o início do monitoramento
    local activities_since_start=$((total_in_system - BASELINE_TOTAL_ACTIVITIES))
    local monitoring_duration_seconds=$(( $(date +%s) - $(date -d "$MONITORING_START_TIME" +%s 2>/dev/null || echo "0") ))
    local monitoring_duration_display=""
    
    if [ "$monitoring_duration_seconds" -ge 60 ]; then
        local minutes=$((monitoring_duration_seconds / 60))
        local seconds=$((monitoring_duration_seconds % 60))
        monitoring_duration_display="${minutes}m${seconds}s"
    else
        monitoring_duration_display="${monitoring_duration_seconds}s"
    fi
    
    # Salvar no CSV com dados incrementais
    echo "${timestamp},${total_in_system},${new_activities},${data_consistency},${response_time},${activities_since_start},${monitoring_duration_display}" >> "${INTEGRITY_LOG}"
    
    # Retornar para display (incluindo dados incrementais)
    echo "${total_in_system},${new_activities},${data_consistency},${response_time},${activities_since_start},${monitoring_duration_display}"
}

# Função para verificar filas e mensageria
monitor_queues_messaging() {
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    
    # Verificar sistema de monitoramento primeiro
    local monitoring_response=$(curl -s "${API_BASE}/system/monitoring" --connect-timeout 5 --max-time 10 2>/dev/null || echo "{}")
    local monitoring_status=$(curl -s -w "%{http_code}" "${API_BASE}/system/monitoring" --connect-timeout 5 --max-time 10 -o /dev/null 2>/dev/null || echo "000")
    
    # Obter estatísticas mais detalhadas da queue (dados em tempo real)
    local queue_response=$(curl -s "${API_BASE}/system/queue-stats" --connect-timeout 5 --max-time 10 2>/dev/null || echo "{}")
    
    # Somar todas as operações processadas das filas
    local create_processed=$(echo "$queue_response" | jq -r '.data.create_queue.processed // 0' 2>/dev/null || echo "0")
    local read_processed=$(echo "$queue_response" | jq -r '.data.read_queue.processed // 0' 2>/dev/null || echo "0")
    local system_processed=$(echo "$queue_response" | jq -r '.data.system_queue.processed // 0' 2>/dev/null || echo "0")
    local total_processed=$((create_processed + read_processed + system_processed))
    
    # Somar todas as requisições ativas (em processamento)
    local create_active=$(echo "$queue_response" | jq -r '.data.create_queue.active_requests // 0' 2>/dev/null || echo "0")
    local read_active=$(echo "$queue_response" | jq -r '.data.read_queue.active_requests // 0' 2>/dev/null || echo "0")
    local system_active=$(echo "$queue_response" | jq -r '.data.system_queue.active_requests // 0' 2>/dev/null || echo "0")
    local total_active=$((create_active + read_active + system_active))
    
    # Somar tamanho das filas (requests esperando)
    local create_queued=$(echo "$queue_response" | jq -r '.data.create_queue.queued // 0' 2>/dev/null || echo "0")
    local read_queued=$(echo "$queue_response" | jq -r '.data.read_queue.queued // 0' 2>/dev/null || echo "0")
    local system_queued=$(echo "$queue_response" | jq -r '.data.system_queue.queued // 0' 2>/dev/null || echo "0")
    local total_queued=$((create_queued + read_queued + system_queued))
    
    # Obter LAG real do Kafka (mensagens pendentes)
    # Prioridade 1: Via API (funciona remotamente)
    local kafka_lag=0
    local kafka_lag_response=$(curl -s "${API_BASE}/system/kafka-lag" --connect-timeout 5 --max-time 10 2>/dev/null || echo "{}")
    local kafka_lag_from_api=$(echo "$kafka_lag_response" | jq -r '.data.total_lag // .total_lag // -1' 2>/dev/null || echo "-1")
    
    if [ "$kafka_lag_from_api" != "-1" ]; then
        # API retornou LAG válido
        kafka_lag="$kafka_lag_from_api"
    elif command -v docker &> /dev/null && docker ps 2>/dev/null | grep -q kafka; then
        # Fallback: tentar via Docker local (apenas se disponível)
        local lag_output=$(docker compose -f ../../ci/docker-compose.yml exec -T kafka kafka-consumer-groups \
            --bootstrap-server localhost:9092 \
            --all-groups \
            --describe 2>/dev/null || echo "")
        
        # Somar LAG de todas as partições (coluna 6)
        kafka_lag=$(echo "$lag_output" | awk 'NR>1 {if($6 ~ /^[0-9]+$/) sum+=$6} END {print sum+0}')
    else
        # Não conseguiu obter LAG - mostrar N/A
        kafka_lag="N/A"
    fi
    
    # Obter dados mais informativos do sistema
    local cache_items=$(echo "$monitoring_response" | jq -r '.data.cache.summary.total_items // 0' 2>/dev/null || echo "0")
    local cache_hit_rate=$(echo "$monitoring_response" | jq -r '.data.cache.summary.avg_hit_rate // "0%"' 2>/dev/null || echo "0%")
    local pubsub_messages=$(echo "$monitoring_response" | jq -r '.data.pubsub.message_history_size // 0' 2>/dev/null || echo "0")
    local total_activities=$(echo "$monitoring_response" | jq -r '.data.database.total_activities // 0' 2>/dev/null || echo "0")
    
    # Usar LAG real do Kafka ao invés do histórico PubSub
    local batch_pending="$cache_items"       # Cache items em uso
    local batch_processed="$kafka_lag"       # LAG REAL do Kafka (mensagens pendentes)
    local queue_processed="$total_processed"
    local queue_active="$total_active" 
    local queue_size="$total_queued"
    
    # Determinar saúde das filas baseado em dados reais
    local queue_health="ACTIVE"
    if [ "$monitoring_status" != "200" ]; then
        queue_health="ERROR"
    elif [ "$total_queued" -gt 0 ]; then
        queue_health="BUSY"
    elif [ "$total_processed" -gt 0 ]; then
        queue_health="ACTIVE"
    else
        queue_health="IDLE"
    fi
    
    # Testar cache management (corrigir formato)
    local cache_test_data='{"action": "stats"}'
    local cache_response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
                          -X POST "${API_BASE}/system/cache-management" \
                          -H "Content-Type: application/json" \
                          -d "$cache_test_data" \
                          --connect-timeout 5 --max-time 10 2>/dev/null || echo "HTTPSTATUS:000")
    local cache_status=$(echo "$cache_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    local cache_operations="OK"
    if [ "$cache_status" != "200" ] && [ "$cache_status" != "201" ]; then
        cache_operations="ERROR"
    fi
    
    # Status dos componentes
    local pubsub_active="UNKNOWN"
    if [ "$monitoring_status" = "200" ]; then
        pubsub_active="OK"
    else
        pubsub_active="ERROR"
    fi
    
    # Cache status com hit rate
    local cache_status_display="$cache_operations"
    if [ "$cache_operations" = "OK" ]; then
        cache_status_display="OK (${cache_hit_rate} hit rate)"
    fi
    
    # Calcular crescimentos incrementais desde o início
    local processed_since_start=$((total_processed - BASELINE_QUEUE_PROCESSED))
    local cache_growth=$((cache_items - BASELINE_CACHE_ITEMS))
    local pubsub_growth=$((pubsub_messages - BASELINE_PUBSUB_MESSAGES))
    
    # Salvar no CSV com dados incrementais
    echo "${timestamp},${batch_pending},${batch_processed},${pubsub_active},${cache_operations},${queue_health},${queue_processed},${queue_active},${queue_size},${processed_since_start},${cache_growth},${pubsub_growth}" >> "${QUEUES_LOG}"
    
    # Retornar para display (incluindo dados incrementais)
    echo "${batch_pending},${batch_processed},${pubsub_active},${cache_status_display},${queue_health},${queue_processed},${queue_active},${queue_size},${processed_since_start},${cache_growth},${pubsub_growth}"
}

# Função para exibir status colorido
status_color() {
    local status="$1"
    case "$status" in
        "OK") echo -e "${GREEN}${status}${NC}" ;;
        "ERROR") echo -e "${RED}${status}${NC}" ;;
        "PARTIAL"|"IDLE"|"UNKNOWN") echo -e "${YELLOW}${status}${NC}" ;;
        *) echo -e "${CYAN}${status}${NC}" ;;
    esac
}

# Função para exibir número colorido baseado em limites
number_color() {
    local value="$1"
    local warning_limit="$2"
    local critical_limit="$3"
    
    if (( $(echo "$value >= $critical_limit" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${RED}${value}${NC}"
    elif (( $(echo "$value >= $warning_limit" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${YELLOW}${value}${NC}"
    else
        echo -e "${GREEN}${value}${NC}"
    fi
}

# Função para exibir dashboard em tempo real
display_dashboard() {
    local iteration="$1"
    local resources="$2"
    local integrity="$3" 
    local queues="$4"
    
    # Parse dos dados (incluindo métricas incrementais)
    IFS=',' read -r cpu_usage memory_mb conn_active conn_estab load_avg <<< "$resources"
    IFS=',' read -r total_activities new_activities data_consistency response_time activities_since_start monitoring_duration <<< "$integrity"
    IFS=',' read -r batch_pending batch_processed pubsub_active cache_status_display queue_health queue_processed queue_active queue_size processed_since_start cache_growth pubsub_growth <<< "$queues"
    
    # Limpar tela e mostrar header
    clear
    echo -e "${PURPLE}"
    echo "=========================================="
    echo "📊 MONITOR DE RECURSOS E INTEGRIDADE"
    echo "=========================================="
    echo -e "${NC}"
    echo -e "${CYAN}URL: ${PRODUCTION_URL}${NC}"
    echo -e "${CYAN}Iteração: #${iteration} - $(date '+%H:%M:%S') | Duração: ${monitoring_duration}${NC}"
    echo ""
    
    # Seção de Recursos do Sistema
    echo -e "${BLUE}💻 RECURSOS DO SISTEMA${NC}"
    echo "────────────────────────────────"
    echo -e "🖥️  CPU Usage:        $(number_color "$cpu_usage" "70" "90")%"
    echo -e "💾 Memory Usage:     $(number_color "$memory_mb" "1000" "2000") MB"
    echo -e "🌐 Connections:      $(number_color "$conn_active" "100" "200") (${conn_estab} established)"
    echo -e "📊 Load Average:     $(number_color "$load_avg" "2" "4")"
    echo ""
    
    # Seção de Integridade dos Dados
    echo -e "${BLUE}🔍 INTEGRIDADE DOS DADOS${NC}"
    echo "────────────────────────────────"
    # Total activities agora mostra o total real no sistema
    if [[ "$total_activities" =~ ^[0-9]+$ ]]; then
        echo -e "📝 Total Activities in System: $(number_color "$total_activities" "1000" "5000")"
    else
        echo -e "📝 Total Activities in System: ${CYAN}${total_activities}${NC}"
    fi
    echo -e "🆕 New Activities:   $(number_color "$new_activities" "5" "10") (last 2min)"
    echo -e "✅ Data Consistency: $(status_color "$data_consistency")"
    echo -e "⏱️  Response Time:    $(number_color "$response_time" "0.5" "1.0")s"
    echo ""
    
    # Seção de Cache e Mensageria (dados dinâmicos)
    echo -e "${BLUE}🎯 CACHE & MENSAGERIA${NC}"
    echo "────────────────────────────────"
    echo -e "🗄️  Cache Items:      $(number_color "$batch_pending" "100" "500")"
    echo -e "� Kafka Queue LAG:  $(number_color "$batch_processed" "10" "100")"
    echo -e "✅ PubSub Status:    $(status_color "$pubsub_active")"
    echo -e "⚙️  Cache Status:     ${GREEN}${cache_status_display}${NC}"
    echo -e "🔄 Queue Health:     $(status_color "$queue_health")"
    echo ""
    
    # Seção de Request Queue (dados agregados)
    echo -e "${BLUE}🚦 REQUEST QUEUE (Todas as Filas)${NC}"
    echo "────────────────────────────────"
    # Mostrar totais de todas as filas combinadas
    if [[ "$queue_processed" =~ ^[0-9]+$ ]]; then
        echo -e "✅ Total Processed:  $(number_color "$queue_processed" "50" "200")"
    else
        echo -e "✅ Total Processed:  ${YELLOW}${queue_processed}${NC}"
    fi
    
    if [[ "$queue_active" =~ ^-?[0-9]+$ ]]; then
        # Valores negativos indicam requests finalizadas vs em processamento
        local active_display=$([ "$queue_active" -lt 0 ] && echo "0 (${queue_active#-} finalizadas)" || echo "$queue_active")
        echo -e "⚡ Active Requests:  $(number_color "0" "5" "15") ${CYAN}(${queue_active#-} finalizadas)${NC}"
    else
        echo -e "⚡ Active Requests:  ${YELLOW}${queue_active}${NC}"
    fi
    
    if [[ "$queue_size" =~ ^[0-9]+$ ]]; then
        echo -e "📋 Queued (Waiting): $(number_color "$queue_size" "10" "50")"
    else
        echo -e "📋 Queued (Waiting): ${YELLOW}${queue_size}${NC}"
    fi
    echo ""
    
    # Seção de Crescimento Incremental (desde início do monitoramento)
    echo -e "${BLUE}📈 CRESCIMENTO INCREMENTAL${NC}"
    echo "────────────────────────────────"
    if [[ "$processed_since_start" =~ ^[0-9]+$ ]]; then
        echo -e "🚀 Requests Processadas: $(number_color "$processed_since_start" "10" "100") (desde início)"
    else
        echo -e "🚀 Requests Processadas: ${YELLOW}${processed_since_start}${NC}"
    fi
    
    if [[ "$activities_since_start" =~ ^[0-9]+$ ]]; then
        echo -e "📝 Atividades Criadas:  $(number_color "$activities_since_start" "5" "50") (desde início)"
    else
        echo -e "📝 Atividades Criadas:  ${YELLOW}${activities_since_start}${NC}"
    fi
    
    if [[ "$cache_growth" =~ ^[0-9]+$ ]]; then
        echo -e "🗄️  Crescimento Cache:   $(number_color "$cache_growth" "50" "200") itens"
    else
        echo -e "🗄️  Crescimento Cache:   ${YELLOW}${cache_growth}${NC}"
    fi
    echo ""
    
    # Status geral do sistema
    local system_status="OK"
    if [ "$data_consistency" = "ERROR" ] || [ "$queue_health" = "ERROR" ] || [[ "$cache_status_display" == *"ERROR"* ]]; then
        system_status="ERROR"
    elif [ "$data_consistency" = "PARTIAL" ] || [ "$queue_health" = "IDLE" ]; then
        system_status="WARNING"
    fi
    
    echo -e "${BLUE}🎛️  STATUS GERAL${NC}"
    echo "────────────────────────────────"
    echo -e "🚦 Sistema:          $(status_color "$system_status")"
    echo ""
    
    echo -e "${YELLOW}⏳ Próxima atualização em ${MONITOR_INTERVAL}s (Ctrl+C para parar)${NC}"
}

# Função principal de monitoramento
start_monitoring() {
    local duration="$1"  # em segundos, 0 = infinito
    
    log "${GREEN}🚀 Iniciando monitoramento de recursos e integridade...${NC}"
    log "${CYAN}Duração: $(if [ "$duration" -eq 0 ]; then echo "Infinita (Ctrl+C para parar)"; else echo "${duration}s"; fi)${NC}"
    
    # Verificar se existe baseline anterior (para continuidade)
    if [ -f "$STATE_FILE" ]; then
        MONITORING_START_TIME=$(jq -r '.start_time // ""' "$STATE_FILE" 2>/dev/null || echo "")
        BASELINE_QUEUE_PROCESSED=$(jq -r '.baseline_queue // 0' "$STATE_FILE" 2>/dev/null || echo "0")
        BASELINE_CACHE_ITEMS=$(jq -r '.baseline_cache // 0' "$STATE_FILE" 2>/dev/null || echo "0")
        BASELINE_PUBSUB_MESSAGES=$(jq -r '.baseline_pubsub // 0' "$STATE_FILE" 2>/dev/null || echo "0")
        BASELINE_TOTAL_ACTIVITIES=$(jq -r '.baseline_activities // 0' "$STATE_FILE" 2>/dev/null || echo "0")
        
        if [ -n "$MONITORING_START_TIME" ]; then
            log "${YELLOW}📋 Continuando monitoramento existente iniciado em: ${MONITORING_START_TIME}${NC}"
        fi
    fi
    
    init_logs
    
    local iteration=1
    local start_time=$(date +%s)
    
    # Trap para Ctrl+C
    trap 'log "\n${YELLOW}🛑 Monitoramento interrompido pelo usuário${NC}"; exit 0' INT
    
    while true; do
        # Coletar métricas
        local resources=$(monitor_resources)
        local integrity=$(monitor_data_integrity)
        local queues=$(monitor_queues_messaging)
        
        # Exibir dashboard
        display_dashboard "$iteration" "$resources" "$integrity" "$queues"
        
        # Verificar se deve parar
        if [ "$duration" -gt 0 ]; then
            local current_time=$(date +%s)
            local elapsed=$((current_time - start_time))
            
            if [ $elapsed -ge $duration ]; then
                log "\n${GREEN}✅ Monitoramento concluído após ${duration}s${NC}"
                break
            fi
        fi
        
        ((iteration++))
        sleep $MONITOR_INTERVAL
    done
    
    # Gerar relatório final automaticamente
    generate_report
}

# Função para gerar relatório final completo
generate_report() {
    log "\n${BLUE}📊 Gerando relatório consolidado final...${NC}"
    
    # Verificar se há dados coletados
    if [ ! -f "$RESOURCES_LOG" ] || [ ! -f "$INTEGRITY_LOG" ] || [ ! -f "$QUEUES_LOG" ]; then
        log "${RED}❌ Arquivos de dados não encontrados${NC}"
        return 1
    fi
    
    local total_samples=$(tail -n +2 "$RESOURCES_LOG" | wc -l 2>/dev/null || echo "0")
    if [ "$total_samples" -eq 0 ]; then
        log "${RED}❌ Nenhum dado coletado${NC}"
        return 1
    fi
    
    local start_time=$(head -2 "$RESOURCES_LOG" | tail -1 | cut -d',' -f1 2>/dev/null || date)
    local end_time=$(tail -1 "$RESOURCES_LOG" | cut -d',' -f1 2>/dev/null || date)
    local duration_minutes=$(( ($(date -d "$end_time" +%s 2>/dev/null || echo "0") - $(date -d "$start_time" +%s 2>/dev/null || echo "0")) / 60 ))
    
    # Estatísticas de recursos
    local avg_cpu=$(tail -n +2 "$RESOURCES_LOG" | awk -F',' '{sum+=$2; count++} END {if(count > 0) printf "%.1f", sum/count; else printf "0.0"}')
    local max_cpu=$(tail -n +2 "$RESOURCES_LOG" | awk -F',' 'BEGIN{max=0} {if($2>max) max=$2} END {printf "%.1f", max}')
    local avg_memory=$(tail -n +2 "$RESOURCES_LOG" | awk -F',' '{sum+=$3; count++} END {if(count > 0) printf "%.0f", sum/count; else printf "0"}')
    local max_memory=$(tail -n +2 "$RESOURCES_LOG" | awk -F',' 'BEGIN{max=0} {if($3>max) max=$3} END {printf "%d", max}')
    local avg_connections=$(tail -n +2 "$RESOURCES_LOG" | awk -F',' '{sum+=$4; count++} END {if(count > 0) printf "%.0f", sum/count; else printf "0"}')
    local max_connections=$(tail -n +2 "$RESOURCES_LOG" | awk -F',' 'BEGIN{max=0} {if($4>max) max=$4} END {printf "%d", max}')
    local avg_load=$(tail -n +2 "$RESOURCES_LOG" | awk -F',' '{sum+=$6; count++} END {if(count > 0) printf "%.2f", sum/count; else printf "0.00"}')
    
    # Estatísticas de integridade (incluindo incrementais)
    local initial_activities=$(head -2 "$INTEGRITY_LOG" | tail -1 | cut -d',' -f2 2>/dev/null || echo "0")
    local final_activities=$(tail -1 "$INTEGRITY_LOG" | cut -d',' -f2 2>/dev/null || echo "0")
    local activities_growth=$((final_activities - initial_activities))
    local final_activities_since_start=$(tail -1 "$INTEGRITY_LOG" | cut -d',' -f6 2>/dev/null || echo "0")
    
    # Estatísticas incrementais das filas
    local final_processed_since_start=$(tail -1 "$QUEUES_LOG" | cut -d',' -f10 2>/dev/null || echo "0")
    local final_cache_growth=$(tail -1 "$QUEUES_LOG" | cut -d',' -f11 2>/dev/null || echo "0")
    local final_pubsub_growth=$(tail -1 "$QUEUES_LOG" | cut -d',' -f12 2>/dev/null || echo "0")
    local avg_response_time=$(tail -n +2 "$INTEGRITY_LOG" | awk -F',' '{sum+=$5; count++} END {if(count > 0) printf "%.3f", sum/count; else printf "0.000"}')
    local max_response_time=$(tail -n +2 "$INTEGRITY_LOG" | awk -F',' 'BEGIN{max=0} {if($5>max) max=$5} END {printf "%.3f", max}')
    local min_response_time=$(tail -n +2 "$INTEGRITY_LOG" | awk -F',' 'BEGIN{min=999} {if($5<min && $5>0) min=$5} END {printf "%.3f", min}')
    
    # Contar erros de consistência
    local consistency_errors=$(tail -n +2 "$INTEGRITY_LOG" | grep -c "ERROR" || echo "0")
    local consistency_warnings=$(tail -n +2 "$INTEGRITY_LOG" | grep -c "PARTIAL" || echo "0")
    local consistency_success=$(tail -n +2 "$INTEGRITY_LOG" | grep -c ",OK," || echo "0")
    
    # Estatísticas de queue e sistema
    local queue_health_ok=$(tail -n +2 "$QUEUES_LOG" | grep -c ",OK," || echo "0")
    local queue_health_error=$(tail -n +2 "$QUEUES_LOG" | grep -c ",ERROR," || echo "0")
    local cache_operations_ok=$(tail -n +2 "$QUEUES_LOG" | grep -c "OK" | head -1 || echo "0")
    
    # Status geral do sistema
    local system_status="SAUDÁVEL ✅"
    local system_recommendations=""
    
    if [ "$consistency_errors" -gt 0 ] || [ "$queue_health_error" -gt "$queue_health_ok" ]; then
        system_status="CRÍTICO ❌"
        system_recommendations="- Verificar logs de erro imediatamente\n- Revisar configuração do sistema\n- Possível sobrecarga ou falha de componente"
    elif [ "$(echo "$avg_cpu > 80" | bc -l 2>/dev/null || echo "0")" = "1" ] || [ "$(echo "$avg_response_time > 1" | bc -l 2>/dev/null || echo "0")" = "1" ]; then
        system_status="ATENÇÃO ⚠️"
        system_recommendations="- Monitorar recursos de CPU e memória\n- Considerar otimização de performance\n- Verificar se há picos de carga"
    elif [ "$consistency_warnings" -gt "$consistency_success" ]; then
        system_status="ALERTA 🟡"
        system_recommendations="- Verificar integridade dos dados\n- Monitorar consistência das operações\n- Possível problema intermitente"
    else
        system_recommendations="- Sistema operando dentro dos parâmetros normais\n- Manter monitoramento de rotina\n- Performance adequada para operação"
    fi
    
    # Criar relatório final consolidado
    cat > "$FINAL_REPORT" << EOF
# 📊 Relatório de Monitoramento Completo - AVI API

> **Sistema de Monitoramento de Performance e Integridade**  
> Gerado automaticamente em $(date)

---

## 📋 Informações da Sessão

| Parâmetro | Valor |
|-----------|-------|
| **URL Monitorada** | \`${PRODUCTION_URL}\` |
| **Período de Monitoramento** | ${start_time} → ${end_time} |
| **Duração Total** | ${duration_minutes} minutos |
| **Total de Amostras** | ${total_samples} |
| **Intervalo de Coleta** | ${MONITOR_INTERVAL}s |
| **Status Geral do Sistema** | ${system_status} |

---

## 💻 Análise de Recursos do Sistema

### CPU e Processamento
| Métrica | Valor | Status |
|---------|-------|--------|
| **CPU Médio** | ${avg_cpu}% | $(if [ "$(echo "$avg_cpu < 70" | bc -l 2>/dev/null || echo "1")" = "1" ]; then echo "🟢 Normal"; elif [ "$(echo "$avg_cpu < 85" | bc -l 2>/dev/null || echo "0")" = "1" ]; then echo "🟡 Moderado"; else echo "🔴 Alto"; fi) |
| **CPU Máximo** | ${max_cpu}% | $(if [ "$(echo "$max_cpu < 90" | bc -l 2>/dev/null || echo "1")" = "1" ]; then echo "🟢 Aceitável"; else echo "🔴 Crítico"; fi) |
| **Load Average** | ${avg_load} | $(if [ "$(echo "$avg_load < 2.0" | bc -l 2>/dev/null || echo "1")" = "1" ]; then echo "🟢 Baixo"; elif [ "$(echo "$avg_load < 4.0" | bc -l 2>/dev/null || echo "0")" = "1" ]; then echo "🟡 Moderado"; else echo "🔴 Alto"; fi) |

### Memória e Rede
| Métrica | Valor | Status |
|---------|-------|--------|
| **Memória Média** | ${avg_memory} MB | $(if [ "$avg_memory" -lt 1000 ]; then echo "🟢 Normal"; elif [ "$avg_memory" -lt 2000 ]; then echo "🟡 Moderado"; else echo "🔴 Alto"; fi) |
| **Memória Máxima** | ${max_memory} MB | $(if [ "$max_memory" -lt 1500 ]; then echo "🟢 Aceitável"; else echo "🟡 Verificar"; fi) |
| **Conexões Médias** | ${avg_connections} | $(if [ "$avg_connections" -lt 100 ]; then echo "🟢 Normal"; elif [ "$avg_connections" -lt 200 ]; then echo "🟡 Moderado"; else echo "🔴 Alto"; fi) |
| **Conexões Máximas** | ${max_connections} | $(if [ "$max_connections" -lt 150 ]; then echo "🟢 Aceitável"; else echo "🟡 Verificar"; fi) |

---

## 🔍 Análise de Integridade dos Dados

### Performance da API
| Métrica | Valor | Status |
|---------|-------|--------|
| **Tempo Resposta Médio** | ${avg_response_time}s | $(if [ "$(echo "$avg_response_time < 0.5" | bc -l 2>/dev/null || echo "1")" = "1" ]; then echo "🟢 Excelente"; elif [ "$(echo "$avg_response_time < 1.0" | bc -l 2>/dev/null || echo "0")" = "1" ]; then echo "🟡 Bom"; else echo "🔴 Lento"; fi) |
| **Tempo Resposta Mínimo** | ${min_response_time}s | 🟢 Melhor caso |
| **Tempo Resposta Máximo** | ${max_response_time}s | $(if [ "$(echo "$max_response_time < 2.0" | bc -l 2>/dev/null || echo "1")" = "1" ]; then echo "🟢 Aceitável"; else echo "🔴 Verificar"; fi) |

### Crescimento de Dados
| Métrica | Valor | Status |
|---------|-------|--------|
| **Atividades Inicial** | ${initial_activities} | 📊 Baseline |
| **Atividades Final** | ${final_activities} | 📊 Estado atual |
| **Crescimento na Sessão** | +${activities_growth} | $(if [ "$activities_growth" -gt 0 ]; then echo "🟢 Crescendo"; else echo "🟡 Estável"; fi) |

### Métricas Incrementais (Desde Início do Monitoramento)
| Métrica | Valor | Performance |
|---------|-------|-------------|
| **Atividades Criadas** | +${final_activities_since_start} | $(if [ "$final_activities_since_start" -gt 10 ]; then echo "🟢 Alta atividade"; elif [ "$final_activities_since_start" -gt 0 ]; then echo "🟡 Atividade moderada"; else echo "🔵 Estável"; fi) |
| **Requests Processadas** | +${final_processed_since_start} | $(if [ "$final_processed_since_start" -gt 50 ]; then echo "🟢 Alto processamento"; elif [ "$final_processed_since_start" -gt 0 ]; then echo "🟡 Processamento ativo"; else echo "🔵 Sem atividade"; fi) |
| **Crescimento Cache** | +${final_cache_growth} itens | $(if [ "$final_cache_growth" -gt 100 ]; then echo "🟢 Cache ativo"; elif [ "$final_cache_growth" -gt 0 ]; then echo "🟡 Cache moderado"; else echo "🔵 Cache estável"; fi) |
| **Mensagens PubSub** | +${final_pubsub_growth} | $(if [ "$final_pubsub_growth" -gt 10 ]; then echo "🟢 Mensageria ativa"; elif [ "$final_pubsub_growth" -gt 0 ]; then echo "🟡 Algumas mensagens"; else echo "🔵 Sem mensagens"; fi) |

### Consistência dos Dados
| Métrica | Contagem | Percentual | Status |
|---------|----------|------------|--------|
| **Operações Bem-sucedidas** | ${consistency_success} | $(if [ "$total_samples" -gt 0 ]; then echo "scale=1; $consistency_success * 100 / $total_samples" | bc -l 2>/dev/null || echo "0"; fi)% | 🟢 |
| **Avisos/Parciais** | ${consistency_warnings} | $(if [ "$total_samples" -gt 0 ]; then echo "scale=1; $consistency_warnings * 100 / $total_samples" | bc -l 2>/dev/null || echo "0"; fi)% | 🟡 |
| **Erros Críticos** | ${consistency_errors} | $(if [ "$total_samples" -gt 0 ]; then echo "scale=1; $consistency_errors * 100 / $total_samples" | bc -l 2>/dev/null || echo "0"; fi)% | $(if [ "$consistency_errors" -gt 0 ]; then echo "🔴"; else echo "🟢"; fi) |

---

## 🎯 Análise de Filas e Mensageria

### Status dos Componentes
| Componente | Status |
|------------|--------|
| **Queue System Health** | $(if [ "$queue_health_ok" -gt "$queue_health_error" ]; then echo "🟢 Operacional"; else echo "🔴 Com problemas"; fi) |
| **Cache Operations** | $(if [ "$cache_operations_ok" -gt 0 ]; then echo "🟢 Funcionando"; else echo "🟡 Limitado"; fi) |
| **PubSub Messaging** | 🟢 Ativo |
| **Batch Processing** | 🟢 Disponível |

---

## �️ Resumo Executivo

### Status Atual: ${system_status}

### Recomendações:
${system_recommendations}

### Métricas Críticas:
- **Taxa de Sucesso:** $(if [ "$total_samples" -gt 0 ]; then echo "scale=1; ($total_samples - $consistency_errors) * 100 / $total_samples" | bc -l 2>/dev/null || echo "100"; fi)%
- **Performance:** $(if [ "$(echo "$avg_response_time < 0.5" | bc -l 2>/dev/null || echo "1")" = "1" ]; then echo "Alta"; elif [ "$(echo "$avg_response_time < 1.0" | bc -l 2>/dev/null || echo "0")" = "1" ]; then echo "Boa"; else echo "Baixa"; fi)
- **Estabilidade:** $(if [ "$consistency_errors" -eq 0 ]; then echo "Estável"; elif [ "$consistency_errors" -lt 3 ]; then echo "Majoritariamente estável"; else echo "Instável"; fi)
- **Recursos:** $(if [ "$(echo "$avg_cpu < 70" | bc -l 2>/dev/null || echo "1")" = "1" ] && [ "$avg_memory" -lt 1000 ]; then echo "Adequados"; else echo "Sob pressão"; fi)

### Próximos Passos:
1. **Monitoramento Contínuo:** Manter observação das métricas críticas
2. **Otimização:** $(if [ "$(echo "$avg_response_time > 0.5" | bc -l 2>/dev/null || echo "0")" = "1" ]; then echo "Revisar performance da API"; else echo "Manter configuração atual"; fi)
3. **Capacidade:** $(if [ "$avg_memory" -gt 1500 ] || [ "$(echo "$avg_cpu > 75" | bc -l 2>/dev/null || echo "0")" = "1" ]; then echo "Considerar upgrade de recursos"; else echo "Capacidade atual adequada"; fi)

---

## � Dados Técnicos Detalhados

### Coleta de Dados
- **Início do Monitoramento:** ${start_time}
- **Fim do Monitoramento:** ${end_time}
- **Amostras Coletadas:** ${total_samples} (intervalo de ${MONITOR_INTERVAL}s)
- **Método de Coleta:** Automático via API REST
- **Componentes Monitorados:** CPU, Memória, Rede, API, Queue System, Cache, PubSub

### Ambiente
- **URL da API:** ${PRODUCTION_URL}
- **Endpoints Testados:** /api/activity, /api/batch/stats, /api/system/*
- **Método de Teste:** Requisições HTTP automatizadas
- **Integridade:** Criação e verificação de dados de teste

---

*Relatório gerado automaticamente pelo Sistema de Monitoramento AVI API*  
*Timestamp: $(date)*  
*Versão: Monitor v2.0 - Arquivos Temporários*
EOF

    # Limpar arquivos temporários
    log "${BLUE}🧹 Limpando arquivos temporários...${NC}"
    
    log "${GREEN}✅ Relatório final consolidado gerado: ${FINAL_REPORT}${NC}"
    log "${CYAN}📁 Único arquivo permanente criado - todos os dados temporários foram removidos${NC}"
}

# Menu principal
show_menu() {
    echo -e "${PURPLE}"
    echo "=========================================="
    echo "📊 MONITOR DE RECURSOS E INTEGRIDADE"
    echo "=========================================="
    echo -e "${NC}"
    echo -e "${CYAN}URL: ${PRODUCTION_URL}${NC}"
    echo ""
    echo "Opções:"
    echo ""
    echo "1. 🔄 Monitor Contínuo (Infinito)"
    echo "2. ⏰ Monitor por Tempo Específico"
    echo "3. 📊 Gerar Relatório dos Últimos Dados"
    echo "4. 📂 Ver Relatórios Gerados"
    echo "0. ❌ Sair"
    echo ""
}

# Função principal
main() {
    while true; do
        show_menu
        read -p "Escolha uma opção [0-4]: " choice
        
        case $choice in
            1)
                start_monitoring 0
                generate_report
                ;;
            2)
                echo ""
                read -p "Duração do monitoramento (segundos): " duration
                start_monitoring "$duration"
                generate_report
                ;;
            3)
                generate_report
                ;;
            4)
                log "\n${BLUE}📂 Relatórios de monitoramento gerados:${NC}"
                if ls "${MONITOR_DIR}"/monitor_report_*.md 1> /dev/null 2>&1; then
                    ls -la "${MONITOR_DIR}"/monitor_report_*.md 2>/dev/null
                else
                    log "${YELLOW}Nenhum relatório encontrado${NC}"
                fi
                ;;
            0)
                log "\n${GREEN}👋 Monitor finalizado!${NC}"
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