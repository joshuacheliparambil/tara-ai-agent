import { AskResponse } from "./types.js";
import { createAgentLog, finishAgentLog, newRequestId, trace } from "./observability.js";
import { runTool } from "./tools.js";

type PlanStep = {
  toolName: string;
  input: Record<string, unknown>;
};

type AgentPlan = {
  intent: string;
  steps: PlanStep[];
  renderer: (results: Record<string, unknown>[]) => string;
};

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

export async function askTara(question: string): Promise<AskResponse> {
  const requestId = newRequestId();
  const started = performance.now();
  await createAgentLog(requestId, question);
  await trace({ request_id: requestId, event_type: "ask_started", question });

  try {
    const plan = planQuestion(question);
    const results: Record<string, unknown>[] = [];
    const toolsCalled: string[] = [];
    for (const step of plan.steps) {
      toolsCalled.push(step.toolName);
      results.push(await runTool(requestId, step.toolName, step.input));
    }
    const answer = plan.renderer(results);
    const status = answer.toLowerCase().includes("i could not find") ? "no_data" : "success";
    await finishAgentLog({
      requestId,
      intent: plan.intent,
      answer,
      status,
      latencyMs: performance.now() - started,
    });
    await trace({ request_id: requestId, event_type: "ask_completed", status, tools_called: toolsCalled });
    return { answer, request_id: requestId, tools_called: toolsCalled, status };
  } catch (error) {
    const answer = `I could not answer that reliably from the database. Reason: ${error instanceof Error ? error.message : String(error)}`;
    await finishAgentLog({
      requestId,
      intent: "error",
      answer,
      status: "error",
      latencyMs: performance.now() - started,
      fallbackReason: error instanceof Error ? error.message : String(error),
    });
    await trace({ request_id: requestId, event_type: "ask_failed", error: error instanceof Error ? error.message : String(error) });
    return { answer, request_id: requestId, tools_called: [], status: "error" };
  }
}

function planQuestion(question: string): AgentPlan {
  const q = question.toLowerCase();
  const range = extractDateRange(q);

  if (q.includes("recurring") || q.includes("subscription")) {
    return {
      intent: "recurring_transactions",
      steps: [{ toolName: "detect_recurring_transactions", input: {} }],
      renderer: ([result]) => renderRecurring(result),
    };
  }

  if (q.includes("portfolio worth") || q.includes("portfolio value")) {
    return {
      intent: "portfolio_value",
      steps: [{ toolName: "portfolio_value", input: {} }],
      renderer: ([result]) => renderPortfolio(result),
    };
  }

  if (q.includes("realised") || q.includes("realized") || q.includes("holding")) {
    const fundName = extractFundName(question);
    return {
      intent: "holding_return",
      steps: [{ toolName: "compute_holding_returns", input: fundName ? { fundName } : { rankAll: true } }],
      renderer: ([result]) => renderHoldingReturn(result, fundName),
    };
  }

  if (q.includes("fund") || q.includes("return")) {
    const fundName = extractFundName(question);
    const rankAll = q.includes("rank all") || q.includes("best") || q.includes("worst");
    return {
      intent: "fund_return",
      steps: [
        {
          toolName: "compute_fund_returns",
          input: {
            startDate: range.startDate ?? "2024-01-01",
            endDate: range.endDate ?? "2025-01-01",
            fundName,
            rankAll,
          },
        },
      ],
      renderer: ([result]) => renderFundReturn(result, rankAll),
    };
  }

  if (q.includes("biggest expense") || q.includes("single biggest")) {
    return {
      intent: "biggest_expense",
      steps: [{ toolName: "query_transactions", input: { ...range, aggregate: "biggest_expense" } }],
      renderer: ([result]) => renderBiggestExpense(result),
    };
  }

  if (q.includes("top") && q.includes("merchant")) {
    return {
      intent: "top_merchants",
      steps: [{ toolName: "query_transactions", input: { ...range, aggregate: "top_merchants", limit: extractLimit(q) ?? 5 } }],
      renderer: ([result]) => renderRows("Top merchants by net spend", result, "canonical_merchant", "net_spend"),
    };
  }

  if (q.includes("biggest increase") && q.includes("category")) {
    return {
      intent: "category_mom_increase",
      steps: [{ toolName: "query_transactions", input: { ...range, aggregate: "category_mom_increase" } }],
      renderer: ([result]) => renderCategoryIncrease(result),
    };
  }

  if (q.includes("compare") && (q.includes("food") || q.includes("travel"))) {
    return {
      intent: "category_comparison",
      steps: [
        {
          toolName: "query_transactions",
          input: { ...range, aggregate: "compare_categories", categories: extractCategories(q) },
        },
      ],
      renderer: ([result]) => renderCategoryComparison(result),
    };
  }

  if (q.includes("category") || q.includes("categories")) {
    return {
      intent: "category_spend",
      steps: [{ toolName: "query_transactions", input: { ...range, aggregate: "by_category" } }],
      renderer: ([result]) => renderRows("Category spend", result, "category", "net_spend"),
    };
  }

  const category = extractCategory(q);
  const merchant = extractMerchant(question);
  return {
    intent: "spend_total",
    steps: [{ toolName: "query_transactions", input: { ...range, category, merchant, aggregate: "total" } }],
    renderer: ([result]) => renderTotalSpend(result, { category, merchant, range }),
  };
}

