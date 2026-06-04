import { query } from "./db.js";
import { FundReturnInput, HoldingReturnInput, QueryTransactionsInput } from "./types.js";

function dateClause(input: { startDate?: string; endDate?: string }, params: unknown[]): string {
  const clauses: string[] = [];
  if (input.startDate) {
    params.push(input.startDate);
    clauses.push(`transaction_date >= $${params.length}`);
  }
  if (input.endDate) {
    params.push(input.endDate);
    clauses.push(`transaction_date <= $${params.length}`);
  }
  return clauses.length ? `and ${clauses.join(" and ")}` : "";
}

function merchantClause(merchant: string | undefined, params: unknown[]): string {
  if (!merchant) return "";
  params.push(`%${merchant.toLowerCase()}%`);
  return `and (lower(canonical_merchant) like $${params.length} or lower(raw_merchant) like $${params.length})`;
}

function categoryClause(category: string | undefined, params: unknown[]): string {
  if (!category) return "";
  params.push(category.toLowerCase());
  return `and lower(category) = $${params.length}`;
}

export async function queryTransactions(input: QueryTransactionsInput): Promise<Record<string, unknown>> {
  const params: unknown[] = [];
  const filters = [
    "1=1",
    input.includeTransfers ? "" : "and is_transfer = false",
    input.includeRefunds === false ? "and is_refund = false" : "",
    dateClause(input, params),
    merchantClause(input.merchant, params),
    categoryClause(input.category, params),
  ].join(" ");

  if (input.aggregate === "total") {
    const rows = await query<{ total_spend: string; row_count: string; currency: string }>(
      `select coalesce(sum(spend_amount), 0) as total_spend, count(*) as row_count, max(currency) as currency from transactions where ${filters}`,
      params,
    );
    return rows[0];
  }

  if (input.aggregate === "average") {
    const rows = await query<{ average_spend: string; row_count: string; currency: string }>(
      `select coalesce(avg(spend_amount), 0) as average_spend, count(*) as row_count, max(currency) as currency from transactions where ${filters}`,
      params,
    );
    return rows[0];
  }

  if (input.aggregate === "biggest_expense") {
    const rows = await query(
      `
      select transaction_date, canonical_merchant, category, spend_amount, currency, memo
      from transactions
      where ${filters} and spend_amount > 0
      order by spend_amount desc, transaction_date asc
      limit 1
      `,
      params,
    );
    return { rows };
  }

  if (input.aggregate === "top_merchants") {
    params.push(input.limit ?? 5);
    const rows = await query(
      `
      select canonical_merchant, round(sum(spend_amount), 2) as net_spend, count(*) as transaction_count, max(currency) as currency
      from transactions
      where ${filters}
      group by canonical_merchant
      having sum(spend_amount) <> 0
      order by net_spend desc, canonical_merchant
      limit $${params.length}
      `,
      params,
    );
    return { rows };
  }

  if (input.aggregate === "by_category") {
    const rows = await query(
      `
      select category, round(sum(spend_amount), 2) as net_spend, count(*) as transaction_count, max(currency) as currency
      from transactions
      where ${filters}
      group by category
      order by net_spend desc, category
      `,
      params,
    );
    return { rows };
  }

  if (input.aggregate === "by_month") {
    const rows = await query(
      `
      select to_char(date_trunc('month', transaction_date), 'YYYY-MM') as month,
             round(sum(spend_amount), 2) as net_spend,
             count(*) as transaction_count,
             max(currency) as currency
      from transactions
      where ${filters}
      group by 1
      order by 1
      `,
      params,
    );
    return { rows };
  }

  if (input.aggregate === "compare_categories") {
    if (!input.categories || input.categories.length < 2) {
      throw new Error("compare_categories requires at least two categories");
    }
    params.push(input.categories.map((category) => category.toLowerCase()));
    const rows = await query(
      `
      select category,
             to_char(date_trunc('month', transaction_date), 'YYYY-MM') as month,
             round(sum(spend_amount), 2) as net_spend,
             max(currency) as currency
      from transactions
      where ${filters} and lower(category) = any($${params.length})
      group by category, month
      order by category, month
      `,
      params,
    );
    return { rows };
  }

  if (input.aggregate === "category_mom_increase") {
    const rows = await query(
      `
      with monthly as (
        select category,
               date_trunc('month', transaction_date)::date as month_start,
               sum(spend_amount) as net_spend,
               max(currency) as currency
        from transactions
        where ${filters}
        group by category, month_start
      ),
      deltas as (
        select category,
               month_start,
               net_spend,
               lag(net_spend) over (partition by category order by month_start) as previous_spend,
               currency
        from monthly
      )
      select category,
             to_char(month_start, 'YYYY-MM') as month,
             round(net_spend, 2) as net_spend,
             round(previous_spend, 2) as previous_spend,
             round(net_spend - previous_spend, 2) as increase_amount,
             currency
      from deltas
      where previous_spend is not null
      order by increase_amount desc, category
      limit 1
      `,
      params,
    );
    return { rows };
  }

  throw new Error(`Unsupported transaction aggregate: ${input.aggregate}`);
}

