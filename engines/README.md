# AVI Worker Engine System

Sistema de workers inspirado no padrão TMS Scaffold, com inicialização declarativa e injeção de dependências.

## Arquitetura

```
worker.js (entry point)
    ↓
engines/loader.js (detecta engine)
    ↓
engines/kafka.js (KafkaEngine)
    ↓
routes/worker.js (configuração declarativa)
    ↓
functions/* (handlers)
```

## Configuração de Workers

Os workers são configurados de forma declarativa em `routes/worker.js`:

```javascript
module.exports = {
    engine: "kafka",  // Tipo de engine
    
    deps: [           // Dependências a serem injetadas
        "Activity",
        "Response",
        "Validation",
        "kafkaService",
    ],
    
    functions: [      // Mapeamento topic → event → handler
        {
            topic: "question_correction",
            event: "correctQuestion",
            handler: "functions/answer/correct-question-ai",
        },
    ],
}
```

## Kafka Engine

O `KafkaEngine` automaticamente:

1. **Carrega dependências** do array `deps`
2. **Conecta ao Kafka** criando producer e consumers
3. **Subscreve aos tópicos** agrupando functions por topic
4. **Roteia mensagens** baseado no campo `event` do payload
5. **Injeta dependências** nos handlers

## Entry Point

O `worker.js` suporta o padrão TMS de variável `ROUTES_NAME`:

```bash
# Usa routes/worker.js (padrão)
node worker.js

# Usa routes/worker.js (explícito)
ROUTES_NAME=worker node worker.js

# Permite múltiplos workers
ROUTES_NAME=notifications node worker.js
ROUTES_NAME=validations node worker.js
```

## Injeção de Dependências

Handlers recebem deps como primeiro argumento:

```javascript
// functions/answer/correct-question-ai.js
async function correctQuestion(deps, context) {
    const { Activity, Response, producer } = deps
    const { body } = context
    
    // Lógica do handler...
    
    return { success: true }
}
```

## Diferenças do Padrão TMS

1. **Engine Detection**: TMS detecta automaticamente, aqui é explícito via `engine: "kafka"`
2. **Deps Loading**: TMS usa container IoC, aqui usa require direto
3. **Entry Point**: TMS usa Scaffold global, aqui usa engines/loader.js local

## Vantagens

✅ **Declarativo**: Configuração clara e concisa  
✅ **Modular**: Fácil adicionar novos workers  
✅ **Testável**: Deps injetadas facilitam mocks  
✅ **Escalável**: Múltiplas instâncias do mesmo worker  
✅ **Observable**: Logs estruturados com emojis

## Uso em Docker

```yaml
avi-worker:
  command: node worker.js
  environment:
    ROUTES_NAME: worker  # routes/worker.js
  deploy:
    replicas: 2  # 2 instâncias do mesmo worker
```

## Desenvolvimento Local

```bash
# Terminal 1: API
npm start

# Terminal 2: Worker
node worker.js

# Terminal 3: Monitor
npm run monitor
```
