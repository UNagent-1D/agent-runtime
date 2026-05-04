# AGENTS.md — agent-runtime

TypeScript / Express 5 service that acts as:

1. **ACR stub** — serves active agent config to `conversation-chat`
2. **Tenant stub** — serves tenant/profile/data-source metadata
3. **Session/turn proxy** — adapts `chat-orch`'s thin HTTP payloads to
   `conversation-chat`'s full request shapes
4. **Async job dispatcher** — publishes chat jobs to RabbitMQ and holds
   long-poll result connections for `chat-orch`

---

## Build & Run

```bash
npm install
npm run dev          # ts-node --esm src/index.ts
```

Required env vars:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3100` | Listen port |
| `CONVERSATION_CHAT_URL` | `http://conversation-chat:8082` | Upstream for proxy routes |
| `HOSPITAL_MOCK_URL` | `http://hospital-mock:8080` | Data-source base URL |
| `RABBITMQ_URL` | unset | AMQP connection string; broker features disabled if absent |
| `OPENAI_DEFAULT_MODEL` | (see agents/hospital.ts) | Overrides model in ACR response |

---

## Route map

| Method | Path | Handler | Purpose |
|---|---|---|---|
| GET | `/health` | health.ts | Liveness check |
| GET | `/api/v1/tenants/:t/profiles/:p/configs/active` | acr.ts | ACR config for conversation-chat |
| GET | `/api/v1/tenants/:t` | tenant-stub.ts | Tenant metadata |
| GET | `/api/v1/tenants/:t/profiles` | tenant-stub.ts | Profile list |
| GET | `/api/v1/tenants/:t/data-sources` | tenant-stub.ts | Data-source + tool routes |
| POST | `/api/v1/sessions` | proxy.ts | Create session (proxied to conversation-chat) |
| POST | `/api/v1/sessions/:sid/turns` | proxy.ts | Process turn (proxied to conversation-chat) |
| POST | `/api/v1/jobs` | **jobs.ts** | Submit async chat job |
| GET | `/api/v1/jobs/:job_id/wait` | **jobs.ts** | Long-poll for job result |

---

## Job API (async flow)

### POST /api/v1/jobs

Publishes a job to the `chat_requests` RabbitMQ queue and returns
immediately with a `job_id`.

**Request body:**
```json
{
  "session_id": "sess_abc...",
  "message":    "user text",
  "chat_id":    123456789,
  "tenant_id":  "demo-tenant"
}
```

**Response 200:**
```json
{ "job_id": "b3d1a4c2-..." }
```

### GET /api/v1/jobs/:job_id/wait?timeout=\<ms\>

Holds the HTTP connection open until the result for `job_id` arrives on
the `chat_results` queue, or until `timeout` milliseconds elapse
(default 30 000, max 120 000).

**Response 200** (result ready):
```json
{ "text": "LLM reply", "session_id": "sess_abc..." }
```

**Response 408** (timed out):
```json
{ "error": "timeout" }
```

---

## Broker module (`src/broker/`)

### connection.ts

Singleton `amqplib` channel. Connects lazily on first use. Asserts both
queues as durable. Clears the cached channel on connection close so the
next call reconnects automatically.

### jobs.ts

In-memory `Map<job_id, PendingJob>` that bridges the HTTP long-poll to the
AMQP consumer:

- `registerJob(id)` — allocates a slot before publishing (no race)
- `publishJob(job)` — serialises and sends to `chat_requests`
- `startResultConsumer()` — subscribes to `chat_results`; calls
  `resolveJob()` for each message
- `resolveJob(id, result)` — resolves the pending Promise, or stores the
  result if no waiter has called `waitForJob()` yet
- `waitForJob(id, ms)` — returns a Promise that resolves with the result
  or `null` on timeout

**Note:** the in-memory store is per-process. A container restart drops
all pending jobs. Callers (chat-orch) send the "working…" message and
then open a second long-poll, so users still get their reply after a
restart if conversation-chat finishes and re-publishes the result.

---

## Common tasks

- **Add a new agent profile:** create `src/agents/<name>.ts`, import
  in `src/registry.ts`, update `getProfile()` to do a real map lookup.
- **Change the hospital system prompt / tools:** edit
  `src/agents/hospital.ts`.
- **Add a new tenant-stub endpoint:** add a route in
  `src/routes/tenant-stub.ts`.
