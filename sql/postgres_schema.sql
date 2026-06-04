create extension if not exists pgcrypto;

create table if not exists ingestion_runs (
  ingestion_run_id uuid primary key default gen_random_uuid(),
  snapshot_name text not null,
  source_path text not null,
  source_hash text not null,
  status text not null check (status in ('started', 'completed', 'failed', 'partial')),
  rows_received integer not null default 0,
  rows_loaded integer not null default 0,
  rows_rejected integer not null default 0,
  quality_summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ix_ingestion_runs_started_at on ingestion_runs(started_at desc);

create table if not exists funds (
  fund_id text primary key,
  fund_name text not null,
  category text not null,
  snapshot_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_funds_name on funds using gin (to_tsvector('simple', fund_name));

create table if not exists fund_navs (
  fund_id text not null references funds(fund_id) on delete cascade,
  nav_date date not null,
  nav numeric(18,4) not null check (nav > 0),
  snapshot_name text not null,
  created_at timestamptz not null default now(),
  primary key (fund_id, nav_date)
);

create index if not exists ix_fund_navs_nav_date on fund_navs(nav_date);

create table if not exists holdings (
  holding_id uuid primary key default gen_random_uuid(),
  fund_id text not null references funds(fund_id) on delete cascade,
  fund_name text not null,
  units numeric(18,4) not null check (units > 0),
  purchase_date date not null,
  purchase_nav numeric(18,4) not null check (purchase_nav > 0),
  snapshot_name text not null,
  created_at timestamptz not null default now(),
  unique (fund_id, purchase_date, purchase_nav, units, snapshot_name)
);

create table if not exists merchant_aliases (
  merchant_key text primary key,
  canonical_merchant text not null,
  example_raw_merchant text not null,
  occurrence_count integer not null default 1,
  confidence_score numeric(5,4) not null,
  normalization_method text not null,
  snapshot_name text not null,
  updated_at timestamptz not null default now()
);

create index if not exists ix_merchant_aliases_canonical on merchant_aliases(canonical_merchant);

create table if not exists transactions (
  transaction_id text primary key,
  transaction_date date not null,
  raw_merchant text not null,
  merchant_key text not null,
  canonical_merchant text not null,
  category text not null,
  amount numeric(18,2) not null,
  spend_amount numeric(18,2) not null,
  currency char(3) not null,
  memo text,
  is_refund boolean not null default false,
  is_transfer boolean not null default false,
  is_recurring_candidate boolean not null default false,
  fingerprint text not null unique,
  ingestion_run_id uuid not null references ingestion_runs(ingestion_run_id),
  snapshot_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_transactions_date on transactions(transaction_date);
create index if not exists ix_transactions_category_date on transactions(category, transaction_date);
create index if not exists ix_transactions_merchant_date on transactions(canonical_merchant, transaction_date);
create index if not exists ix_transactions_flags_date on transactions(is_transfer, is_refund, transaction_date);
create index if not exists ix_transactions_merchant_key on transactions(merchant_key);

create table if not exists agent_logs (
  agent_log_id uuid primary key default gen_random_uuid(),
  request_id text unique not null,
  question text not null,
  intent text,
  answer text,
  status text not null,
  latency_ms numeric(12,2),
  fallback_reason text,
  created_at timestamptz not null default now()
);

create index if not exists ix_agent_logs_created_at on agent_logs(created_at desc);

create table if not exists tool_executions (
  tool_execution_id uuid primary key default gen_random_uuid(),
  agent_log_id uuid references agent_logs(agent_log_id) on delete cascade,
  request_id text not null,
  tool_name text not null,
  input_payload jsonb not null,
  output_summary jsonb,
  status text not null,
  latency_ms numeric(12,2),
  error_type text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ix_tool_executions_request on tool_executions(request_id);
create index if not exists ix_tool_executions_tool_created_at on tool_executions(tool_name, created_at desc);

create table if not exists evaluation_results (
  evaluation_result_id uuid primary key default gen_random_uuid(),
  test_case_id text not null,
  category text not null,
  question text not null,
  expected text not null,
  actual text not null,
  passed boolean not null,
  score numeric(5,2) not null,
  failure_reason text,
  created_at timestamptz not null default now()
);