function extractDateRange(q: string): { startDate?: string; endDate?: string } {
  const explicit = [...q.matchAll(/(20\d{2}-\d{2}-\d{2})/g)].map((match) => match[1]);
  if (explicit.length >= 2) return { startDate: explicit[0], endDate: explicit[1] };
  if (q.includes("q1 2025")) return { startDate: "2025-01-01", endDate: "2025-03-31" };
  if (q.includes("between january and march 2025")) return { startDate: "2025-01-01", endDate: "2025-03-31" };
  if (q.includes("from february to march")) return { startDate: "2025-02-01", endDate: "2025-03-31" };
  const month = Object.entries(MONTHS).find(([name]) => q.includes(name));
  const year = q.match(/\b(20\d{2})\b/)?.[1] ?? "2025";
  if (month) {
    const startDate = `${year}-${month[1]}-01`;
    const endDate = new Date(Number(year), Number(month[1]), 0).toISOString().slice(0, 10);
    return { startDate, endDate };
  }
  if (q.includes("last month")) return { startDate: "2025-03-01", endDate: "2025-03-31" };
  return {};
}

function extractCategory(q: string): string | undefined {
  const known = ["food", "travel", "rent", "health", "transport", "subscription", "shopping", "groceries", "utilities"];
  return known.find((category) => q.includes(category));
}

function extractCategories(q: string): string[] {
  const categories = ["food", "travel", "rent", "health", "transport", "subscription", "shopping", "groceries", "utilities"].filter((category) =>
    q.includes(category),
  );
  return categories.length >= 2 ? categories : ["food", "travel"];
}

function extractMerchant(question: string): string | undefined {
  const match = question.match(/spent on ([A-Za-z0-9 *.-]+)/i);
  if (!match) return undefined;
  const value = match[1].replace(/,.*$/, "").replace(/ in .*$/i, "").trim();
  if (["food", "travel", "rent", "health", "transport"].includes(value.toLowerCase())) return undefined;
  return value || undefined;
}

function extractFundName(question: string): string | undefined {
  const quoted = question.match(/"([^"]+fund)"/i)?.[1] ?? question.match(/'([^']+fund)'/i)?.[1];
  if (quoted) return quoted;
  const match = question.match(/([A-Z][A-Za-z ]+ Fund)/);
  return match?.[1];
}

