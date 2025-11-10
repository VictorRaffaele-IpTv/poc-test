#!/bin/bash

# Monitor em Tempo Real da Aplicação AVI
# Monitora CPU, Memória, Conexões e Performance

set -e

MONITOR_DURATION=${1:-60}  # Duração em segundos (padrão: 60s)
INTERVAL=${2:-1}           # Intervalo entre coletas (padrão: 1s)
OUTPUT_DIR="monitoring_results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p $OUTPUT_DIR

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

# Encontrar PID do processo Node.js
find_node_pid() {
    local pid=$(pgrep -f "node.*app.js" | head -1)
    echo $pid
}

# Monitor de recursos do sistema
monitor_system() {
    local output_file="$OUTPUT_DIR/system_monitor_$TIMESTAMP.csv"
    local node_pid=$(find_node_pid)
    
    # Cabeçalho CSV
    echo "timestamp,load_1min,load_5min,load_15min,mem_used_gb,mem_free_gb,node_cpu_percent,node_mem_percent,node_vsz_mb,node_rss_mb,connections_3000,disk_usage_percent" > $output_file
    
    log "🖥️  Monitorando recursos do sistema..."
    log "   Node.js PID: ${node_pid:-'Não encontrado'}"
    log "   Duração: ${MONITOR_DURATION}s"
    log "   Arquivo: $output_file"
    
    for ((i=1; i<=MONITOR_DURATION; i++)); do
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        
        # Load average
        local load=$(uptime | grep -o 'load average: [0-9.,]\+' | cut -d: -f2 | tr -d ' ')
        local load_1min=$(echo $load | cut -d, -f1)
        local load_5min=$(echo $load | cut -d, -f2)
        local load_15min=$(echo $load | cut -d, -f3)
        
        # Memória do sistema
        local mem_info=$(free -g | grep '^Mem:')
        local mem_used=$(echo $mem_info | awk '{print $3}')
        local mem_free=$(echo $mem_info | awk '{print $7}')
        
        # Processo Node.js específico
        local node_cpu=0
        local node_mem=0
        local node_vsz=0
        local node_rss=0
        
        if [ ! -z "$node_pid" ] && kill -0 $node_pid 2>/dev/null; then
            local ps_info=$(ps -p $node_pid -o pcpu,pmem,vsz,rss --no-headers 2>/dev/null || echo "0 0 0 0")
            node_cpu=$(echo $ps_info | awk '{print $1}')
            node_mem=$(echo $ps_info | awk '{print $2}')
            node_vsz=$(echo "scale=2; $(echo $ps_info | awk '{print $3}') / 1024" | bc -l)
            node_rss=$(echo "scale=2; $(echo $ps_info | awk '{print $4}') / 1024" | bc -l)
        fi
        
        # Conexões ativas na porta 3000
        local connections=$(netstat -tn 2>/dev/null | grep :3000 | grep ESTABLISHED | wc -l)
        
        # Uso de disco
        local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
        
        # Escrever linha no CSV
        echo "$timestamp,$load_1min,$load_5min,$load_15min,$mem_used,$mem_free,$node_cpu,$node_mem,$node_vsz,$node_rss,$connections,$disk_usage" >> $output_file
        
        # Display em tempo real (a cada 5 segundos)
        if [ $((i % 5)) -eq 0 ]; then
            clear
            echo -e "${BLUE}🔄 Monitor AVI - Tempo Real (${i}s/${MONITOR_DURATION}s)${NC}"
            echo "========================================"
            echo ""
            echo -e "${CYAN}📊 Sistema:${NC}"
            echo "  Load Average: $load_1min, $load_5min, $load_15min"
            echo "  Memória: ${mem_used}GB usado, ${mem_free}GB livre"
            echo "  Disco: ${disk_usage}% usado"
            echo ""
            echo -e "${CYAN}🚀 Node.js (PID: ${node_pid:-'N/A'}):${NC}"
            echo "  CPU: ${node_cpu}%"
            echo "  Memória: ${node_mem}% (${node_rss}MB RSS)"
            echo "  Virtual Memory: ${node_vsz}MB"
            echo ""
            echo -e "${CYAN}🌐 Rede:${NC}"
            echo "  Conexões ativas (porta 3000): $connections"
            echo ""
            echo -e "${YELLOW}Pressione Ctrl+C para parar${NC}"
        fi
        
        sleep $INTERVAL
    done
    
    log "✅ Monitoramento concluído: $output_file"
}