export async function detectRecurringTransactions(): Promise<Record<string, unknown>> {
  const rows = await query(
    `
    with merchant_months as (
      select canonical_merchant,
             round(avg(spend_amount), 2) as average_amount,
             count(*) as charge_count,
             count(distinct to_char(date_trunc('month', transaction_date), 'YYYY-MM')) as active_months,
             min(transaction_date) as first_seen,
             max(transaction_date) as last_seen,
             max(currency) as currency
      from transactions
      where is_transfer = false and is_refund = false and is_recurring_candidate = true
      group by canonical_merchant
    )
    select *,
           round((active_months::numeric / greatest(charge_count, 1)) * 100, 2) as consistency_score
    from merchant_months
    where charge_count >= 3 or active_months >= 3
    order by active_months desc, charge_count desc, canonical_merchant
    limit 20
    `,
  );
  return { rows };
}

async function findFund(input: { fundId?: string; fundName?: string }): Promise<{ fund_id: string; fund_name: string } | undefined> {
  if (input.fundId) {
    const rows = await query<{ fund_id: string; fund_name: string }>("select fund_id, fund_name from funds where fund_id = $1", [input.fundId]);
    return rows[0];
  }
  if (input.fundName) {
    const rows = await query<{ fund_id: string; fund_name: string }>(
      "select fund_id, fund_name from funds where lower(fund_name) like $1 order by length(fund_name) limit 1",
      [`%${input.fundName.toLowerCase()}%`],
    );
    return rows[0];
  }
  return undefined;
}

export async function computeFundReturns(input: FundReturnInput): Promise<Record<string, unknown>> {
  if (input.rankAll) {
    const rows = await query(
      `
      with navs as (
        select f.fund_id, f.fund_name,
          (select nav from fund_navs n where n.fund_id = f.fund_id and n.nav_date <= $1 order by n.nav_date desc limit 1) as start_nav,
          (select nav from fund_navs n where n.fund_id = f.fund_id and n.nav_date <= $2 order by n.nav_date desc limit 1) as end_nav
        from funds f
      )
      select fund_id, fund_name, start_nav, end_nav,
             round(((end_nav - start_nav) / nullif(start_nav, 0)) * 100, 2) as return_pct
      from navs
      where start_nav is not null and end_nav is not null
      order by return_pct desc
      `,
      [input.startDate, input.endDate],
    );
    return { rows };
  }

  const fund = await findFund(input);
  if (!fund) return { rows: [], reason: "fund_not_found" };
  const rows = await query(
    `
    with navs as (
      select
        (select nav from fund_navs where fund_id = $1 and nav_date <= $2 order by nav_date desc limit 1) as start_nav,
        (select nav from fund_navs where fund_id = $1 and nav_date <= $3 order by nav_date desc limit 1) as end_nav
    )
    select $1 as fund_id, $4 as fund_name, start_nav, end_nav,
           round(((end_nav - start_nav) / nullif(start_nav, 0)) * 100, 2) as return_pct
    from navs
    `,
    [fund.fund_id, input.startDate, input.endDate, fund.fund_name],
  );
  return { rows };
}

export async function computeHoldingReturns(input: HoldingReturnInput): Promise<Record<string, unknown>> {
  const fund = input.rankAll ? undefined : await findFund(input);
  const params = fund ? [fund.fund_id] : [];
  const filter = fund ? "where h.fund_id = $1" : "";
  const rows = await query(
    `
    select h.fund_id,
           h.fund_name,
           h.units,
           h.purchase_date,
           h.purchase_nav,
           latest.nav_date as current_nav_date,
           latest.nav as current_nav,
           round(h.units * h.purchase_nav, 2) as cost_basis,
           round(h.units * latest.nav, 2) as current_value,
           round((h.units * latest.nav) - (h.units * h.purchase_nav), 2) as gain_inr,
           round(((latest.nav - h.purchase_nav) / nullif(h.purchase_nav, 0)) * 100, 2) as realised_return_pct
    from holdings h
    join lateral (
      select nav_date, nav from fund_navs n
      where n.fund_id = h.fund_id
      order by nav_date desc
      limit 1
    ) latest on true
    ${filter}
    order by realised_return_pct desc
    `,
    params,
  );
  return { rows };
}

export async function portfolioValue(): Promise<Record<string, unknown>> {
  const rows = await query(
    `
    select round(sum(h.units * latest.nav), 2) as current_value,
           round(sum(h.units * h.purchase_nav), 2) as cost_basis,
           round(sum((h.units * latest.nav) - (h.units * h.purchase_nav)), 2) as gain_inr,
           round((sum(h.units * latest.nav) - sum(h.units * h.purchase_nav)) / nullif(sum(h.units * h.purchase_nav), 0) * 100, 2) as return_pct,
           max(latest.nav_date) as as_of_date
    from holdings h
    join lateral (
      select nav_date, nav from fund_navs n
      where n.fund_id = h.fund_id
      order by nav_date desc
      limit 1
    ) latest on true
    `,
  );
  return rows[0];
}
