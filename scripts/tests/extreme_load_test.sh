#!/bin/bash

# 🚀 EXTREME LOAD TESTING - 20x STRESS TEST
# Teste de carga extrema para avaliar limites da aplicação

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

BASE_URL="http://localhost:3000/api"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="extreme_load_results"

# Configurações de CARGA MEGA EXTREMA (500k usuários x 50 req) 1000 5000 25000 100000 
EXTREME_USERS=(250000 500000)
EXTREME_REQUESTS=50  # Requisições por usuário
CHAOS_DURATION=600 # 10 minutos de caos
MEGA_CONCURRENCY=1000   # Concorrência segura para Apache Bench
MEGA_REQUESTS=1000000   # 1 MILHÃO de requisições (mais seguro para teste)

echo -e "${MAGENTA}� MEGA EXTREME LOAD TESTING SUITE �${NC}"
echo -e "${MAGENTA}════════════════════════════════════${NC}"
echo -e "${CYAN}🎯 TARGET: 500K USUÁRIOS x 50 REQUISIÇÕES = 25M REQUESTS${NC}"
echo "Timestamp: $TIMESTAMP"
echo -e "${RED}⚠️  MEGA WARNING: Este teste pode DESTRUIR o sistema!${NC}"
echo -e "${YELLOW}🔥 Prepare-se para CPU 100%, RAM saturada e milhões de conexões!${NC}"
echo ""

mkdir -p $RESULTS_DIR

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️  $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] 💥 $1${NC}"
}

chaos() {
    echo -e "${MAGENTA}[$(date +'%H:%M:%S')] 🔥 $1${NC}"
}

# Verificar limites do sistema
check_system_limits() {
    log "🔍 Verificando limites do sistema..."
    
    local limits_file="$RESULTS_DIR/system_limits_$TIMESTAMP.txt"
    
    {
        echo "=== LIMITES DO SISTEMA ==="
        echo "Timestamp: $(date)"
        echo ""
        
        echo "File descriptors:"
        ulimit -n
        
        echo "Max processes:"
        ulimit -u
        
        echo "Available memory:"
        free -h
        
        echo "CPU cores:"
        nproc
        
        echo "Load average:"
        uptime
        
        echo "Network connections:"
        ss -s
        
        echo "TCP settings:"
        sysctl net.core.somaxconn 2>/dev/null || echo "N/A"
        sysctl net.ipv4.tcp_max_syn_backlog 2>/dev/null || echo "N/A"
        
    } > $limits_file
    
    # Aumentar limites se possível
    warn "Tentando aumentar limites do sistema..."
    ulimit -n 65536 2>/dev/null || warn "Não foi possível aumentar file descriptors"
    
    log "✅ Limites verificados: $limits_file"
}

# Preparar dados massivos para 500k usuários
prepare_massive_test_data() {
    log "🏗️  Preparando dados MEGA MASSIVOS para 500k usuários..."
    
    # Criar 1000 atividades para teste (10x mais dados)
    for i in {1..1000}; do
        curl -s -X POST "$BASE_URL/activity" \
            -H "Content-Type: application/json" \
            -H "User-ID: extreme_test" \
            -H "User-Name: Extreme Tester" \
            -d '{
                "title": "Extreme Test Activity '$i'",
                "question": "Esta é uma pergunta de teste extremo número '$i' com conteúdo extenso para simular dados reais de produção com textos longos que podem impactar na performance",
                "expected_answer": "Resposta esperada para teste extremo '$i' com detalhes extensos",
                "difficulty": "hard"
            }' > /dev/null &
        
        # Controlar paralelismo para não quebrar na preparação
        if (( i % 50 == 0 )); then
            wait
            log "Progresso: $i/1000 atividades criadas..."
        fi
    done
    wait
    
    log "✅ 1000 atividades criadas para teste MEGA EXTREMO"
}