# Monitor de performance da API
monitor_api_performance() {
    local output_file="$OUTPUT_DIR/api_performance_$TIMESTAMP.csv"
    local base_url="http://localhost:3000/api"
    
    # Cabeçalho CSV
    echo "timestamp,endpoint,http_code,response_time_ms,size_bytes" > $output_file
    
    log "🌐 Monitorando performance da API..."
    
    # Endpoints para testar
    local endpoints=(
        "/activity?limit=10"
        "/activity/1" 
        "/audit-log?limit=5"
    )
    
    for ((i=1; i<=MONITOR_DURATION; i++)); do
        for endpoint in "${endpoints[@]}"; do
            local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
            
            # Medir tempo de resposta
            local response=$(curl -s -w "%{http_code},%{time_total},%{size_download}" -o /dev/null "$base_url$endpoint" 2>/dev/null || echo "000,999.999,0")
            local http_code=$(echo $response | cut -d, -f1)
            local time_total=$(echo $response | cut -d, -f2)
            local size_download=$(echo $response | cut -d, -f3)
            
            # Converter tempo para milissegundos
            local response_time_ms=$(echo "scale=2; $time_total * 1000" | bc -l)
            
            echo "$timestamp,$endpoint,$http_code,$response_time_ms,$size_download" >> $output_file
        done
        
        sleep $INTERVAL
    done
    
    log "✅ Monitoramento de API concluído: $output_file"
}

# Executar teste de carga durante monitoramento
stress_with_monitoring() {
    local concurrent_users=${1:-200}  # 20x mais usuários
    local requests_per_user=${2:-100}  # 20x mais requisições
    
    log "🔥 Iniciando teste de estresse EXTREMO com monitoramento..."
    log "   Usuários: $concurrent_users (CARGA EXTREMA 20x)"
    log "   Requisições por usuário: $requests_per_user"
    
    # Iniciar monitoramento em background
    monitor_system &
    local monitor_pid=$!
    
    # Iniciar monitoramento de API em background
    monitor_api_performance &
    local api_monitor_pid=$!
    
    # Aguardar 5 segundos para estabelecer baseline
    sleep 5
    
    # Executar teste de carga
    log "🚀 Iniciando carga de trabalho..."
    
    local base_url="http://localhost:3000/api"
    
    # Criar carga de trabalho em paralelo
    for ((u=1; u<=concurrent_users; u++)); do
        {
            for ((r=1; r<=requests_per_user; r++)); do
                # Alternar tipos de requisição
                case $((r % 3)) in
                    0) curl -s "$base_url/activity?page=$u&limit=10" > /dev/null ;;
                    1) curl -s -X POST "$base_url/activity" \
                        -H "Content-Type: application/json" \
                        -H "User-ID: stress_$u" \
                        -H "User-Name: Stress User $u" \
                        -d '{
                            "title": "Stress Test Activity '${u}_${r}'",
                            "question": "Load testing question",
                            "difficulty": "medium"
                        }' > /dev/null ;;
                    2) curl -s "$base_url/audit-log?limit=5&offset=$r" > /dev/null ;;
                esac
                
                # Pequena pausa entre requisições
                sleep 0.1
            done
        } &
    done
    
    # Aguardar todos os processos de carga terminarem
    wait
    
    log "✅ Carga de trabalho concluída"
    
    # Aguardar mais um pouco para capturar o recovery
    sleep 10
    
    # Parar monitoramento
    kill $monitor_pid 2>/dev/null || true
    kill $api_monitor_pid 2>/dev/null || true
    
    wait $monitor_pid 2>/dev/null || true
    wait $api_monitor_pid 2>/dev/null || true
    
    log "🎉 Teste de estresse com monitoramento concluído!"
}

