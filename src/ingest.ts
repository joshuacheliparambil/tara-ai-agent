import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { FundJson, HoldingJson, TransactionJson } from "./types.js";
import { normalizeMerchant, normalizeTransaction } from "./quality.js";

export type SnapshotPayload = {
  snapshotName: string;
  transactions: TransactionJson[];
  funds: FundJson[];
  holdings: HoldingJson[];
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function hashPayload(payload: SnapshotPayload): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([payload.transactions, payload.funds, payload.holdings]))
    .digest("hex");
}

function validatePayload(payload: SnapshotPayload): void {
  if (!payload.snapshotName.trim()) throw new Error("snapshotName is required");
  if (!Array.isArray(payload.transactions) || !Array.isArray(payload.funds) || !Array.isArray(payload.holdings)) {
    throw new Error("transactions, funds, and holdings must be JSON arrays");
  }
  if (payload.transactions.length === 0) throw new Error("transactions.json contains no rows");
  if (payload.funds.length === 0) throw new Error("funds.json contains no rows");

  for (const txn of payload.transactions) {
    if (!txn.id || !txn.date || !txn.merchant || typeof txn.amount !== "number" || !txn.currency) {
      throw new Error("Every transaction requires id, date, merchant, amount, and currency");
    }
  }
  for (const fund of payload.funds) {
    if (!fund.id || !fund.name || !Array.isArray(fund.nav)) {
      throw new Error("Every fund requires id, name, category, and a nav array");
    }
  }
}

export async function ingestSnapshot(
  client: pg.PoolClient,
  snapshotDir: string,
  replaceExisting = true,
): Promise<Record<string, unknown>> {
  const payload: SnapshotPayload = {
    snapshotName: path.basename(path.resolve(snapshotDir)),
    transactions: readJson<TransactionJson[]>(path.join(snapshotDir, "transactions.json")),
    funds: readJson<FundJson[]>(path.join(snapshotDir, "funds.json")),
    holdings: readJson<HoldingJson[]>(path.join(snapshotDir, "holdings.json")),
  };
  return ingestSnapshotPayload(client, payload, {
    sourcePath: path.resolve(snapshotDir),
    replaceExisting,
  });
}

