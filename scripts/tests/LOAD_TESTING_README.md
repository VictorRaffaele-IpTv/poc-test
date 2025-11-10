# 🚀 AVI Load Testing & Performance Analysis Suite

Este conjunto de ferramentas permite testar a escalabilidade e performance da aplicação AVI (Activity Validation with Intelligence) com sua arquitetura TMS.

## 📋 Ferramentas Disponíveis

### 1. 🔥 `./load_test.sh` - Suite Principal de Testes de Carga
**Função:** Testa diferentes cenários de carga com múltiplos usuários concorrentes

**Recursos:**
- ✅ Teste básico de conectividade
- ✅ Testes de carga customizáveis 
- ✅ Teste progressivo (1→5→10→25→50→100 usuários)
- ✅ Monitoramento de recursos durante testes
- ✅ Relatórios detalhados em CSV e texto

**Como usar:**
```bash
./load_test.sh
# Escolha opção 1 para teste completo (recomendado)
```

### 2. ⚡ `./ab_test.sh` - Testes com Apache Bench
**Função:** Benchmarks precisos usando Apache Bench (ab)

**Recursos:**
- ✅ Testes de alta precisão
- ✅ Gráficos de distribuição (gnuplot)
- ✅ Métricas detalhadas de latência
- ✅ Suporte a GET e POST

**Como usar:**
```bash
./ab_test.sh
# Escolha opção 1 para bateria completa
```

### 3. 📊 `./monitor.sh` - Monitoramento em Tempo Real
**Função:** Monitor recursos do sistema e performance da API

**Recursos:**
- ✅ CPU, Memória, Conexões em tempo real
- ✅ Tempos de resposta da API
- ✅ Geração de gráficos automática
- ✅ Teste de estresse com monitoramento

**Como usar:**
```bash
./monitor.sh
# Escolha opção 3 para teste completo com monitoramento
```

### 4. 📋 `./analyze_results.sh` - Análise Consolidada
**Função:** Analisa todos os resultados e gera recomendações

**Recursos:**
- ✅ Análise automática de todos os testes
- ✅ Recomendações de otimização
- ✅ Relatórios em Markdown
- ✅ Métricas consolidadas

**Como usar:**
```bash
./analyze_results.sh
# Escolha opção 1 para análise completa
```

## 🎯 Cenários de Teste Recomendados

### 🚀 Teste Rápido (5 minutos)
```bash
# 1. Teste básico
echo "2" | ./load_test.sh

# 2. Análise dos resultados
echo "5" | ./analyze_results.sh
```

### 🔥 Teste Completo (15-20 minutos)
```bash
# 1. Suite completa de testes
echo "1" | ./load_test.sh

# 2. Testes Apache Bench
echo "1" | ./ab_test.sh

# 3. Monitoramento com estresse
echo "3" | ./monitor.sh

# 4. Análise consolidada
echo "1" | ./analyze_results.sh
```

### � Teste EXTREMO (20x) - NOVA FERRAMENTA!
```bash
# CARGA EXTREMA - até 100k requisições
./extreme_load_test.sh
# Escolha opção 1 para CAOS TOTAL

# Testes disponíveis:
# - 50 a 5000 usuários simultâneos
# - Até 100.000 requisições
# - 10 minutos de chaos engineering
# - Bombardeio artillery style
```

### �📊 Teste Customizado EXTREMO
```bash
# Teste específico: 1000 usuários, 500 req/usuário
echo -e "3\n1000\n500" | ./load_test.sh

# Monitoramento EXTREMO por 10 minutos
echo -e "3\n600\n1000\n100" | ./monitor.sh

# Bombardeio artillery: 2000 usuários por 300s
echo -e "2\n2000\n300" | ./extreme_load_test.sh
```

## 📈 Métricas Analisadas

### 🔍 **Performance**
- **RPS** (Requests per Second)
- **Latência** (P50, P95, P99)
- **Taxa de Erro** (4xx, 5xx)
- **Throughput** (bytes/segundo)

### 🖥️ **Recursos**
- **CPU** do processo Node.js
- **Memória** (RSS, Virtual)
- **Conexões** ativas
- **Load Average** do sistema