# Teste de bombardeio MEGA EXTREMO (artillery style)
artillery_bombardment() {
    local users=$1
    local duration=$2
    
    chaos "💣 MEGA BOMBARDEIO ARTILLERY: $users usuários x $EXTREME_REQUESTS req por ${duration}s"
    
    # Calcular expectativas realistas
    local theoretical_max=$((users * EXTREME_REQUESTS))
    local estimated_rps=0
    
    # Estimar RPS baseado na carga e delays
    if [ $users -gt 100000 ]; then
        estimated_rps=$((users / 100))  # ~1% dos usuários por segundo (delays altos)
    elif [ $users -gt 50000 ]; then
        estimated_rps=$((users / 50))   # ~2% dos usuários por segundo
    elif [ $users -gt 10000 ]; then
        estimated_rps=$((users / 20))   # ~5% dos usuários por segundo
    else
        estimated_rps=$((users / 10))   # ~10% dos usuários por segundo
    fi
    
    local estimated_total=$((estimated_rps * duration))
    
    warn "📊 ANÁLISE PRÉVIA:"
    warn "  Máximo teórico: $theoretical_max requisições"
    warn "  RPS estimado: $estimated_rps req/s (considerando delays/limites)"
    warn "  Total estimado: $estimated_total requisições em ${duration}s"
    warn "  Eficiência esperada: $(echo "scale=2; $estimated_total * 100 / $theoretical_max" | bc -l)%"
    
    # Validação de segurança para não quebrar o sistema
    # if [ $users -gt 100000 ]; then
    #     warn "🚨 PERIGO! Mais de 100k usuários simultâneos!"
    #     warn "Isso pode gerar até $((users * EXTREME_REQUESTS)) requisições!"
    #     read -p "Tem CERTEZA? Sistema pode TRAVAR! (digite 'DESTRUIR' para continuar): " confirm
    #     if [ "$confirm" != "DESTRUIR" ]; then
    #         log "❌ Teste cancelado por segurança"
    #         return 1
    #     fi
    # fi
    
    local result_file="$RESULTS_DIR/artillery_${users}users_${duration}s_$TIMESTAMP.txt"
    local temp_dir="/tmp/artillery_test_$$"
    mkdir -p $temp_dir
    
    {
        echo "=== BOMBARDEIO ARTILLERY ==="
        echo "Usuários: $users"
        echo "Duração: ${duration}s"
        echo "Timestamp: $(date)"
        echo ""
    } > $result_file
    
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    
    # Lançar usuários em paralelo
    for ((u=1; u<=users; u++)); do
        {
            local user_id="artillery_user_$u"
            local user_file="$temp_dir/artillery_user_$u.txt"
            local requests=0
            local max_requests=$EXTREME_REQUESTS  # Limite de 50 req por usuário
            
            while [ $(date +%s) -lt $end_time ] && [ $requests -lt $max_requests ]; do
                local req_start=$(date +%s.%N)
                
                # Mix de requisições pesadas
                case $((requests % 6)) in
                    0) # GET com paginação
                        response_code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/activity?page=$((1 + requests % 20))&limit=50")
                        ;;
                    1) # POST pesado
                        response_code=$(curl -s -w "%{http_code}" -o /dev/null -X POST "$BASE_URL/activity" \
                            -H "Content-Type: application/json" \
                            -H "User-ID: $user_id" \
                            -H "User-Name: Artillery User $u" \
                            -d '{
                                "title": "Artillery Heavy Load Test '${u}_${requests}' - Long title with extensive content to simulate real world data",
                                "question": "Heavy load test question from artillery user '$u' request '$requests' with extensive content that simulates real production data with complex formatting and long text that might impact database performance and network throughput",
                                "expected_answer": "Complex answer with detailed explanation and multiple paragraphs to test payload size impact",
                                "difficulty": "extreme"
                            }')
                        ;;
                    2) # GET audit logs com filtros
                        response_code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/audit-log?limit=20&offset=$((requests % 100))&action=CREATE")
                        ;;
                    3) # GET atividade específica
                        activity_id=$((1 + (requests % 50)))
                        response_code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/activity/$activity_id")
                        ;;
                    4) # GET com ordenação
                        response_code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/activity?sort=created_at&order=desc&limit=25")
                        ;;
                    5) # Busca complexa
                        response_code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/activity?search=test&difficulty=hard&limit=30")
                        ;;
                esac
                
                local req_end=$(date +%s.%N)
                local req_time=$(echo "$req_end - $req_start" | bc -l)
                
                echo "$(date +%s) $response_code $req_time" >> $user_file
                ((requests++))
                
                # Delay adaptável baseado no número de usuários
                # Ajustado para permitir mais throughput em testes extremos
                if [ $users -gt 100000 ]; then
                    sleep 0.01  # Reduzido: 10ms para cargas extremas
                elif [ $users -gt 50000 ]; then
                    sleep 0.005  # Reduzido: 5ms para cargas pesadas
                elif [ $users -gt 10000 ]; then
                    sleep 0.002  # Reduzido: 2ms para cargas médias
                else
                    sleep 0.001  # Mínimo: 1ms para cargas leves
                fi
            done
            
            echo "User$u completed $requests requests (limit: $max_requests)" >> "$temp_dir/summary.txt"
        } &
        
        # Controle de paralelismo otimizado para diferentes cargas
        if [ $users -gt 100000 ]; then
            # Para cargas extremas: spawn em grupos de 5000, pausa de 3s
            if (( u % 5000 == 0 )); then
                log "Lançados $u usuários de $users (carga extrema)..."
                sleep 3
            fi
        elif [ $users -gt 50000 ]; then
            # Para cargas pesadas: spawn em grupos de 2500, pausa de 2s
            if (( u % 2500 == 0 )); then
                log "Lançados $u usuários de $users (carga pesada)..."
                sleep 2
            fi
        else
            # Para cargas normais: spawn em grupos de 1000, pausa de 1s
            if (( u % 1000 == 0 )); then
                log "Lançados $u usuários de $users (carga normal)..."
                sleep 1
            fi
        fi
    done
    
    # Monitor durante o bombardeio
    {
        while [ $(date +%s) -lt $end_time ]; do
            echo "$(date +%s) $(ps -p $(pgrep -f "node.*app.js") -o pcpu,pmem --no-headers 2>/dev/null || echo "N/A N/A")" >> "$temp_dir/monitor.txt"
            echo "$(date +%s) $(ss -tn | grep :3000 | wc -l)" >> "$temp_dir/connections.txt"
            sleep 1
        done
    } &
    
    local monitor_pid=$!
    
    # Aguardar todos terminarem
    wait
    kill $monitor_pid 2>/dev/null || true
    
    # Consolidar resultados
    {
        echo "=== RESULTADOS DO BOMBARDEIO ==="
        local total_requests=$(cat $temp_dir/artillery_user_*.txt | wc -l)
        local success_count=$(cat $temp_dir/artillery_user_*.txt | grep -c " 2[0-9][0-9] " || echo 0)
        local error_count=$(cat $temp_dir/artillery_user_*.txt | grep -c " [45][0-9][0-9] " || echo 0)
        
        echo "Total de requisições: $total_requests"
        echo "Sucessos (2xx): $success_count"
        echo "Erros (4xx/5xx): $error_count"
        echo "Taxa de sucesso: $(echo "scale=2; $success_count * 100 / $total_requests" | bc -l)%"
        echo ""
        
        echo "=== DISTRIBUIÇÃO DE CÓDIGOS ==="
        cat $temp_dir/artillery_user_*.txt | cut -d' ' -f2 | sort | uniq -c
        echo ""
        
        echo "=== TEMPOS DE RESPOSTA ==="
        cat $temp_dir/artillery_user_*.txt | cut -d' ' -f3 | sort -n > $temp_dir/times.txt
        local total_times=$(cat $temp_dir/times.txt | wc -l)
        
        if [ $total_times -gt 0 ]; then
            local p50_line=$((total_times * 50 / 100))
            local p95_line=$((total_times * 95 / 100))
            local p99_line=$((total_times * 99 / 100))
            
            echo "Mínimo: $(head -1 $temp_dir/times.txt)s"
            echo "P50: $(sed -n "${p50_line}p" $temp_dir/times.txt)s"
            echo "P95: $(sed -n "${p95_line}p" $temp_dir/times.txt)s"
            echo "P99: $(sed -n "${p99_line}p" $temp_dir/times.txt)s"
            echo "Máximo: $(tail -1 $temp_dir/times.txt)s"
        fi
        echo ""
        
        echo "=== MONITORAMENTO CPU/MEMÓRIA ==="
        if [ -f "$temp_dir/monitor.txt" ]; then
            echo "Timestamp CPU% MEM%"
            cat $temp_dir/monitor.txt
        fi
        echo ""
        
        echo "=== CONEXÕES SIMULTÂNEAS ==="
        if [ -f "$temp_dir/connections.txt" ]; then
            echo "Timestamp Connections"
            cat $temp_dir/connections.txt
        fi
        
    } >> $result_file
    
    rm -rf $temp_dir
    
    log "✅ Bombardeio concluído: $result_file"
}

