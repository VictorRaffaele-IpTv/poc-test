# TMS (Task Manager System) - AI Agent Instructions

## Overview
TMS is an educational task management system built on the proprietary **Scaffold** framework (from `node_modules/scaffold`). It manages educational tasks, questions, answers, and AI-powered essay correction through a multi-service architecture with HTTP, Kafka workers, and background jobs.

## Architecture

### Three-Service Model
1. **HTTP Server** (`routes/http.js`) - REST API for web/mobile clients
2. **Kafka Worker** (`routes/worker.js`) - Async message processing (essay correction, notifications, plagiarism detection)
3. **Jobs Service** (`routes/jobs.js`) - Scheduled background tasks (compulsory answer correction)

Each service has its own route definition with `engines`, `deps`, and `functions` arrays.

### Scaffold Framework Pattern
- **Route Configuration**: Routes declare dependencies via `deps` array (e.g., `"scaffold/postgresDB"`, `"kumulus"`, `"motrix"`)
- **Dependency Injection**: Dependencies from `deps/` folder and `node_modules/scaffold/deps/` are injected into function handlers
- **Function Handlers**: Located in `functions/` organized by domain (task, answer, question, etc.)
- **Handler Signature**: `async (deps, {params, body, query, context, headers, env}) => result`
  - `deps` contains injected services (repository, actionRegister, notification, kumulus, etc.)
  - `context.session` has auth data (nick, realm, role, aud, iat)
  - `context.logger` for structured logging

### Database & Repository Pattern
- **PostgreSQL** via Knex.js (`database/migrations/`)
- **Repository Layer** (`repository/`) wraps Knex with domain logic
  - `Task`, `Answer`, `Question`, `Category`, `Lesson`, `Motrix`, `Curriculum`, etc.
  - Repositories expose methods like `createTask()`, `getTask()`, `list()`, transaction support
- **Migrations**: Manual naming (e.g., `0001-create-task.js`), run via `npm run migrate`
- **Test Database**: Requires sibling `room/` project for migrations (see README test setup)

### Key Domain Concepts
- **Tasks**: Educational assessments with questions. Types: `model` (template) or `task` (published instance)
- **Questions**: 15+ types including `single`, `multi`, `essay`, `text_ai`, `fill-words`, `game`, etc.
- **Answers**: User responses with status (`draft`, `submitted`, `revised`)
- **Realms**: Multi-tenancy via `realm` field (e.g., school districts)
- **RBAC**: Permission checks via `repository.Rbac.hasPermission()` (actions like `tms_task_create`)
- **Categories**: Task organization with hierarchical parent/child relationships
- **Curriculum**: Standards/grades/subjects/themes/topics/skills hierarchy
- **Motrix**: External curriculum API integration for assessments and topic trees

## Development Workflows

### Running Locally
```bash
# Start dependencies (Postgres, Redis, LanguageTool)
cd ci && docker compose up -d

# Run tests (requires room/ sibling project)
npm test
npm run test:task  # Task-specific tests
npm run test:answer  # Answer-specific tests

# Start local server (port 3001)
npm run local
# Access docs: http://localhost:3001/tms/private/docs/?auth_token=123456
```

### Testing
- **Framework**: Mocha + Chai + Sinon
- **Helpers**: `specs/helpers/index.js` has test utilities (`t.makeTask()`, `t.dashboardAuth()`, etc.)
- **Database**: Auto-cleaned between tests via `t.cleanupDatabase()`
- **Stubs**: Storage, ACL, IA stubs available (`t.StorageStub()`, `t.AclRestoreStub()`)

### Database Migrations
```bash
npm run migrate   # Apply migrations (production env)
npm run rollback  # Rollback last migration
```

### Version Bumping & Deployment
Uses custom `bump` CLI from Scaffold package:
```bash
# Bump patch version and tag for staging/homolog
npx bump -p http,worker,job -r staging,homolog

# Production tag without version bump
npx bump -p http -r production --no_increase
```

## Code Conventions

### Linting & Formatting
- **Biome** (not ESLint/Prettier) - see `biome.json`
- Run: `npm run linter`
- Config: 4-space indent, 120-char line width, trailing commas, no semicolons for arrow functions
- Globals: Mocha test globals (`describe`, `it`, `expect`, `sinon`) pre-configured

### Route Structure
Routes in `routes/http.js` follow this pattern:
```javascript
{
    engine: "http",
    method: "POST",
    path: "/task/:task_id/question",
    auth: ["auth-token"],  // Authentication middleware
    before: ["question/policy/can-edit", "realm/set-leaf-as-current"],  // Policy checks
    handler: "question/create",  // Maps to functions/question/create.js
    authorization: {platforms: ["dashboard"]},  // Platform restrictions
}
```

