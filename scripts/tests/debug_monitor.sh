#!/bin/bash

# 🔍 Debug Monitor - Teste detalhado das funções de monitoramento

set -euo pipefail

API_BASE="https://poc-avi.ip.tv/api"

echo "🔍 DEBUG: Testando funções de monitoramento"
echo "============================================"

echo -e "\n1. 📊 Testando /activity endpoint:"
curl -s "${API_BASE}/activity" | jq '. | {count: length, sample: .[0] | {id, title, created_at}}'

echo -e "\n2. 📦 Testando /batch/stats endpoint:"
curl -s "${API_BASE}/batch/stats" | jq '.data.batch_processor | {activeBatches, processed, created}'

echo -e "\n3. 🔧 Testando /system/monitoring endpoint:"
curl -s "${API_BASE}/system/monitoring" -w "\nHTTP Status: %{http_code}\n" | head -10

echo -e "\n4. 🚦 Tentando /system/queue-stats endpoint:"
curl -s "${API_BASE}/system/queue-stats" -w "\nHTTP Status: %{http_code}\n" 2>/dev/null | head -5 || echo "❌ Endpoint não existe"

echo -e "\n5. 💾 Testando /system/cache-management endpoint:"
curl -s -X POST "${API_BASE}/system/cache-management" \
  -H "Content-Type: application/json" \
  -d '{"action": "stats"}' \
  -w "\nHTTP Status: %{http_code}\n" | head -10

echo -e "\n6. 📡 Testando /system/pubsub-test endpoint:"
curl -s -X POST "${API_BASE}/system/pubsub-test" \
  -H "Content-Type: application/json" \
  -d '{"action": "stats"}' \
  -w "\nHTTP Status: %{http_code}\n" | head -5

echo -e "\n✅ Debug concluído!"