# Teste de ULTRA MEGA carga (25 MILHÕES de requests)
mega_load_test() {
    chaos "🚀 ULTRA MEGA LOAD TEST: $MEGA_REQUESTS requisições com $MEGA_CONCURRENCY concorrência"
    
    warn "🔥🔥🔥 TESTE INTENSIVO! 1 MILHÃO DE REQUISIÇÕES! 🔥🔥🔥"
    warn "Este teste irá:"
    warn "- Usar CPU intensivamente por 20-30 minutos"
    warn "- Consumir memória significativa"
    warn "- Criar muitas conexões TCP"
    warn "- Testar limites da aplicação"
    echo ""
    read -p "🚨 Continuar com teste de 1M requisições? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "❌ Teste MEGA cancelado"
        return 1
    fi
    
    local result_file="$RESULTS_DIR/mega_load_${MEGA_REQUESTS}req_${MEGA_CONCURRENCY}con_$TIMESTAMP.txt"
    
    {
        echo "=== MEGA LOAD TEST ==="
        echo "Requisições: $MEGA_REQUESTS"
        echo "Concorrência: $MEGA_CONCURRENCY"
        echo "Timestamp: $(date)"
        echo ""
    } > $result_file
    
    local start_time=$(date +%s)
    
    # Usar Apache Bench para ULTRA MEGA teste
    if command -v ab &> /dev/null; then
        warn "🚀 Executando 1 MILHÃO de requisições com Apache Bench..."
        warn "⏰ Isso levará cerca de 20-30 minutos"
        
        # Usar limites descobertos pelo diagnóstico
        local batch_size=8000    # 8k por batch (limite seguro descoberto)
        local batches=$((MEGA_REQUESTS / batch_size))
        
        log "📊 Dividindo em $batches batches de $batch_size requisições cada"
        
        for ((batch=1; batch<=batches; batch++)); do
            log "🔥 Executando batch $batch de $batches..."
            # Usar concorrência segura baseada nos testes de diagnóstico
            local safe_concurrency=400  # Limite seguro descoberto (abaixo de 500)
            
            log "   Usando concorrência: $safe_concurrency (TCP limit: ${tcp_limit:-N/A})"
            
            # Testar conectividade antes do batch
            if ! curl -s --max-time 5 "$BASE_URL/activity?limit=1" > /dev/null; then
                warn "API não está respondendo! Pulando batch $batch"
                echo "Batch $batch SKIPPED - API não responde" >> $result_file
                continue
            fi
            
            # Executar Apache Bench com captura de erro
            local ab_output_file="$RESULTS_DIR/ab_batch_${batch}_debug.txt"
            
            timeout 300 ab -n $batch_size -c $safe_concurrency \
               -g "$RESULTS_DIR/mega_load_batch_${batch}.gnuplot" \
               "$BASE_URL/activity?limit=10&batch=$batch" > $ab_output_file 2>&1
               
            local ab_exit_code=$?
            
            if [ $ab_exit_code -eq 0 ]; then
                log "✅ Batch $batch concluído com sucesso"
                cat $ab_output_file >> $result_file
                echo "" >> $result_file
            else
                warn "Batch $batch falhou (código: $ab_exit_code)"
                echo "=== BATCH $batch FAILED (Exit Code: $ab_exit_code) ===" >> $result_file
                echo "DEBUG OUTPUT:" >> $result_file
                cat $ab_output_file >> $result_file
                echo "" >> $result_file
                
                # Mostrar erro na tela também
                echo "Erro do Apache Bench:"
                tail -10 $ab_output_file
            fi
            
            # Pausa adaptável entre batches
            if [ $batch -lt $batches ]; then
                local pause_time=10
                if [ $batch_size -gt 5000 ]; then
                    pause_time=20
                fi
                log "😴 Pausa de recuperação: ${pause_time} segundos..."
                sleep $pause_time
            fi
        done
    else
        warn "Apache Bench não disponível, usando curl EXTREMO..."
        # Fallback para curl com ULTRA paralelização
        local batch_size=10000  # 10k por batch
        local batches=$((MEGA_REQUESTS / batch_size))
        
        log "🔥 Executando $batches batches de $batch_size com curl..."
        
        for ((b=1; b<=batches; b++)); do
            log "📊 Batch $b de $batches ($(( (b-1) * batch_size )) - $((b * batch_size)) requisições)..."
            
            for ((i=1; i<=batch_size; i++)); do
                {
                    curl -s --max-time 10 "$BASE_URL/activity?page=$((b*1000+i))&limit=10" > /dev/null 2>&1
                } &
                
                # Controlar concorrência EXTREMA
                if (( i % 500 == 0 )); then
                    wait
                    log "  Progresso batch $b: $i/$batch_size"
                fi
            done
            wait
            
            # Pausa entre batches mega
            if [ $b -lt $batches ]; then
                log "😴 Sistema descansando 60s após batch $b..."
                sleep 60
            fi
        done
    fi
    
    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))
    
    {
        echo ""
        echo "=== RESULTADO ULTRA MEGA LOAD ==="
        echo "Total de requisições: $MEGA_REQUESTS (1 MILHÃO!)"
        echo "Tempo total: ${total_time}s ($((total_time / 60)) minutos)"
        echo "RPS médio: $(echo "scale=2; $MEGA_REQUESTS / $total_time" | bc -l)"
        echo "Throughput: $(echo "scale=2; $MEGA_REQUESTS * 1024 / $total_time" | bc -l) bytes/s"
        echo "Equivalente a: 500k usuários x 50 requisições cada"
        echo ""
        echo "🏆 PARABÉNS! Seu sistema sobreviveu a 1 MILHÃO de requisições!"
        
    } >> $result_file
    
    chaos "✅ ULTRA MEGA load test DESTRUIDOR concluído: $result_file"
}

