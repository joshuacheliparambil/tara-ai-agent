import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { FundJson, HoldingJson, TransactionJson } from "./types.js";
import { normalizeMerchant, normalizeTransaction } from "./quality.js";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function hashSnapshot(snapshotDir: string): string {
  const hash = crypto.createHash("sha256");
  for (const file of ["transactions.json", "funds.json", "holdings.json"]) {
    hash.update(fs.readFileSync(path.join(snapshotDir, file)));
  }
  return hash.digest("hex");
}

export async function ingestSnapshot(client: pg.PoolClient, snapshotDir: string): Promise<Record<string, unknown>> {
  const snapshotName = path.basename(path.resolve(snapshotDir));
  const sourceHash = hashSnapshot(snapshotDir);
  const transactions = readJson<TransactionJson[]>(path.join(snapshotDir, "transactions.json"));
  const funds = readJson<FundJson[]>(path.join(snapshotDir, "funds.json"));
  const holdings = readJson<HoldingJson[]>(path.join(snapshotDir, "holdings.json"));

  const run = await client.query<{ ingestion_run_id: string }>(
    `
    insert into ingestion_runs (snapshot_name, source_path, source_hash, status, rows_received)
    values ($1, $2, $3, 'started', $4)
    returning ingestion_run_id
    `,
    [snapshotName, path.resolve(snapshotDir), sourceHash, transactions.length + funds.length + holdings.length],
  );
  const ingestionRunId = run.rows[0].ingestion_run_id;

  let rowsLoaded = 0;
  let rowsRejected = 0;
  const merchantCounts = new Map<string, { canonical: string; raw: string; confidence: number; count: number }>();

  try {
    for (const fund of funds) {
      await client.query(
        `
        insert into funds (fund_id, fund_name, category, snapshot_name)
        values ($1, $2, $3, $4)
        on conflict (fund_id) do update set
          fund_name = excluded.fund_name,
          category = excluded.category,
          snapshot_name = excluded.snapshot_name
        `,
        [fund.id, fund.name, fund.category, snapshotName],
      );
      rowsLoaded += 1;

      for (const nav of fund.nav) {
        await client.query(
          `
          insert into fund_navs (fund_id, nav_date, nav, snapshot_name)
          values ($1, $2, $3, $4)
          on conflict (fund_id, nav_date) do update set
            nav = excluded.nav,
            snapshot_name = excluded.snapshot_name
          `,
          [fund.id, nav.date, nav.value, snapshotName],
        );
      }
    }

    for (const holding of holdings) {
      await client.query(
        `
        insert into holdings (fund_id, fund_name, units, purchase_date, purchase_nav, snapshot_name)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (fund_id, purchase_date, purchase_nav, units, snapshot_name) do nothing
        `,
        [holding.fund_id, holding.fund_name, holding.units, holding.purchase_date, holding.purchase_nav, snapshotName],
      );
      rowsLoaded += 1;
    }

    for (const transaction of transactions) {
      try {
        const normalized = normalizeTransaction(transaction, snapshotName);
        const alias = normalizeMerchant(transaction.merchant, transaction.memo ?? "");
        const current = merchantCounts.get(alias.key);
        merchantCounts.set(alias.key, {
          canonical: alias.canonical,
          raw: transaction.merchant,
          confidence: alias.confidence,
          count: (current?.count ?? 0) + 1,
        });

        await client.query(
          `
          insert into transactions (
            transaction_id, transaction_date, raw_merchant, merchant_key, canonical_merchant,
            category, amount, spend_amount, currency, memo, is_refund, is_transfer,
            is_recurring_candidate, fingerprint, ingestion_run_id, snapshot_name
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          on conflict (fingerprint) do nothing
          `,
          [
            transaction.id,
            transaction.date,
            transaction.merchant,
            normalized.merchantKey,
            normalized.canonicalMerchant,
            normalized.category,
            transaction.amount,
            normalized.spendAmount,
            transaction.currency,
            transaction.memo ?? null,
            normalized.isRefund,
            normalized.isTransfer,
            normalized.isRecurringCandidate,
            normalized.fingerprint,
            ingestionRunId,
            snapshotName,
          ],
        );
        rowsLoaded += 1;
      } catch {
        rowsRejected += 1;
      }
    }

    for (const [key, alias] of merchantCounts) {
      await client.query(
        `
        insert into merchant_aliases (
          merchant_key, canonical_merchant, example_raw_merchant, occurrence_count,
          confidence_score, normalization_method, snapshot_name
        ) values ($1, $2, $3, $4, $5, 'token_canonicalization', $6)
        on conflict (merchant_key) do update set
          canonical_merchant = excluded.canonical_merchant,
          occurrence_count = merchant_aliases.occurrence_count + excluded.occurrence_count,
          confidence_score = greatest(merchant_aliases.confidence_score, excluded.confidence_score),
          updated_at = now()
        `,
        [key, alias.canonical, alias.raw, alias.count, alias.confidence, snapshotName],
      );
    }

    const status = rowsRejected > 0 ? "partial" : "completed";
    await client.query(
      `
      update ingestion_runs
      set status = $2, rows_loaded = $3, rows_rejected = $4,
          quality_summary = $5::jsonb, completed_at = now()
      where ingestion_run_id = $1
      `,
      [
        ingestionRunId,
        status,
        rowsLoaded,
        rowsRejected,
        JSON.stringify({
          merchant_aliases: merchantCounts.size,
          refund_rows: transactions.filter((txn) => txn.amount < 0).length,
          transfer_candidates: transactions.filter((txn) => /transfer|self|brokerage/i.test(`${txn.merchant} ${txn.memo ?? ""}`)).length,
        }),
      ],
    );

    return { status, snapshotName, ingestionRunId, rowsLoaded, rowsRejected };
  } catch (error) {
    await client.query(
      "update ingestion_runs set status = 'failed', error_message = $2, completed_at = now() where ingestion_run_id = $1",
      [ingestionRunId, error instanceof Error ? error.message : String(error)],
    );
    throw error;
  }
}

