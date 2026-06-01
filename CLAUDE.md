# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

**Frontend:** Vue 3 + Vite + Pinia + Vue Router + Tailwind CSS + Element Plus
**Backend:** NestJS + Prisma + PostgreSQL (pgvector) + Redis + LangGraph
**LLM:** DeepSeek-v4-pro via OpenAI-compatible API

## Commands

```bash
# Frontend (port 5173)
cd client && npm run dev       # dev server
cd client && npm run build     # production build

# Backend (port 3000)
cd server && npm run dev       # nest start --watch
cd server && npm run build     # tsc compile

# Database (Docker)
docker-compose up -d           # starts postgres:5432 + redis:6379

# Prisma
cd server && npx prisma migrate dev --name <name>
cd server && npx prisma db push   # sync schema without migration
```

## Environment Variables

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/interview
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
OPENAI_API_KEY=<deepseek-api-key>
OPENAI_BASE_URL=https://api.deepseek.com/v1   # or any OpenAI-compatible endpoint
PORT=3000
```

## Project Structure

```
client/                          Vue 3 frontend
  src/
    api/client.ts                Axios + all API methods (positions, candidates, interviews, knowledge, reports)
    stores/interview.ts          Pinia store: messages, SSE parsing, timers, startInterview/sendAnswer
    stores/timer.ts              Composable: question countdown + total elapsed, parses [time] N from LLM output
    views/candidate/             InterviewSession.vue — two-step: confirm → chat
    views/admin/                 Dashboard, CandidateList, PositionList/Form, CompanyDocs
    components/                  ChatBubble, ProgressIndicator, CodeEditor, AdminLayout
    router/index.ts              /interview/:id, /admin/* routes (lazy-loaded)
    types/index.ts               ChatMessage, PositionInfo interfaces

server/                          NestJS backend
  src/
    main.ts                      Bootstrap: CORS (origin:5173), ValidationPipe, port 3000
    app.module.ts                ConfigModule + 6 feature modules
    shared/schema.ts             Zod schemas: SSEEvent, Question, Evaluation, CandidateInfo — shared types
    prisma/                      PrismaService + schema (Position, Candidate, Interview, CompanyDoc)
    interview/                   Interview CRUD, SSE streaming, resume extraction (pdf/docx/doc)
    interview/interview-sse.ts   Core SSE logic: streamStart, streamAnswer, streamInterview
    langgraph/
      interview.graph.ts         Graph assembly: 13 nodes, conditional edges
      state.ts                   LangGraph Annotation state (15 fields with reducers)
      routing.ts                 Conditional edge logic (tech→follow/next/behavioral, behavioral→follow/next/qa, qa→report/end)
      llm.ts                     LLM factory (ChatOpenAI), TokenQueue async iterator, StreamingHandler, resume parse dedup cache
      nodes/                     One async function per graph node
      personas/                  PersonaDefinition (id, systemPrompt, temperature, streaming, outputMode, Zod schema)
```

## Interview Graph Flow

```
START → icebreaker → parse_resume → tech_select → tech_ask → tech_evaluate ⏸️
                    ↓
  tech_evaluate → tech_follow_up → tech_evaluate   (surface-level & depth<3)
  tech_evaluate → tech_next_topic → tech_select    (more topics remain)
  tech_evaluate → behavioral_select                (tech round done)
                    ↓
  behavioral_select → behavioral_ask → behavioral_evaluate ⏸️
                    ↓
  behavioral_evaluate → behavioral_follow_up → behavioral_evaluate   (vague & depth<2)
  behavioral_evaluate → behavioral_next_question → behavioral_select (more competencies)
  behavioral_evaluate → candidate_qa                                  (behavioral done)
                    ↓
  candidate_qa → candidate_qa (loop, qaCount<5) → generate_report → END
```

⏸️ = interrupt point. Graph pauses when `candidateAnswer` is empty; resumes via `updateState` + `stream(null)` when the candidate sends a message.

**Routing thresholds**: tech follow-up max depth=3, behavioral follow-up max depth=2, candidate QA max 5 questions. Tech round covers all candidate projects + up to 2 concept questions.

## Key Architecture Patterns

### Persona System
Every LLM call goes through `executePersona(persona, userMessage)` in `persona-executor.ts`. Each persona is a `PersonaDefinition` with:
- `outputMode: 'text'` — streaming tokens flow to SSE
- `outputMode: 'structured'` — LLM returns JSON parsed against a Zod schema, no streaming

Personas live in `server/src/langgraph/personas/*.persona.ts` — one per node role. The persona executor handles the `withStructuredOutput` fallback (prompt-based JSON extraction instead of function calling, to avoid DeepSeek thinking-mode errors).

### SSE Protocol
Events streamed from server to client: `status`, `token`, `token_end`, `message`, `evaluation`, `stage`, `done`, `error`. The frontend Pinia store (`interview.ts`) parses each event type:
- `token`/`token_end` — streaming LLM output with incremental append to last message
- `message` — complete message (used for non-streaming nodes like tech_select)
- `evaluation` — scored evaluation after each answer
- `stage` — current interview stage change
- `done` — final report

### State Persistence (3-tier fallback)
1. **MemorySaver** (primary) — LangGraph's in-memory checkpointer
2. **Redis** (TTL 24h) — backup via `saveStateToRedis`/`loadStateFromRedis`
3. **DB `stateJson` column** — final fallback, written on every interrupt/error

On resume, `getInterviewState` tries all three in order. The Interview model carries `threadId` (unique per interview) as the LangGraph thread identifier.

### Resume Parsing Dedup
`getOrStartResumeParse(threadId, fn)` in `llm.ts` ensures the resume LLM call runs exactly once — the async pre-warming in `streamStart` and the synchronous call in `parse_resume` node share the same Promise. After completion, the resolved value is cached for subsequent callers.

### Timer Protocol
LLM outputs `[time] N` (e.g., `[time] 240`) to set a question countdown timer. The frontend `timer.ts` composaable parses this with `tryStartTimer(text)`. Difficulty→seconds mapping: 1→120, 2→180, 3→240, 4→300, 5→420.

### Thinking Mode Compatibility
DeepSeek v4-pro `thinking` mode doesn't support `tool_choice` (required by LangChain's `withStructuredOutput`). The codebase works around this:
- All structured outputs use prompt-based JSON extraction (`zodToJsonTemplate`) instead of function calling
- Knowledge search uses raw SQL (`$queryRawUnsafe`) instead of `bindTools` vector search