function extractLimit(q: string): number | undefined {
  const match = q.match(/top\s+(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function money(value: unknown, currency = "INR"): string {
  const num = Number(value ?? 0);
  return `${currency} ${num.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function renderTotalSpend(result: Record<string, unknown>, context: { category?: string; merchant?: string; range: Record<string, string | undefined> }): string {
  const total = Number(result.total_spend ?? 0);
  const rowCount = Number(result.row_count ?? 0);
  const currency = String(result.currency ?? "INR");
  if (rowCount === 0) return "I could not find matching transaction data for that question.";
  const target = context.merchant ? ` on ${context.merchant}` : context.category ? ` for ${context.category}` : "";
  const period = context.range.startDate && context.range.endDate ? ` from ${context.range.startDate} to ${context.range.endDate}` : "";
  return `Your refund-adjusted spend${target}${period} was ${money(total, currency)} across ${rowCount} matching transaction(s). Transfers were excluded.`;
}

function renderRows(title: string, result: Record<string, unknown>, labelKey: string, valueKey: string): string {
  const rows = (result.rows as Record<string, unknown>[] | undefined) ?? [];
  if (rows.length === 0) return `I could not find data for ${title.toLowerCase()}.`;
  const body = rows
    .slice(0, 8)
    .map((row, index) => `${index + 1}. ${row[labelKey]}: ${money(row[valueKey], String(row.currency ?? "INR"))}`)
    .join("; ");
  return `${title}: ${body}. Refunds reduce spend and transfers are excluded.`;
}

function renderBiggestExpense(result: Record<string, unknown>): string {
  const row = ((result.rows as Record<string, unknown>[] | undefined) ?? [])[0];
  if (!row) return "I could not find any matching expense transactions.";
  return `Your biggest expense was ${money(row.spend_amount, String(row.currency ?? "INR"))} at ${row.canonical_merchant} on ${row.transaction_date} in category ${row.category}.`;
}

function renderRecurring(result: Record<string, unknown>): string {
  const rows = (result.rows as Record<string, unknown>[] | undefined) ?? [];
  if (rows.length === 0) return "I could not find recurring subscription-like transactions in the loaded data.";
  return `Likely recurring merchants: ${rows
    .slice(0, 8)
    .map((row) => `${row.canonical_merchant} (${row.charge_count} charges, avg ${money(row.average_amount, String(row.currency ?? "INR"))})`)
    .join("; ")}.`;
}

function renderCategoryComparison(result: Record<string, unknown>): string {
  const rows = (result.rows as Record<string, unknown>[] | undefined) ?? [];
  if (rows.length === 0) return "I could not find enough category data to compare.";
  return `Month-by-month category comparison: ${rows
    .map((row) => `${row.category} ${row.month}: ${money(row.net_spend, String(row.currency ?? "INR"))}`)
    .join("; ")}.`;
}

function renderCategoryIncrease(result: Record<string, unknown>): string {
  const row = ((result.rows as Record<string, unknown>[] | undefined) ?? [])[0];
  if (!row) return "I could not find enough month-over-month category data to calculate an increase.";
  return `${row.category} had the biggest month-over-month increase in ${row.month}: ${money(row.previous_spend, String(row.currency ?? "INR"))} to ${money(row.net_spend, String(row.currency ?? "INR"))}, an increase of ${money(row.increase_amount, String(row.currency ?? "INR"))}. Transfers were excluded and refunds reduced spend.`;
}

function renderFundReturn(result: Record<string, unknown>, rankAll: boolean): string {
  const rows = (result.rows as Record<string, unknown>[] | undefined) ?? [];
  if (rows.length === 0) return "I could not find NAV data for that fund and date range.";
  if (rankAll) {
    const best = rows[0];
    const worst = rows[rows.length - 1];
    return `Fund period return ranking: ${rows
      .map((row, index) => `${index + 1}. ${row.fund_name}: ${row.return_pct}%`)
      .join("; ")}. Spread between best and worst: ${(Number(best.return_pct) - Number(worst.return_pct)).toFixed(2)} percentage points.`;
  }
  const row = rows[0];
  return `${row.fund_name}'s fund period return was ${row.return_pct}% using NAV ${row.start_nav} to ${row.end_nav}. This is the fund return, not your holding-specific realised return.`;
}

function renderHoldingReturn(result: Record<string, unknown>, fundName?: string): string {
  const rows = (result.rows as Record<string, unknown>[] | undefined) ?? [];
  if (rows.length === 0) return `I could not find holding data${fundName ? ` for ${fundName}` : ""}.`;
  const row = rows[0];
  return `Your realised return on ${row.fund_name} is ${row.realised_return_pct}%: cost basis ${money(row.cost_basis)} and current value ${money(row.current_value)}, for a gain of ${money(row.gain_inr)} as of NAV date ${row.current_nav_date}.`;
}

function renderPortfolio(result: Record<string, unknown>): string {
  if (!result.current_value) return "I could not find portfolio holding data.";
  return `Your portfolio is worth ${money(result.current_value)} as of ${result.as_of_date}. Cost basis is ${money(result.cost_basis)}, gain is ${money(result.gain_inr)}, and aggregate realised return is ${result.return_pct}%.`;
}