# Gerar gráficos simples (se gnuplot disponível)
generate_charts() {
    if ! command -v gnuplot &> /dev/null; then
        warn "⚠️  gnuplot não disponível - pulando geração de gráficos"
        return
    fi
    
    log "📈 Gerando gráficos..."
    
    local system_csv="$OUTPUT_DIR/system_monitor_$TIMESTAMP.csv"
    local api_csv="$OUTPUT_DIR/api_performance_$TIMESTAMP.csv"
    
    if [ -f "$system_csv" ]; then
        # Gráfico de CPU e Memória
        gnuplot << EOF
set terminal png size 800,600
set output '$OUTPUT_DIR/system_resources_$TIMESTAMP.png'
set title 'Sistema - CPU e Memória do Node.js'
set xlabel 'Tempo'
set ylabel 'Porcentagem'
set xdata time
set timefmt '%Y-%m-%d %H:%M:%S'
set format x '%H:%M'
set grid
plot '$system_csv' using 1:7 with lines title 'CPU %', \
     '$system_csv' using 1:8 with lines title 'Memória %'
EOF

        # Gráfico de conexões
        gnuplot << EOF
set terminal png size 800,400  
set output '$OUTPUT_DIR/network_connections_$TIMESTAMP.png'
set title 'Conexões Ativas (porta 3000)'
set xlabel 'Tempo'
set ylabel 'Número de Conexões'
set xdata time
set timefmt '%Y-%m-%d %H:%M:%S'
set format x '%H:%M'
set grid
plot '$system_csv' using 1:11 with lines title 'Conexões'
EOF
    fi
    
    if [ -f "$api_csv" ]; then
        # Gráfico de tempo de resposta da API
        gnuplot << EOF
set terminal png size 800,600
set output '$OUTPUT_DIR/api_response_times_$TIMESTAMP.png'
set title 'Tempos de Resposta da API'
set xlabel 'Tempo'
set ylabel 'Tempo de Resposta (ms)'
set xdata time
set timefmt '%Y-%m-%d %H:%M:%S'
set format x '%H:%M'
set grid
plot '$api_csv' using 1:4 with points title 'Response Time'
EOF
    fi
    
    log "✅ Gráficos gerados em $OUTPUT_DIR/"
}

# Menu principal
main_monitor() {
    echo -e "${BLUE}📊 AVI Real-Time Monitoring Suite${NC}"
    echo "===================================="
    echo ""
    echo "1. 🖥️  Monitor de Sistema (apenas recursos)"
    echo "2. 🌐 Monitor de API (apenas performance)"
    echo "3. 🔥 Teste de Estresse com Monitoramento Completo"
    echo "4. 📈 Gerar Gráficos dos Dados Existentes"
    echo ""
    read -p "Escolha uma opção (1-4): " option
    
    case $option in
        1)
            read -p "Duração em segundos (padrão 60): " duration
            MONITOR_DURATION=${duration:-60}
            monitor_system
            ;;
        2)
            read -p "Duração em segundos (padrão 60): " duration
            MONITOR_DURATION=${duration:-60}
            monitor_api_performance
            ;;
        3)
            read -p "Duração do teste em segundos (padrão 300): " duration
            read -p "Usuários concorrentes (padrão 200): " users  
            read -p "Requisições por usuário (padrão 100): " requests
            MONITOR_DURATION=${duration:-300}
            stress_with_monitoring ${users:-200} ${requests:-100}
            generate_charts
            ;;
        4)
            generate_charts
            ;;
        *)
            warn "Opção inválida!"
            exit 1
            ;;
    esac
    
    echo ""
    log "🎉 Monitoramento concluído!"
    echo -e "${BLUE}📁 Resultados salvos em: $OUTPUT_DIR/${NC}"
    
    # Listar arquivos gerados
    echo ""
    echo "Arquivos gerados:"
    ls -la $OUTPUT_DIR/*$TIMESTAMP* 2>/dev/null || echo "Nenhum arquivo encontrado"
}

# Verificar dependências
check_dependencies() {
    # bc para cálculos matemáticos
    if ! command -v bc &> /dev/null; then
        warn "Instalando bc (calculadora)..."
        sudo apt-get update && sudo apt-get install -y bc
    fi
}

# Trap para limpeza em caso de interrupção
trap 'log "🛑 Monitoramento interrompido pelo usuário"; exit 0' INT TERM

check_dependencies
main_monitor