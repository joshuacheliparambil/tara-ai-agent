import { z } from "zod";
import { computeFundReturns, computeHoldingReturns, detectRecurringTransactions, portfolioValue, queryTransactions } from "./analytics.js";
import { recordToolExecution } from "./observability.js";

export const queryTransactionsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  merchant: z.string().optional(),
  categories: z.array(z.string()).optional(),
  aggregate: z.enum([
    "total",
    "average",
    "top_merchants",
    "by_category",
    "by_month",
    "compare_categories",
    "biggest_expense",
    "category_mom_increase",
  ]),
  limit: z.number().int().min(1).max(20).optional(),
  includeTransfers: z.boolean().optional(),
  includeRefunds: z.boolean().optional(),
});

export const fundReturnSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  fundName: z.string().optional(),
  fundId: z.string().optional(),
  rankAll: z.boolean().optional(),
});

export const holdingReturnSchema = z.object({
  fundName: z.string().optional(),
  fundId: z.string().optional(),
  rankAll: z.boolean().optional(),
});

export async function runTool(requestId: string, toolName: string, input: unknown): Promise<Record<string, unknown>> {
  const started = performance.now();
  try {
    let output: Record<string, unknown>;
    if (toolName === "query_transactions") {
      output = await queryTransactions(queryTransactionsSchema.parse(input));
    } else if (toolName === "detect_recurring_transactions") {
      output = await detectRecurringTransactions();
    } else if (toolName === "compute_fund_returns") {
      output = await computeFundReturns(fundReturnSchema.parse(input));
    } else if (toolName === "compute_holding_returns") {
      output = await computeHoldingReturns(holdingReturnSchema.parse(input));
    } else if (toolName === "portfolio_value") {
      output = await portfolioValue();
    } else {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    await recordToolExecution({
      requestId,
      toolName,
      inputPayload: input,
      outputSummary: summarize(output),
      status: "success",
      latencyMs: performance.now() - started,
    });
    return output;
  } catch (error) {
    await recordToolExecution({
      requestId,
      toolName,
      inputPayload: input,
      status: "error",
      latencyMs: performance.now() - started,
      errorType: error instanceof z.ZodError ? "validation_error" : "tool_error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function summarize(output: Record<string, unknown>): Record<string, unknown> {
  const rows = output.rows;
  if (Array.isArray(rows)) {
    return { row_count: rows.length, first_rows: rows.slice(0, 3) };
  }
  return output;
}
