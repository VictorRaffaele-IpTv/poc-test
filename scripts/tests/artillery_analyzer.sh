#!/bin/bash

# 🔍 ARTILLERY TEST ANALYZER
# Analisa resultados de testes artillery para entender gargalos

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🔍 ARTILLERY TEST ANALYZER${NC}"
echo "=================================="
echo ""

# Analisar o teste de 500k usuários
analyze_500k_test() {
    echo -e "${YELLOW}📊 ANÁLISE: artillery_500000users_60s${NC}"
    echo ""
    
    # Dados do teste
    local users=500000
    local duration=60
    local max_requests_per_user=50
    local actual_requests=6499
    
    # Cálculos teóricos
    local theoretical_max=$((users * max_requests_per_user))
    local theoretical_rps=$((theoretical_max / duration))
    
    echo -e "${BLUE}📋 DADOS DO TESTE:${NC}"
    echo "  Usuários configurados: $users"
    echo "  Duração: ${duration}s"
    echo "  Max req/usuário: $max_requests_per_user"
    echo "  Requests executadas: $actual_requests"
    echo ""
    
    echo -e "${BLUE}🎯 EXPECTATIVA TEÓRICA:${NC}"
    echo "  Max teórico: $theoretical_max requisições"
    echo "  RPS teórico: $theoretical_rps req/s"
    echo ""
    
    echo -e "${RED}⚡ REALIDADE:${NC}"
    local actual_rps=$((actual_requests / duration))
    local efficiency=$(echo "scale=4; $actual_requests * 100 / $theoretical_max" | bc -l)
    echo "  RPS real: $actual_rps req/s"
    echo "  Eficiência: ${efficiency}%"
    echo ""
    
    echo -e "${YELLOW}🔍 ANÁLISE DE GARGALOS:${NC}"
    
    # 1. Análise de delays
    local delay_per_request=0.01  # 10ms para cargas extremas (>50k)
    local max_req_per_user_with_delay=$(echo "scale=0; $duration / $delay_per_request" | bc -l)
    echo "  1. DELAY ENTRE REQUESTS:"
    echo "     - Delay configurado: ${delay_per_request}s para >50k usuários"
    echo "     - Max req/usuário possível: $max_req_per_user_with_delay em ${duration}s"
    
    # 2. Análise de spawn delays
    local users_per_batch=1000
    local batch_delay=2
    local total_spawn_time=$(echo "scale=2; $users / $users_per_batch * $batch_delay" | bc -l)
    echo "     - Tempo total de spawn: ${total_spawn_time}s"
    echo "     - Tempo efetivo de teste: $(echo "$duration - $total_spawn_time" | bc -l)s"
    
    # 3. Limitações do sistema
    echo "  2. LIMITAÇÕES DO SISTEMA:"
    echo "     - File descriptors: 10,240 (cada usuário = 1 FD)"
    echo "     - TCP somaxconn: 4,096 (limite de conexões simultâneas)"
    echo "     - Load average: 44.27 (sistema saturado!)"
    
    # 4. Cálculo de usuários ativos
    local max_concurrent_connections=4096
    local active_users=$(echo "scale=0; $max_concurrent_connections" | bc -l)
    echo "  3. USUÁRIOS REALMENTE ATIVOS:"
    echo "     - Max conexões TCP: $max_concurrent_connections"
    echo "     - Usuários ativos estimados: ~$active_users"
    echo "     - Requests por usuário ativo: $(echo "scale=2; $actual_requests / $active_users" | bc -l)"
    
    echo ""
    echo -e "${GREEN}✅ CONCLUSÃO:${NC}"
    echo "O teste de 500k usuários foi LIMITADO por:"
    echo "1. 🚫 TCP somaxconn (4096) - apenas ~4k conexões simultâneas"
    echo "2. ⏱️  Delays excessivos (0.05s entre requests)"
    echo "3. 🐌 Spawn lento (2s a cada 1000 usuários = 16min só para criar!)"
    echo "4. 💾 File descriptors insuficientes"
    echo ""
    echo -e "${CYAN}🎯 PARA TESTES REALISTAS:${NC}"
    echo "- Use máximo de 4000 usuários (limite TCP)"
    echo "- Aumente duração para 300-600s"
    echo "- Reduza delays para 0.001-0.01s"
    echo "- Monitore file descriptors e conexões TCP"
}

# Comparar diferentes cargas
compare_loads() {
    echo -e "${YELLOW}📊 COMPARAÇÃO DE CARGAS${NC}"
    echo ""
    
    # Dados dos testes
    echo "TESTE                     | USUÁRIOS | DURAÇÃO | REQUESTS | RPS  | EFICIÊNCIA"
    echo "--------------------------|----------|---------|----------|------|------------"
    echo "artillery_250000users_60s | 250,000  | 60s     | 8,000    | 133  | 0.0064%"
    echo "artillery_500000users_60s | 500,000  | 60s     | 6,499    | 108  | 0.0026%"
    echo ""
    
    echo -e "${RED}🚨 OBSERVAÇÃO CRÍTICA:${NC}"
    echo "Mais usuários = MENOS throughput!"
    echo "Isso indica saturação do sistema e gargalos de recursos."
}

# Recomendações para testes eficazes
recommendations() {
    echo -e "${GREEN}🎯 RECOMENDAÇÕES PARA TESTES EFICAZES${NC}"
    echo ""
    
    echo "1. 📏 DIMENSIONAMENTO REALISTA:"
    echo "   - Max usuários: 2000-4000 (baseado em TCP limits)"
    echo "   - Duração mínima: 300s para cargas pesadas"
    echo "   - Requests/usuário: 10-100 (baseado na duração)"
    echo ""
    
    echo "2. ⚡ OTIMIZAÇÕES DE PERFORMANCE:"
    echo "   - Delays mínimos: 0.001s para testes locais"
    echo "   - Spawn rápido: grupos de 500, pause 0.5s"
    echo "   - Monitorar: ss -tn | grep :3000 | wc -l"
    echo ""
    
    echo "3. 🔧 AJUSTES DO SISTEMA:"
    echo "   - ulimit -n 65536"
    echo "   - echo 8192 > /proc/sys/net/core/somaxconn"
    echo "   - echo 4096 > /proc/sys/net/ipv4/tcp_max_syn_backlog"
    echo ""
    
    echo "4. 📊 TESTES PROGRESSIVOS:"
    echo "   - 1k usuários x 60s = baseline"
    echo "   - 2k usuários x 120s = 2x load"
    echo "   - 4k usuários x 300s = max realistic"
    echo "   - 8k usuários x 600s = stress test"
}

# Menu principal
main() {
    echo "Escolha uma análise:"
    echo "1. 🔍 Analisar teste 500k usuários"
    echo "2. 📊 Comparar diferentes cargas"
    echo "3. 🎯 Recomendações para testes eficazes"
    echo "4. 📋 Todas as análises"
    echo ""
    read -p "Opção (1-4): " option
    
    case $option in
        1) analyze_500k_test ;;
        2) compare_loads ;;
        3) recommendations ;;
        4) 
            analyze_500k_test
            echo ""
            echo "=================================="
            echo ""
            compare_loads
            echo ""
            echo "=================================="
            echo ""
            recommendations
            ;;
        *) echo "Opção inválida!" ;;
    esac
}

main