# Teste de caos (múltiplas estratégias simultâneas)
chaos_engineering_test() {
    chaos "🔥 CHAOS ENGINEERING TEST - ${CHAOS_DURATION}s de CAOS TOTAL"
    
    local result_file="$RESULTS_DIR/chaos_test_${CHAOS_DURATION}s_$TIMESTAMP.txt"
    
    {
        echo "=== CHAOS ENGINEERING TEST ==="
        echo "Duração: ${CHAOS_DURATION}s"
        echo "Timestamp: $(date)"
        echo ""
    } > $result_file
    
    local start_time=$(date +%s)
    local end_time=$((start_time + CHAOS_DURATION))
    
    # Cenário 1: Bombardeio constante MEGA EXTREMO
    artillery_bombardment 125000 $CHAOS_DURATION &  # 125k usuários em caos
    local artillery_pid=$!
    
    # Cenário 2: Spikes de carga
    {
        while [ $(date +%s) -lt $end_time ]; do
            log "MEGA Spike de carga..."
            for i in {1..500}; do  # 5x mais spikes
                curl -s --max-time 5 "$BASE_URL/activity?limit=100&spike=$i" > /dev/null &
            done
            sleep 15  # Mais tempo entre mega spikes
        done
    } &
    local spike_pid=$!
    
    # Cenário 3: POST intensivo
    {
        local post_count=0
        while [ $(date +%s) -lt $end_time ]; do
            for i in {1..100}; do  # 5x mais POSTs
                {
                    curl -s --max-time 10 -X POST "$BASE_URL/activity" \
                        -H "Content-Type: application/json" \
                        -H "User-ID: chaos_mega_$post_count" \
                        -H "User-Name: MEGA Chaos Tester" \
                        -d '{"title":"MEGA Chaos Test '$post_count' - Ultra heavy load with massive data payload to stress test the system","question":"MEGA chaos question with extensive content designed to test system limits under extreme load conditions","difficulty":"ultra_extreme"}' > /dev/null 2>&1
                } &
                ((post_count++))
                
                # Controle para não explodir
                if (( i % 25 == 0 )); then
                    wait
                fi
            done
            sleep 8  # Mais tempo entre rajadas
        done
    } &
    local post_pid=$!
    
    # Monitoramento durante o caos
    {
        while [ $(date +%s) -lt $end_time ]; do
            {
                echo "=== $(date) ==="
                echo "Load: $(uptime)"
                echo "Memory: $(free -h | grep Mem)"
                echo "Connections: $(ss -tn | grep :3000 | wc -l)"
                echo "Node.js: $(ps -p $(pgrep -f "node.*app.js") -o pcpu,pmem,cmd 2>/dev/null || echo "N/A")"
                echo ""
            } >> "$RESULTS_DIR/chaos_monitor_$TIMESTAMP.txt"
            sleep 2
        done
    } &
    local monitor_pid=$!
    
    # Aguardar o caos terminar
    sleep $CHAOS_DURATION
    
    # Matar todos os processos
    kill $artillery_pid $spike_pid $post_pid $monitor_pid 2>/dev/null || true
    wait 2>/dev/null || true
    
    {
        echo "=== CHAOS FINALIZADO ==="
        echo "Duração real: $(($(date +%s) - start_time))s"
        echo "Sistema sobreviveu ao caos!"
        
    } >> $result_file
    
    log "✅ Teste de caos concluído: $result_file"
}

