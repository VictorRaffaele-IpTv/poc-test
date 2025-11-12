#!/bin/bash

# 🧪 Teste Rápido de Endpoints - AVI API
# Verifica se todos os endpoints estão funcionando corretamente

set -euo pipefail

# Configurações
PRODUCTION_URL="https://poc-avi.ip.tv"  # Altere para a URL da sua API
API_BASE="${PRODUCTION_URL}/api"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}🧪 TESTE DE ENDPOINTS DA API${NC}"
echo "=================================="
echo -e "${CYAN}URL: ${PRODUCTION_URL}${NC}"
echo ""

# Teste 1: GET /activity
echo -n "1. GET /activity: "
response=$(curl -s -w "%{http_code}" "${API_BASE}/activity" --connect-timeout 10 --max-time 15 -o /dev/null 2>/dev/null || echo "000")
if [ "$response" = "200" ]; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAIL (HTTP $response)${NC}"
fi

# Teste 2: POST /activity
echo -n "2. POST /activity: "
test_activity='{
    "title": "Test Activity",
    "question": "Quanto é 2+2?",
    "expected_answer": "4",
    "difficulty": "easy"
}'
response=$(curl -s -w "%{http_code}" \
    -X POST "${API_BASE}/activity" \
    -H "Content-Type: application/json" \
    -d "$test_activity" \
    --connect-timeout 10 --max-time 15 -o /dev/null 2>/dev/null || echo "000")
if [ "$response" = "201" ]; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAIL (HTTP $response)${NC}"
fi

# Teste 3: GET /batch/stats
echo -n "3. GET /batch/stats: "
response=$(curl -s -w "%{http_code}" "${API_BASE}/batch/stats" --connect-timeout 10 --max-time 15 -o /dev/null 2>/dev/null || echo "000")
if [ "$response" = "200" ]; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAIL (HTTP $response)${NC}"
fi

# Teste 4: POST /batch/test
echo -n "4. POST /batch/test: "
batch_data='{"batch_size": 3, "auto_flush": true}'
response=$(curl -s -w "%{http_code}" \
    -X POST "${API_BASE}/batch/test" \
    -H "Content-Type: application/json" \
    -d "$batch_data" \
    --connect-timeout 10 --max-time 15 -o /dev/null 2>/dev/null || echo "000")
if [ "$response" = "200" ]; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAIL (HTTP $response)${NC}"
fi

# Teste 5: GET /system/monitoring
echo -n "5. GET /system/monitoring: "
response=$(curl -s -w "%{http_code}" "${API_BASE}/system/monitoring" --connect-timeout 10 --max-time 15 -o /dev/null 2>/dev/null || echo "000")
if [ "$response" = "200" ]; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAIL (HTTP $response)${NC}"
fi

# Teste 6: POST /system/cache-management
echo -n "6. POST /system/cache-management: "
cache_data='{"action": "stats"}'
response=$(curl -s -w "%{http_code}" \
    -X POST "${API_BASE}/system/cache-management" \
    -H "Content-Type: application/json" \
    -d "$cache_data" \
    --connect-timeout 10 --max-time 15 -o /dev/null 2>/dev/null || echo "000")
if [ "$response" = "200" ] || [ "$response" = "201" ]; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAIL (HTTP $response)${NC}"
fi

# Teste 7: POST /system/pubsub-test
echo -n "7. POST /system/pubsub-test: "
pubsub_data='{
    "action": "publish",
    "channel": "test_channel",
    "event": "test_event",
    "data": {"test": true}
}'
response=$(curl -s -w "%{http_code}" \
    -X POST "${API_BASE}/system/pubsub-test" \
    -H "Content-Type: application/json" \
    -d "$pubsub_data" \
    --connect-timeout 10 --max-time 15 -o /dev/null 2>/dev/null || echo "000")
if [ "$response" = "200" ] || [ "$response" = "201" ]; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAIL (HTTP $response)${NC}"
fi

echo ""
echo -e "${BLUE}🏁 Teste de endpoints concluído!${NC}"