### 🎯 **Endpoints Testados**
- `GET /api/activity` - Listar atividades
- `POST /api/activity` - Criar atividade
- `GET /api/activity/:id` - Buscar específica
- `GET /api/audit-log` - Logs de auditoria

## 🔧 Dependências

### Automaticamente Instaladas:
- `curl` - Requisições HTTP
- `bc` - Cálculos matemáticos
- `apache2-utils` - Apache Bench (ab)

### Opcionais:
- `gnuplot` - Geração de gráficos
- `jq` - Formatação JSON (melhora visualização)

### 💥 NOVA FERRAMENTA: `./extreme_load_test.sh`
**Testes de Carga Extrema (20x):**
- ✅ **Artillery Bombardment** - Milhares de usuários simultâneos
- ✅ **Mega Load Test** - 100.000 requisições em uma sessão
- ✅ **Chaos Engineering** - 10 minutos de caos total
- ✅ **System Limits Detection** - Encontra os limites da aplicação
- ✅ **Extreme Monitoring** - Monitoramento durante carga extrema

## 📂 Estrutura dos Resultados

```
├── load_test_results/          # Resultados dos testes de carga
│   ├── basic_test_*.txt
│   ├── curl_load_*users_*req_*.txt
│   └── progressive_summary_*.txt
├── ab_test_results/            # Resultados Apache Bench
│   ├── ab_*req_*con_*.txt
│   └── ab_consolidated_report_*.md
├── monitoring_results/         # Monitoramento do sistema
│   ├── system_monitor_*.csv
│   ├── api_performance_*.csv
│   └── *.png (gráficos)
└── performance_analysis_*.md   # Relatórios consolidados
```

## 🎯 Interpretação dos Resultados

### ✅ **Performance BOA**
- P95 < 100ms
- Taxa de sucesso > 95%
- CPU < 80% durante picos
- Sem erros 5xx

### ⚠️ **Performance REGULAR**
- P95: 100-500ms
- Taxa de sucesso: 90-95%
- CPU: 80-95% durante picos
- Poucos erros 5xx

### 🔴 **Performance RUIM**
- P95 > 500ms
- Taxa de sucesso < 90%
- CPU > 95% sustentado
- Muitos erros 5xx

## 💡 Recomendações Baseadas nos Testes

### 🚀 **Otimizações Imediatas**
1. **Connection Pooling** - PostgreSQL
2. **Cache Redis** - Consultas frequentes
3. **Compressão Gzip** - Respostas HTTP
4. **Índices de DB** - Queries otimizadas

### 📈 **Escalabilidade**
1. **Load Balancer** - Múltiplas instâncias
2. **CDN** - Arquivos estáticos
3. **Read Replicas** - PostgreSQL
4. **Queue Workers** - Kafka scaling

### 📊 **Monitoramento**
1. **APM** - New Relic/DataDog
2. **Logs Estruturados** - JSON logs
3. **Alertas** - Performance degradation
4. **Dashboards** - Real-time metrics

## 🔍 Troubleshooting

### Problema: "Servidor não respondendo"
```bash
# Verificar se está rodando
curl http://localhost:3000/api/activity

# Reiniciar se necessário
NODE_ENV=local node app.js
```

### Problema: "Permission denied"
```bash
# Dar permissão aos scripts
chmod +x *.sh
```

### Problema: "bc: command not found"
```bash
# Instalar dependências
sudo apt-get update && sudo apt-get install -y bc apache2-utils
```

## 🎉 Resultados de Exemplo

### Teste com 10 usuários concorrentes:
```
✅ Total: 50 requisições
✅ Sucesso: 100%
✅ P50: 26ms
✅ P95: 50ms
✅ Performance EXCELENTE!
```

### Arquitetura TMS Performance:
- **Dependency Injection**: ✅ Funcionando
- **Action Register**: ✅ Auditoria completa
- **Kafka Workers**: ✅ Processamento assíncrono
- **PostgreSQL**: ✅ Queries otimizadas

---

**Desenvolvido para testar a escalabilidade da arquitetura TMS-style do projeto AVI** 🚀