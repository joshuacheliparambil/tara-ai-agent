# Tara Design Notes

## Assignment Alignment

The Provue contract is a finance-research persona with:

- Postgres as the storage layer.
- JSON snapshots ingested before serving questions.
- Tools that query the database rather than files.
- A single `POST /ask` HTTP endpoint returning JSON.
- Deterministic, grounded math.
- Evals and observability.

This implementation optimizes for correctness and reliability first. The default `/ask` path uses a deterministic planner over governed tools so repeated hidden-test questions return stable numbers. A Mastra `Agent` and `createTool` definitions are included in `src/mastra.ts` for provider-backed tool calling, but the production HTTP path keeps math and tool selection deterministic unless you explicitly wire the LLM path.

## Schema

Tables:

- `ingestion_runs`: snapshot-level audit, source hash, row counts, quality summary.
- `transactions`: normalized transaction fact table with refund, transfer, recurring, merchant alias, and fingerprint fields.
- `merchant_aliases`: reusable canonical merchant keys inferred from raw merchant and memo text.
- `funds`: fund dimension.
- `fund_navs`: monthly NAV time series.
- `holdings`: user-owned fund positions.
- `agent_logs`: request-level traces.
- `tool_executions`: tool-level traces.
- `evaluation_results`: eval history.

Indexes focus on expected filters:

- Date range filtering.
- Category/date filtering.
- Merchant/date filtering.
- Fund/date NAV lookups.
- Tool and request tracing.

## Metric Semantics

Spend:

- Source amounts are treated as INR amounts.
- Positive amounts are spend.
- Negative amounts are refunds/reversals and reduce net spend.
- Transfers are excluded from spend metrics unless explicitly included.
- Uncategorized rows remain queryable; they are not silently dropped.

Fund period return:

- `(end_nav - start_nav) / start_nav`.
- NAV is selected as the latest NAV on or before each requested date.

Holding realised return:

- Uses the user's purchase NAV and latest available NAV.
- Cost basis is `units * purchase_nav`.
- Current value is `units * latest_nav`.
- Gain is current value minus cost basis.

Portfolio value:

- Sum of latest value across all holdings.
- Realised aggregate return uses total current value versus total cost basis.

## Merchant Normalization

The system does not hardcode sample merchants. It canonicalizes raw merchant strings by:

- Uppercasing and stripping noisy punctuation/digits.
- Removing payment/location/legal filler tokens.
- Building a stable `merchant_key` from the remaining leading tokens.
- Storing examples in `merchant_aliases`.

This handles families such as `SWIGGY*ORDER`, `Swiggy Instamart`, and city-suffixed variants without exact-value coupling.

## Tool Design

Tools are intentionally few and expressive:

- `query_transactions`
- `detect_recurring_transactions`
- `compute_fund_returns`
- `compute_holding_returns`
- `portfolio_value`

This matches the assignment guidance: fewer powerful tools reduce overlap, token cost, and bad tool selection.

## Grounding Guarantee

Every numeric answer comes from a tool call. Tool calls run SQL against Postgres. Tara's response renderer only formats returned rows; it does not invent totals or compute hidden math in prose.

## Observability

Every `/ask` request writes:

- `agent_logs` row.
- one or more `tool_executions` rows.
- NDJSON trace line in `TRACE_FILE`.

Each tool execution records sanitized input, summarized output, latency, success/failure, and error reason.

## Async Milestone

The long-running async milestone is not implemented in this first version. All current tools are bounded SQL aggregations over small snapshot data and should complete well under one second with indexes. If this grew to external market data calls or large multi-account portfolios, I would add a persisted `jobs` table and background worker with `running` and `completed` job states.

## Known Limitations

- The deterministic planner covers the assignment's expected question families, not arbitrary conversation.
- The Mastra agent is provided as the LLM integration point, but `/ask` defaults to deterministic routing for reliability.
- Merchant normalization is algorithmic but intentionally conservative; a human review workflow would improve edge aliases.
- Deployment still requires setting `DATABASE_URL` and running migration plus ingest on the host.

