import { query } from "./db.js";

export type DatasetMetadata = {
  snapshotName: string | null;
  transactionCount: number;
  fundCount: number;
  holdingCount: number;
  merchantCount: number;
  categories: string[];
  merchants: string[];
  funds: string[];
  dateStart: string | null;
  dateEnd: string | null;
  currency: string | null;
};

let metadataCache: { expiresAt: number; value: DatasetMetadata } | null = null;

export function clearMetadataCache(): void {
  metadataCache = null;
}

export async function getDatasetMetadata(): Promise<DatasetMetadata> {
  if (metadataCache && metadataCache.expiresAt > Date.now()) return metadataCache.value;

  const [summary] = await query<{
    snapshot_name: string | null;
    transaction_count: string;
    fund_count: string;
    holding_count: string;
    merchant_count: string;
    date_start: string | null;
    date_end: string | null;
    currency: string | null;
  }>(`
    select
      (select snapshot_name from ingestion_runs where status = 'completed' order by completed_at desc limit 1) as snapshot_name,
      (select count(*) from transactions) as transaction_count,
      (select count(*) from funds) as fund_count,
      (select count(*) from holdings) as holding_count,
      (select count(distinct canonical_merchant) from transactions) as merchant_count,
      (select min(transaction_date)::text from transactions) as date_start,
      (select max(transaction_date)::text from transactions) as date_end,
      (select max(currency) from transactions) as currency
  `);

  const categories = await query<{ category: string }>(
    "select distinct category from transactions where category is not null order by category",
  );
  const merchants = await query<{ canonical_merchant: string }>(
    "select canonical_merchant from transactions group by canonical_merchant order by sum(spend_amount) desc limit 30",
  );
  const funds = await query<{ fund_name: string }>("select fund_name from funds order by fund_name");

  const value: DatasetMetadata = {
    snapshotName: summary?.snapshot_name ?? null,
    transactionCount: Number(summary?.transaction_count ?? 0),
    fundCount: Number(summary?.fund_count ?? 0),
    holdingCount: Number(summary?.holding_count ?? 0),
    merchantCount: Number(summary?.merchant_count ?? 0),
    categories: categories.map((row) => row.category),
    merchants: merchants.map((row) => row.canonical_merchant),
    funds: funds.map((row) => row.fund_name),
    dateStart: summary?.date_start ?? null,
    dateEnd: summary?.date_end ?? null,
    currency: summary?.currency ?? null,
  };
  metadataCache = { expiresAt: Date.now() + 30_000, value };
  return value;
}

export async function buildQuestionCatalog(): Promise<Array<{ group: string; question: string }>> {
  const metadata = await getDatasetMetadata();
  const category = metadata.categories.find((value) => value !== "uncategorized") ?? metadata.categories[0];
  const merchant = metadata.merchants[0];
  const fund = metadata.funds[0];
  const dateRange = metadata.dateStart && metadata.dateEnd ? ` from ${metadata.dateStart} to ${metadata.dateEnd}` : "";

  return [
    { group: "Spending", question: `What was my total actual spending${dateRange}?` },
    { group: "Spending", question: "What was my biggest expense?" },
    { group: "Spending", question: "Show my spending month by month." },
    { group: "Merchants", question: "What were my top 10 merchants by net spend?" },
    ...(merchant ? [{ group: "Merchants", question: `How much did I spend on ${merchant}?` }] : []),
    ...(category ? [{ group: "Categories", question: `How much did I spend on ${category}?` }] : []),
    { group: "Categories", question: "Show spending by category." },
    { group: "Subscriptions", question: "Which transactions look like recurring subscriptions?" },
    { group: "Portfolio", question: "What is my portfolio worth today, and how much have I made?" },
    { group: "Portfolio", question: "Which holding has the best realised return?" },
    ...(fund
      ? [{ group: "Funds", question: `What is the realised return on my ${fund} holding?` }]
      : []),
    { group: "Funds", question: "Rank all funds by return over the available data period." },
  ];
}

export async function getDashboardSummary(): Promise<Record<string, unknown>> {
  const [summary] = await query<Record<string, unknown>>(`
    with latest_month as (
      select date_trunc('month', max(transaction_date))::date as month_start
      from transactions
    ),
    monthly_spend as (
      select coalesce(sum(t.spend_amount), 0) as total_spend, max(t.currency) as currency
      from transactions t, latest_month m
      where t.transaction_date >= m.month_start
        and t.transaction_date < (m.month_start + interval '1 month')
        and t.is_transfer = false
    ),
    top_category as (
      select category, sum(spend_amount) as category_spend
      from transactions t, latest_month m
      where t.transaction_date >= m.month_start
        and t.transaction_date < (m.month_start + interval '1 month')
        and t.is_transfer = false
      group by category
      order by category_spend desc
      limit 1
    ),
    portfolio as (
      select
        coalesce(sum(h.units * latest.nav), 0) as current_value,
        coalesce(sum(h.units * h.purchase_nav), 0) as cost_basis,
        coalesce(sum((h.units * latest.nav) - (h.units * h.purchase_nav)), 0) as gain
      from holdings h
      join lateral (
        select nav
        from fund_navs n
        where n.fund_id = h.fund_id
        order by nav_date desc
        limit 1
      ) latest on true
    )
    select
      (select max(transaction_date)::text from transactions) as as_of_date,
      (select total_spend from monthly_spend) as monthly_spend,
      (select currency from monthly_spend) as currency,
      (select category from top_category) as top_category,
      (select category_spend from top_category) as top_category_spend,
      portfolio.current_value,
      portfolio.cost_basis,
      portfolio.gain,
      case when portfolio.cost_basis = 0 then null
        else round((portfolio.gain / portfolio.cost_basis) * 100, 2)
      end as return_pct
    from portfolio
  `);
  return summary ?? {};
}
