# AVI (Activity Validation with Intelligence) - AI Agent Instructions

## Overview
AVI é um sistema simplificado de validação de atividades com IA, baseado no framework **Scaffold**. O sistema permite submeter respostas de atividades através de uma interface web e validá-las usando LLM (Large Language Models) através de uma arquitetura escalável com HTTP, Kafka workers, e PostgreSQL.

## Architecture

### Dois-Service Model
1. **HTTP Server** (`routes/http.js`) - REST API para interface web
2. **Kafka Worker** (`routes/worker.js`) - Processamento assíncrono de validação por IA

Cada serviço possui sua própria definição de rota com arrays `engines`, `deps`, e `functions`.

### Scaffold Framework Pattern
- **Route Configuration**: Rotas declaram dependências via array `deps` (e.g., `"scaffold/postgresDB"`, `"agent"`)
- **Dependency Injection**: Dependências das pastas `deps/` e `node_modules/scaffold/deps/` são injetadas nos function handlers
- **Function Handlers**: Localizados em `functions/` organizados por domínio (activity, response, validation)
- **Handler Signature**: `async (deps, {params, body, query, context, headers, env}) => result`
  - `deps` contém serviços injetados (repository, agent, notification, etc.)
  - `context.logger` para logging estruturado

### Database & Repository Pattern
- **PostgreSQL** via Knex.js (`database/migrations/`)
- **Repository Layer** (`repository/`) encapsula Knex com lógica de domínio
  - `Activity`, `Response`, `Validation`
  - Repositories expõem métodos como `createActivity()`, `getResponse()`, `list()`, suporte a transação
- **Migrations**: Nomeação manual (e.g., `0001-create-activity.js`), executadas via `npm run migrate`

### Key Domain Concepts
- **Activities**: Atividades com perguntas que precisam ser validadas
- **Responses**: Respostas dos usuários para as atividades
- **Validations**: Resultados da validação por IA com pontuação e feedback
- **Status**: Estados das respostas (`draft`, `submitted`, `validated`, `rejected`)

## Development Workflows

### Running Locally
```bash
# Iniciar dependências (Postgres, Redis, Kafka)
cd ci && docker compose up -d

# Executar testes
npm test
npm run test:activity  # Testes de atividade
npm run test:response  # Testes de resposta

# Iniciar servidor local (porta 3000)
npm run local
# Acessar aplicação: http://localhost:3000
# Acessar docs: http://localhost:3000/avi/private/docs/?auth_token=123456
```

### Testing
- **Framework**: Mocha + Chai + Sinon
- **Helpers**: `specs/helpers/index.js` com utilitários de teste (`t.makeActivity()`, `t.auth()`, etc.)
- **Database**: Auto-limpeza entre testes via `t.cleanupDatabase()`
- **Stubs**: Stubs de IA e storage disponíveis (`t.AgentStub()`, `t.StorageStub()`)

### Database Migrations
```bash
npm run migrate   # Aplicar migrations
npm run rollback  # Rollback última migration
```

### Version Bumping & Deployment
Usa CLI customizado `bump` do pacote Scaffold:
```bash
# Bump patch version e tag para staging
npx bump -p http,worker -r staging

# Tag de produção sem bump de versão
npx bump -p http -r production --no_increase
```

## Code Conventions

### Linting & Formatting
- **Biome** (não ESLint/Prettier) - ver `biome.json`
- Executar: `npm run linter`
- Config: 4-space indent, 120-char line width, trailing commas, sem semicolons para arrow functions
- Globals: Globals de teste Mocha (`describe`, `it`, `expect`, `sinon`) pré-configurados

### Route Structure
Rotas em `routes/http.js` seguem este padrão:
```javascript
{
    engine: "http",
    method: "POST",
    path: "/activity/:activity_id/response",
    handler: "response/create",  // Mapeia para functions/response/create.js
}
```

### Validation Pattern
Cada handler pode ter um companion `-validator.js` (e.g., `functions/activity/create-validator.js`):
```javascript
const Joi = require("joi");
const body = Joi.object().keys({
    title: Joi.string().required(),
    question: Joi.string().required(),
    expected_answer: Joi.string(),
});
module.exports = {body, query, params};  // Exportar schemas por parte do request
```

### External Dependencies
- **Agent**: LLM interaction wrapper (`deps/agent.js`)
- **Notification**: Kafka notifications (`deps/notification.js`)

### Environment Variables
Variáveis críticas em `config/index.js`:
- `AVI_DB_URL` - Conexão PostgreSQL
- `OPENAI_API_TOKEN`, `OPENAI_MODEL` - Configuração LLM
- `DEFAULT_LLM_PROVIDER` - Roteamento de provider de IA
- `KAFKA_BROKERS` - Brokers Kafka

## Common Patterns

### Transaction Usage
```javascript
await Activity.transaction(async (txn) => {
    const activity = await Activity.createActivity({...}, {txn});
    await Response.createResponse({activity_id: activity.id, ...}, {txn});
});
```

### Error Handling
Usar classes de erro do Scaffold:
```javascript
const {NotFoundError, BadRequestError} = require("scaffold/errors");
throw new NotFoundError({field: "activity", value: activity_id});
```

### Kafka Message Publishing
```javascript
const {producer} = app.locals;
await producer.publish({
    topic: "response_validation",
    event: "validateResponse",
    payload: {activity_id, response_id, answer, expected_answer},
});
```

## File Organization

### Functions Folder
Organizado por recurso:
- `functions/activity/` - CRUD de atividades
- `functions/response/` - Submissão e gerenciamento de respostas
- `functions/validation/` - Processamento de validação por IA
- Cada pasta de domínio contém handlers, validators e commons

### Database Schema
Tabelas principais:
- `activities` - Atividades com perguntas
- `responses` - Respostas dos usuários
- `validations` - Resultados da validação por IA

## API Endpoints

### Activities
- `GET /activity` - Listar atividades
- `POST /activity` - Criar nova atividade
- `GET /activity/:id` - Obter atividade específica

### Responses
- `POST /activity/:activity_id/response` - Submeter resposta
- `GET /response/:id` - Obter resposta e validação

### Static Files
- `GET /` - Página principal da aplicação
- `GET /static/*` - Arquivos estáticos (CSS, JS, etc.)

## Frontend
Interface web simples com:
- Lista de atividades disponíveis
- Formulário para submeter respostas
- Visualização de resultados de validação
- Tecnologias: HTML5, CSS3, JavaScript vanilla, Fetch API

## Code Style
- Segue convenções padrão JavaScript
- Sempre que possível, ordenar imports por largura:
  ```javascript
  const A = require("a");
  const BB = require("bb");
  const CCC = require("ccc");
  ```
- Usar async/await em vez de Promises
- Nomes de função descritivos e em camelCase
- Comentários JSDoc para funções públicas