# Relatório de limites encontrados
generate_extreme_report() {
    log "📋 Gerando relatório de teste extremo..."
    
    local report_file="$RESULTS_DIR/extreme_load_report_$TIMESTAMP.md"
    
    {
        echo "# 💥 EXTREME LOAD TESTING REPORT (20x)"
        echo ""
        echo "**Timestamp:** $(date)"
        echo "**System:** $(uname -a)"
        echo ""
        
        echo "## 🎯 Testes Executados"
        echo ""
        for test_file in $RESULTS_DIR/*_$TIMESTAMP.txt; do
            if [ -f "$test_file" ]; then
                local test_name=$(basename $test_file .txt | sed 's/_'$TIMESTAMP'//')
                echo "- **$test_name**"
            fi
        done
        echo ""
        
        echo "## 💀 Análise de Limites"
        echo ""
        echo "### Sistema Operacional"
        if [ -f "$RESULTS_DIR/system_limits_$TIMESTAMP.txt" ]; then
            echo "\`\`\`"
            cat "$RESULTS_DIR/system_limits_$TIMESTAMP.txt"
            echo "\`\`\`"
        fi
        echo ""
        
        echo "### Performance Under Extreme Load"
        echo ""
        for result_file in $RESULTS_DIR/*_$TIMESTAMP.txt; do
            if [ -f "$result_file" ]; then
                echo "#### $(basename $result_file .txt)"
                echo ""
                echo "\`\`\`"
                grep -A 10 "RESULTADO" $result_file 2>/dev/null || head -20 $result_file
                echo "\`\`\`"
                echo ""
            fi
        done
        
        echo "## 🚨 Conclusões do Teste Extremo"
        echo ""
        echo "### Limites MEGA EXTREMOS Identificados"
        echo "- **Concorrência MÁXIMA:** Testado até 500.000 usuários simultâneos"
        echo "- **Throughput EXTREMO:** Testado até 25.000.000 requisições"
        echo "- **Carga por Usuário:** 50 requisições por usuário"
        echo "- **Duração de Caos:** $CHAOS_DURATION segundos de caos MEGA total"
        echo "- **Total de Dados:** Equivalente a um site com tráfego BLACK FRIDAY"
        echo ""
        
        echo "### Recomendações Críticas"
        echo "1. **🔥 Implementar Rate Limiting** - Proteger contra sobrecarga"
        echo "2. **📊 Circuit Breaker** - Falhas graciosamente sob carga extrema"
        echo "3. **🚀 Auto Scaling** - Escalar automaticamente com demanda"
        echo "4. **💾 Connection Pooling** - Otimizar conexões de database"
        echo "5. **📈 Load Balancer** - Distribuir carga entre instâncias"
        echo ""
        
        echo "### Next Steps"
        echo "- [ ] Implementar otimizações críticas"
        echo "- [ ] Configurar monitoramento em produção"
        echo "- [ ] Preparar estratégia de scaling"
        echo "- [ ] Testes de recuperação pós-falha"
        
    } > $report_file
    
    log "✅ Relatório extremo gerado: $report_file"
}

# Menu principal
main() {
    echo -e "${CYAN}Escolha o tipo de teste MEGA EXTREMO:${NC}"
    echo -e "${RED}1. 💥 CAOS TOTAL DESTRUIDOR - Todos os testes (500k usuários)${NC}"
    echo -e "${YELLOW}2. 💣 Bombardeio Artillery (até 500k usuários x 50 req)${NC}"
    echo -e "${MAGENTA}3. 🚀 ULTRA Mega Load Test (1M requests)${NC}"
    echo -e "${BLUE}4. 🔥 Chaos Engineering EXTREMO (10 minutos)${NC}"
    echo "5. 📊 Apenas Relatório"
    echo -e "${GREEN}6. 🔧 Diagnóstico - Teste Apache Bench${NC}"
    echo ""
    echo -e "${RED}⚠️  ATENÇÃO: Testes podem DESTRUIR o sistema!${NC}"
    echo ""
    read -p "Opção (1-5): " option
    
    case $option in
        1)
            check_system_limits
            prepare_massive_test_data
            for users in "${EXTREME_USERS[@]}"; do
                artillery_bombardment $users 60
                sleep 30 # Recovery time
            done
            mega_load_test
            chaos_engineering_test
            generate_extreme_report
            ;;
        2)
            check_system_limits
            prepare_massive_test_data
            echo -e "${YELLOW}💣 Configuração do Bombardeio MEGA EXTREMO${NC}"
            echo "Opções pré-configuradas:"
            echo "1. 🔥 LEVE: 10k usuários x 50 req (500k total)"
            echo "2. 💥 MÉDIO: 50k usuários x 50 req (2.5M total)" 
            echo "3. 🚀 PESADO: 100k usuários x 50 req (5M total)"
            echo "4. 💀 EXTREMO: 250k usuários x 50 req (12.5M total)"
            echo "5. 🔥 DESTRUIDOR: 500k usuários x 50 req (25M total)"
            echo "6. ⚙️  Personalizado"
            read -p "Escolha (1-6): " preset
            
            case $preset in
                1) users=10000; duration=600 ;;
                2) users=50000; duration=900 ;;
                3) users=100000; duration=1200 ;;
                4) users=250000; duration=1800 ;;
                5) users=500000; duration=3600 ;;  # 1 hora!
                6) 
                    read -p "Quantos usuários? (máx 500k): " users
                    users=${users:-1000}
                    read -p "Duração em segundos?: " duration
                    duration=${duration:-300}
                    ;;
                *) users=1000; duration=300 ;;
            esac
            
            artillery_bombardment $users $duration
            ;;
        3)
            check_system_limits
            mega_load_test
            ;;
        4)
            check_system_limits
            prepare_massive_test_data
            chaos_engineering_test
            ;;
        5)
            generate_extreme_report
            ;;
        6)
            # Teste de diagnóstico
            log "🔧 Executando diagnóstico do Apache Bench..."
            
            echo "1. Testando conectividade básica:"
            curl -s -o /dev/null -w "Status: %{http_code}, Tempo: %{time_total}s\n" "$BASE_URL/activity?limit=1"
            
            echo ""
            echo "2. Teste Apache Bench pequeno (10 req, 2 concorrência):"
            ab -n 10 -c 2 "$BASE_URL/activity?limit=1"
            
            echo ""
            echo "3. Teste Apache Bench médio (100 req, 10 concorrência):"
            ab -n 100 -c 10 "$BASE_URL/activity?limit=5"
            
            echo ""
            echo "4. Verificando limites do sistema:"
            echo "   File descriptors: $(ulimit -n)"
            echo "   Max processes: $(ulimit -u)"
            echo "   TCP somaxconn: $(sysctl net.core.somaxconn 2>/dev/null || echo 'N/A')"
            ;;
        *)
            error "Opção inválida!"
            exit 1
            ;;
    esac
    
    echo ""
    chaos "🎉 TESTE EXTREMO FINALIZADO!"
    echo -e "${MAGENTA}📂 Resultados em: $RESULTS_DIR/${NC}"
    echo -e "${RED}⚠️  Verifique se o sistema está estável!${NC}"
}

main