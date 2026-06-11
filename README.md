# Tara AI Agent

Finance-research persona for the Provue engineering assignment.

Tara answers natural-language questions about spending, merchant aliases, refunds, transfers, mutual fund NAV returns, holding realised returns, and portfolio value. The system is built as a small production-style analytics platform: JSON snapshots are ingested into Postgres, tools query the database, and every `/ask` request is logged with tool traces.

## Demo Contract

```http
POST /ask
Content-Type: application/json

{ "question": "How much did I spend on food in March 2025 after refunds?" }
```

Response:

```json
{
  "answer": "Your refund-adjusted spend for food from 2025-03-01 to 2025-03-31 was INR ..."
}
```

## Why This Is More Than A Chatbot

- Postgres schema with indexes, foreign keys, ingestion audit, tool traces, and eval history.
- Snapshot ingestion script that accepts any `data/sample_*` folder with `transactions.json`, `funds.json`, and `holdings.json`.
- Governed tools for math. Tara does not calculate or invent figures in prose.
- Deterministic `/ask` planner for reliability under repeated hidden tests.
- Mastra-compatible agent and `createTool` definitions in `src/mastra.ts` for model-backed tool calling.
- Evaluation suite with 12 assignment-relevant cases.
- NDJSON trace file plus database logs for observability.

## Architecture

```mermaid
flowchart LR
  A["data/sample_* JSON snapshot"] --> B["scripts/ingest.ts"]
  B --> C["Postgres tables"]
  C --> D["Analytics SQL layer"]
  D --> E["Governed tools"]
  E --> F["Tara planner / Mastra agent"]
  F --> G["POST /ask JSON answer"]
  F --> H["agent_logs"]
  E --> I["tool_executions"]
  F --> J["trace.ndjson"]
  K["scripts/eval.ts"] --> G
  K --> L["evaluation_results"]
```

## Tech Stack

- TypeScript
- Express
- Postgres 14+
- `pg`
- Zod
- Mastra SDK tool definitions
- OpenAI adapter for optional provider-backed Mastra agent

## Setup

Install dependencies:

```bash
npm install
```

Create `.env`:

```bash
cp .env.example .env
```

Set at minimum:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/provue_tara
PORT=3000
DEFAULT_DATA_DIR=./data/sample_a
TRACE_FILE=./trace.ndjson
```

Create the database:

```bash
createdb provue_tara
```

Run migration:

```bash
npm run db:migrate
```

Ingest one snapshot:

```bash
DATA_DIR=./data/sample_a npm run ingest
```

You can swap in any provided snapshot:

```bash
DATA_DIR=./data/sample_b npm run ingest
DATA_DIR=./data/sample_c npm run ingest
```

Start the server:

```bash
npm run dev
```

Ask Tara:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What were my top 5 merchants by net spend between January and March 2025?\"}"
```

Run evals:

```bash
npm run eval
```

The eval script calls `http://localhost:3000/ask` by default, so keep the server running in another terminal. For a direct local agent smoke test without HTTP:

```bash
npm run test
```

## Example Questions

- How much did I spend on food in March 2025 after refunds?
- What were my top 5 merchants by net spend between January and March 2025?
- Compare my food and travel spending month by month.
- Which transactions look like recurring subscriptions?
- Do I have any data for rent in April 2025?
- What was Saffron Bluechip Equity Fund's return from 2024-01-01 to 2025-01-01?
- Rank all funds by one-year return between 2024-01-01 and 2025-01-01, and show the spread between best and worst.
- What is my realised return on my Sentinel Nifty Index Fund holding, given when I bought it?
- What is my portfolio worth today, and how much have I made on it in absolute INR?

## Uploading A Dataset From The UI

Open `http://localhost:3000/` and use **Dataset Manager** in the sidebar.

Select these three files together:

- `transactions.json`
- `funds.json`
- `holdings.json`

Tara validates the JSON, replaces the active demo snapshot, normalizes the data, performs batched PostgreSQL inserts, and refreshes dataset-specific question suggestions. Uploaded financial data is sent only to the locally running Tara server and configured PostgreSQL database.

The question chips are generated from the active dataset's categories, merchants, funds, and available date range. The 12-question eval suite remains a regression test; it is not a limit on what the chat accepts.

## Signup, Login, And Guest Mode

The entry screen offers:

- **Sign up** with display name, email, and password.
- **Log in** to a previously created local demo account.
- **Continue as Guest** without creating an account.

Tara greets the active profile by name. Demo accounts and sessions are stored in browser `localStorage`; passwords are stored only as SHA-256 hashes. This is suitable for a portfolio demo, not production authentication. A production version should use Clerk, Auth0, Supabase Auth, or another managed identity provider.

## Tool Design

Tara uses five expressive tools:

- `query_transactions`: totals, averages, top merchants, category breakdowns, month breakdowns, category comparisons, biggest expense.
- `detect_recurring_transactions`: recurring subscription-like merchants.
- `compute_fund_returns`: NAV-based fund period returns and rankings.
- `compute_holding_returns`: user-specific realised returns.
- `portfolio_value`: aggregate value, cost basis, gain, and return.

This follows Provue's guidance to prefer fewer powerful tools over many narrow overlapping tools.

## Observability

Inspect:

- `agent_logs` for every `/ask` request.
- `tool_executions` for each grounded tool call.
- `evaluation_results` for eval history.
- `trace.ndjson` for lightweight local traces.

Example trace shape:

```json
{
  "timestamp": "2026-06-04T10:30:00.000Z",
  "service": "tara-ai-agent",
  "request_id": "req_...",
  "event_type": "ask_completed",
  "status": "success",
  "tools_called": ["query_transactions"]
}
```

## Deployment

Recommended:

- App: Render or Railway.
- Database: Neon, Supabase, Render Postgres, or Railway Postgres.

Deployment steps:

1. Provision hosted Postgres.
2. Set `DATABASE_URL`, `PORT`, `TRACE_FILE`, and optionally `OPENAI_API_KEY`.
3. Run `npm run db:migrate`.
4. Run `DATA_DIR=./data/sample_a npm run ingest` or ingest the deployment snapshot.
5. Deploy the web service with `npm run build && npm start`.

Known free-tier tradeoffs:

- Render web services may cold start.
- Neon/Supabase free tiers may pause or limit compute.
- Eval results and traces are intentionally lightweight.

### Vercel

The repository includes:

- `api/index.ts`: Vercel serverless Express handler.
- `vercel.json`: routes all requests through Tara's Express application.
- `vercel-build`: TypeScript build script.

Deployment steps:

1. Push the repository to GitHub.
2. Import `joshuacheliparambil/tara-ai-agent` in Vercel.
3. Add a managed PostgreSQL database using Neon or Supabase.
4. Add this Vercel environment variable:

```text
DATABASE_URL=postgresql://...
```

5. From your computer, temporarily set the hosted `DATABASE_URL`, then run:

```bash
npm run db:migrate
DATA_DIR=./data/sample_a npm run ingest
```

6. Deploy or redeploy the Vercel project.

The browser dataset uploader can replace the active snapshot after deployment. The provided sample snapshots are small enough for the serverless request size, but very large datasets should use object storage and background ingestion.

## Design Notes

See [DESIGN.md](./DESIGN.md) for schema decisions, metric definitions, grounding guarantees, observability, async milestone decision, and failure modes.
