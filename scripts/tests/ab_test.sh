#!/bin/bash

# Teste de Performance com Apache Bench (ab)
# Script complementar para benchmarks mais precisos

set -e

BASE_URL="http://localhost:3000/api"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="ab_test_results"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] $1${NC}"
}

mkdir -p $RESULTS_DIR

# Verificar se ab está disponível
check_ab() {
    if ! command -v ab &> /dev/null; then
        warn "Apache Bench (ab) não encontrado. Instalando..."
        sudo apt-get update && sudo apt-get install -y apache2-utils
    fi
    log "✅ Apache Bench disponível"
}

# Teste com Apache Bench
ab_test() {
    local requests=$1
    local concurrency=$2
    local endpoint=$3
    local method=${4:-GET}
    local description=$5
    
    log "🚀 AB Test: $description"
    log "   Requests: $requests, Concurrency: $concurrency"
    
    local output_file="$RESULTS_DIR/ab_${requests}req_${concurrency}con_${TIMESTAMP}.txt"
    
    if [ "$method" = "GET" ]; then
        ab -n $requests -c $concurrency -g "${output_file}.gnuplot" "$BASE_URL$endpoint" > $output_file 2>&1
    else
        # Para POST, criar arquivo temporário com dados
        local post_data='{"title":"AB Test Activity","question":"Performance test question","difficulty":"medium"}'
        echo $post_data > /tmp/ab_post_data.json
        
        ab -n $requests -c $concurrency -p /tmp/ab_post_data.json -T "application/json" \
           -H "User-ID: ab_test" -H "User-Name: AB Tester" \
           -g "${output_file}.gnuplot" "$BASE_URL$endpoint" > $output_file 2>&1
    fi
    
    log "✅ Resultado salvo: $output_file"
    
    # Extrair métricas principais
    echo ""
    echo -e "${BLUE}📊 Métricas Principais:${NC}"
    grep -E "(Requests per second|Time per request|Transfer rate)" $output_file || true
    echo ""
}

# Bateria de testes
run_ab_tests() {
    log "🎯 Executando bateria de testes com Apache Bench - CARGA EXTREMA (20x)..."
    
    # Teste 1: GET Activities - Carga Baixa (20x)
    ab_test 2000 200 "/activity?limit=10" GET "Listar Atividades - Carga Baixa (20x)"
    
    # Teste 2: GET Activities - Carga Média (20x)  
    ab_test 10000 500 "/activity?limit=10" GET "Listar Atividades - Carga Média (20x)"
    
    # Teste 3: GET Activities - Carga Alta (20x)
    ab_test 20000 1000 "/activity?limit=10" GET "Listar Atividades - Carga Alta (20x)"
    
    # Teste 4: POST Activities - Criação (20x)
    ab_test 2000 200 "/activity" POST "Criar Atividades - Teste Escrita (20x)"
    
    # Teste 5: GET Audit Logs (20x)
    ab_test 4000 400 "/audit-log?limit=5" GET "Logs de Auditoria (20x)"
    
    # Teste 6: GET Atividade Específica (20x)  
    ab_test 6000 300 "/activity/1" GET "Busca Específica (20x)"
    
    # Teste 7: ESTRESSE EXTREMO - Mixed Workload
    ab_test 50000 2000 "/activity?limit=50" GET "ESTRESSE EXTREMO - 50k requests (20x)"
}

# Gerar relatório consolidado
generate_ab_report() {
    log "📋 Gerando relatório consolidado do Apache Bench..."
    
    local report_file="$RESULTS_DIR/ab_consolidated_report_$TIMESTAMP.md"
    
    {
        echo "# 🚀 Apache Bench Performance Report"
        echo ""
        echo "**Generated:** $(date)"
        echo "**Target:** $BASE_URL"
        echo ""
        
        echo "## 📊 Test Results Summary"
        echo ""
        echo "| Test | Requests | Concurrency | RPS | Mean Response Time | 95% Response Time |"
        echo "|------|----------|-------------|-----|-------------------|-------------------|"
        
        for result_file in $RESULTS_DIR/ab_*req_*con_$TIMESTAMP.txt; do
            if [ -f "$result_file" ]; then
                local filename=$(basename $result_file)
                local requests=$(echo $filename | grep -o '[0-9]\+req' | sed 's/req//')
                local concurrency=$(echo $filename | grep -o '[0-9]\+con' | sed 's/con//')
                
                local rps=$(grep "Requests per second:" $result_file | awk '{print $4}' || echo "N/A")
                local mean_time=$(grep "Time per request:" $result_file | head -1 | awk '{print $4}' || echo "N/A")
                local p95_time=$(grep "95%" $result_file | awk '{print $2}' || echo "N/A")
                
                echo "| $filename | $requests | $concurrency | $rps | ${mean_time}ms | ${p95_time}ms |"
            fi
        done
        
        echo ""
        echo "## 📈 Detailed Analysis"
        echo ""
        
        for result_file in $RESULTS_DIR/ab_*req_*con_$TIMESTAMP.txt; do
            if [ -f "$result_file" ]; then
                echo "### $(basename $result_file .txt)"
                echo ""
                echo "\`\`\`"
                grep -A 20 "Benchmarking" $result_file | head -25
                echo "\`\`\`"
                echo ""
            fi
        done
        
    } > $report_file
    
    log "✅ Relatório AB gerado: $report_file"
}

# Menu
main_ab() {
    echo -e "${BLUE}🚀 Apache Bench Performance Testing${NC}"
    echo "=================================="
    echo ""
    echo "1. 🎯 Executar Bateria Completa"
    echo "2. 🔧 Teste Customizado"
    echo "3. 📊 Apenas Relatório"
    echo ""
    read -p "Escolha uma opção (1-3): " option
    
    case $option in
        1)
            check_ab
            run_ab_tests
            generate_ab_report
            ;;
        2)
            check_ab
            read -p "Número de requisições: " requests
            read -p "Concorrência: " concurrency
            read -p "Endpoint (ex: /activity): " endpoint
            ab_test $requests $concurrency "$endpoint" GET "Teste Customizado"
            ;;
        3)
            generate_ab_report
            ;;
        *)
            warn "Opção inválida!"
            exit 1
            ;;
    esac
    
    echo ""
    log "🎉 Testes Apache Bench concluídos!"
    echo -e "${BLUE}📁 Resultados em: $RESULTS_DIR/${NC}"
}

main_ab