### Validation Pattern
Each handler can have a `-validator.js` companion (e.g., `functions/task/create-validator.js`):
```javascript
const Joi = require("joi");
const body = Joi.object().keys({
    title: Joi.string().required(),
    is_exam: Joi.boolean(),
});
module.exports = {body, query, params};  // Export schemas by request part
```

### Policy Functions
Located in `functions/*/policy/` - return truthy/falsy or throw errors:
```javascript
module.exports = async ({repository: {Rbac}}, {body, context: {session}}) =>
    Rbac.hasPermission({
        realm: session.realm,
        role: session.role,
        action: `tms_model_create${body.is_exam ? "_exam" : ""}`,
    });
```

### External Dependencies
- **Kumulus**: AI essay/text correction service (`deps/kumulus.js`)
- **Motrix**: Curriculum API (`deps/motrix.js`)
- **LanguageTool**: Grammar checking (`deps/languageTool.js`)
- **Agent**: LLM interaction wrapper (`deps/agent.js`)
- **Notification**: SNS/Kafka notifications (`deps/notification.js`)

### Environment Variables
Critical vars in `config/index.js`:
- `TMS_DB_URL` - PostgreSQL connection
- `KUMULUS_API_URL`, `KUMULUS_API_TOKEN` - Essay AI service
- `MOTRIX_API_URL`, `MOTRIX_API_TOKEN` - Curriculum API
- `OPENAI_API_TOKEN`, `OPENAI_MODEL` - LLM config
- `DEFAULT_LLM_PROVIDER` - AI provider routing
- Rate limiting: `LIST_TASK_LIMIT_REQPS`, `CREATE_TASK_LIMIT_REQPS`, etc.

## Common Patterns

### Transaction Usage
```javascript
await Task.transaction(async (txn) => {
    const task = await Task.createTask({...}, {txn});
    await Task.addCategoryBatch(task.id, category_ids, {txn});
});
```

### Action Registration (Audit Trail)
```javascript
await actionRegister.register({
    realm: session.realm,
    target: `${task.id}`,
    platform: session.aud,
    requester: session.nick,
    action: actionRegister.ACTION.CREATE,
    resource: actionRegister.RESOURCE.MODEL,
});
```

### Error Handling
Use Scaffold error classes:
```javascript
const {NotFoundError, BadRequestError, ForbiddenError} = require("scaffold/errors");
throw new NotFoundError({field: "task", value: task_id});
```

### Kafka Message Publishing
```javascript
const {producer} = app.locals;
await producer.publish({
    topic: "essay_correction",
    event: "correctEssaySkills",
    payload: {task_id, answer_id, essay, genre, assessedSkills},
});
```

## File Organization

### Functions Folder
Organized by resource:
- `functions/task/` - Task CRUD, publish, apply, duplicate, export
- `functions/answer/` - Answer submission, revision, AI correction
- `functions/question/` - Question CRUD, reorder, correct
- `functions/category/` - Category management
- `functions/lesson/` - Lesson (task collections) management
- Each domain folder contains handlers, validators, policies, and commons

### Scripts
Utility scripts in `scripts/`:
- Essay-related: `export-essay-answers.js`, `queue-unprocessed-essays.js`
- Data operations: `copy-answers-between-rooms.js`, `populate-targets.js`
- Analysis: `count-essay-correction.js`, `analyze-answers-from-csv.js`

## Testing Considerations
- Tests depend on `room/` project migrations (sibling directory)
- Use `t.http.*` helpers for endpoint testing (e.g., `t.http.taskCreate(auth, task)`)
- Auth tokens via `t.dashboardAuth()` or `t.clientAuth()`
- Mock external services: `t.StorageStub()`, `t.KumulusStub()`
- Clean database with `t.cleanupDatabase()` in `afterEach()`

## API Documentation
- **Public**: `https://{base_api}/tms/docs`
- **Private**: `https://{base_api}/tms/private/docs?auth_token=...`
- Local: `http://localhost:3001/tms/private/docs/?auth_token=123456`

## External API (v1)
External integrations use `/v1/` prefix with rate limiting:
- Task operations: `POST /v1/task`, `PUT /v1/task/:id`, `DELETE /v1/task/:id`
- Batch operations: `POST /v1/task/:id/question/batch`
- Webhooks: `POST /v1/webhook/essay/correction`, `POST /v1/webhook/text/correction`
- Platform authorization: `{platforms: ["api"]}`
- Rate limits configured per endpoint in `routes/external.js`

## Code style
- Follows standard JavaScript conventions
- Always, when possible, order the imports by width like:
  ```javascript
  const A = require("a");
  const BB = require("bb");
  const CCC = require("ccc");
  ```
- 