export async function ingestSnapshotPayload(
  client: pg.PoolClient,
  payload: SnapshotPayload,
  options: { sourcePath?: string; replaceExisting?: boolean } = {},
): Promise<Record<string, unknown>> {
  validatePayload(payload);
  const snapshotName = payload.snapshotName.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
  const sourceHash = hashPayload(payload);
  const replaceExisting = options.replaceExisting ?? true;

  if (replaceExisting) {
    await client.query(`
      truncate table
        evaluation_results,
        tool_executions,
        agent_logs,
        transactions,
        merchant_aliases,
        holdings,
        fund_navs,
        funds,
        ingestion_runs
      restart identity cascade
    `);
  }

  const run = await client.query<{ ingestion_run_id: string }>(
    `
    insert into ingestion_runs (snapshot_name, source_path, source_hash, status, rows_received)
    values ($1, $2, $3, 'started', $4)
    returning ingestion_run_id
    `,
    [
      snapshotName,
      options.sourcePath ?? "browser_upload",
      sourceHash,
      payload.transactions.length + payload.funds.length + payload.holdings.length,
    ],
  );
  const ingestionRunId = run.rows[0].ingestion_run_id;

  try {
    const normalizedTransactions = payload.transactions.map((transaction) => {
      const normalized = normalizeTransaction(transaction, snapshotName);
      return {
        transaction_id: `${snapshotName}:${transaction.id}`,
        transaction_date: transaction.date,
        raw_merchant: transaction.merchant,
        merchant_key: normalized.merchantKey,
        canonical_merchant: normalized.canonicalMerchant,
        category: normalized.category,
        amount: transaction.amount,
        spend_amount: normalized.spendAmount,
        currency: transaction.currency.toUpperCase(),
        memo: transaction.memo ?? null,
        is_refund: normalized.isRefund,
        is_transfer: normalized.isTransfer,
        is_recurring_candidate: normalized.isRecurringCandidate,
        fingerprint: normalized.fingerprint,
      };
    });

    const fundRows = payload.funds.map((fund) => ({
      fund_id: `${snapshotName}:${fund.id}`,
      source_fund_id: fund.id,
      fund_name: fund.name,
      category: fund.category || "uncategorized",
    }));
    const fundIdMap = new Map(fundRows.map((fund) => [fund.source_fund_id, fund.fund_id]));
    const navRows = payload.funds.flatMap((fund) =>
      fund.nav.map((nav) => ({
        fund_id: fundIdMap.get(fund.id),
        nav_date: nav.date,
        nav: nav.value,
      })),
    );
    const holdingRows = payload.holdings.map((holding) => ({
      fund_id: fundIdMap.get(holding.fund_id),
      fund_name: holding.fund_name,
      units: holding.units,
      purchase_date: holding.purchase_date,
      purchase_nav: holding.purchase_nav,
    }));

    await client.query(
      `
      insert into funds (fund_id, fund_name, category, snapshot_name)
      select x.fund_id, x.fund_name, x.category, $2
      from jsonb_to_recordset($1::jsonb) as x(fund_id text, fund_name text, category text)
      on conflict (fund_id) do update set
        fund_name = excluded.fund_name,
        category = excluded.category,
        snapshot_name = excluded.snapshot_name
      `,
      [JSON.stringify(fundRows), snapshotName],
    );

    await client.query(
      `
      insert into fund_navs (fund_id, nav_date, nav, snapshot_name)
      select x.fund_id, x.nav_date::date, x.nav, $2
      from jsonb_to_recordset($1::jsonb) as x(fund_id text, nav_date text, nav numeric)
      where x.fund_id is not null and x.nav > 0
      on conflict (fund_id, nav_date) do update set
        nav = excluded.nav,
        snapshot_name = excluded.snapshot_name
      `,
      [JSON.stringify(navRows), snapshotName],
    );

    await client.query(
      `
      insert into holdings (fund_id, fund_name, units, purchase_date, purchase_nav, snapshot_name)
      select x.fund_id, x.fund_name, x.units, x.purchase_date::date, x.purchase_nav, $2
      from jsonb_to_recordset($1::jsonb) as x(
        fund_id text, fund_name text, units numeric, purchase_date text, purchase_nav numeric
      )
      where x.fund_id is not null and x.units > 0 and x.purchase_nav > 0
      on conflict (fund_id, purchase_date, purchase_nav, units, snapshot_name) do nothing
      `,
      [JSON.stringify(holdingRows), snapshotName],
    );

    await client.query(
      `
      insert into transactions (
        transaction_id, transaction_date, raw_merchant, merchant_key, canonical_merchant,
        category, amount, spend_amount, currency, memo, is_refund, is_transfer,
        is_recurring_candidate, fingerprint, ingestion_run_id, snapshot_name
      )
      select
        x.transaction_id, x.transaction_date::date, x.raw_merchant, x.merchant_key,
        x.canonical_merchant, x.category, x.amount, x.spend_amount, x.currency,
        x.memo, x.is_refund, x.is_transfer, x.is_recurring_candidate,
        x.fingerprint, $2::uuid, $3
      from jsonb_to_recordset($1::jsonb) as x(
        transaction_id text, transaction_date text, raw_merchant text, merchant_key text,
        canonical_merchant text, category text, amount numeric, spend_amount numeric,
        currency text, memo text, is_refund boolean, is_transfer boolean,
        is_recurring_candidate boolean, fingerprint text
      )
      on conflict (fingerprint) do nothing
      `,
      [JSON.stringify(normalizedTransactions), ingestionRunId, snapshotName],
    );

    const merchantCounts = new Map<string, { canonical: string; raw: string; confidence: number; count: number }>();
    for (const transaction of payload.transactions) {
      const alias = normalizeMerchant(transaction.merchant, transaction.memo ?? "");
      const current = merchantCounts.get(alias.key);
      merchantCounts.set(alias.key, {
        canonical: alias.canonical,
        raw: transaction.merchant,
        confidence: alias.confidence,
        count: (current?.count ?? 0) + 1,
      });
    }
    const aliasRows = [...merchantCounts].map(([merchantKey, alias]) => ({
      merchant_key: merchantKey,
      canonical_merchant: alias.canonical,
      example_raw_merchant: alias.raw,
      occurrence_count: alias.count,
      confidence_score: alias.confidence,
    }));
    await client.query(
      `
      insert into merchant_aliases (
        merchant_key, canonical_merchant, example_raw_merchant, occurrence_count,
        confidence_score, normalization_method, snapshot_name
      )
      select
        x.merchant_key, x.canonical_merchant, x.example_raw_merchant,
        x.occurrence_count, x.confidence_score, 'token_canonicalization', $2
      from jsonb_to_recordset($1::jsonb) as x(
        merchant_key text, canonical_merchant text, example_raw_merchant text,
        occurrence_count integer, confidence_score numeric
      )
      on conflict (merchant_key) do update set
        canonical_merchant = excluded.canonical_merchant,
        example_raw_merchant = excluded.example_raw_merchant,
        occurrence_count = excluded.occurrence_count,
        confidence_score = excluded.confidence_score,
        snapshot_name = excluded.snapshot_name,
        updated_at = now()
      `,
      [JSON.stringify(aliasRows), snapshotName],
    );

    const rowsLoaded = normalizedTransactions.length + fundRows.length + holdingRows.length + navRows.length;
    const qualitySummary = {
      merchant_aliases: merchantCounts.size,
      refund_rows: normalizedTransactions.filter((txn) => txn.is_refund).length,
      transfer_rows: normalizedTransactions.filter((txn) => txn.is_transfer).length,
      date_start: normalizedTransactions.reduce((min, txn) => (txn.transaction_date < min ? txn.transaction_date : min), normalizedTransactions[0].transaction_date),
      date_end: normalizedTransactions.reduce((max, txn) => (txn.transaction_date > max ? txn.transaction_date : max), normalizedTransactions[0].transaction_date),
    };

    await client.query(
      `
      update ingestion_runs
      set status = 'completed', rows_loaded = $2, rows_rejected = 0,
          quality_summary = $3::jsonb, completed_at = now()
      where ingestion_run_id = $1
      `,
      [ingestionRunId, rowsLoaded, JSON.stringify(qualitySummary)],
    );

    return {
      status: "completed",
      snapshotName,
      ingestionRunId,
      transactions: normalizedTransactions.length,
      funds: fundRows.length,
      holdings: holdingRows.length,
      navPoints: navRows.length,
      rowsLoaded,
    };
  } catch (error) {
    await client.query(
      "update ingestion_runs set status = 'failed', error_message = $2, completed_at = now() where ingestion_run_id = $1",
      [ingestionRunId, error instanceof Error ? error.message : String(error)],
    );
    throw error;
  }
}
