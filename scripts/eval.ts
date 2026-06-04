import "dotenv/config";
import { askTara } from "../src/agent.js";
import { closePool, query } from "../src/db.js";

type EvalCase = {
  id: string;
  category: string;
  question: string;
  expect: RegExp;
};

const cases: EvalCase[] = [
  {
    id: "spend_food_march",
    category: "date_filtering",
    question: "How much did I spend on food in March 2025 after refunds?",
    expect: /spend|INR/i,
  },
  {
    id: "top_merchants_q1",
    category: "ranking",
    question: "What were my top 5 merchants by net spend between January and March 2025?",
    expect: /top merchants/i,
  },
  {
    id: "category_compare",
    category: "comparison",
    question: "Compare my food and travel spending month by month.",
    expect: /month-by-month/i,
  },
  {
    id: "transfers_excluded",
    category: "transfers",
    question: "Ignore transfers. What was my total actual spending in Q1 2025?",
    expect: /transfers were excluded/i,
  },
  {
    id: "merchant_alias",
    category: "merchant_alias",
    question: "How much did I spend on Swiggy in March 2025?",
    expect: /Swiggy|spend|could not find/i,
  },
  {
    id: "recurring",
    category: "recurring",
    question: "Which transactions look like recurring subscriptions?",
    expect: /recurring|subscription|charges/i,
  },
  {
    id: "no_data",
    category: "no_data",
    question: "Do I have any data for rent in April 2025?",
    expect: /could not find|INR/i,
  },
  {
    id: "fund_period_return",
    category: "funds",
    question: "What was Saffron Bluechip Equity Fund's return from 2024-01-01 to 2025-01-01?",
    expect: /fund period return|NAV/i,
  },
  {
    id: "fund_rank",
    category: "funds",
    question: "Rank all funds by one-year return between 2024-01-01 and 2025-01-01, and show the spread between best and worst.",
    expect: /ranking|spread/i,
  },
  {
    id: "holding_return",
    category: "holdings",
    question: "What is my realised return on my Sentinel Nifty Index Fund holding, given when I bought it?",
    expect: /realised return|cost basis/i,
  },
  {
    id: "portfolio_value",
    category: "holdings",
    question: "What is my portfolio worth today, and how much have I made on it in absolute INR?",
    expect: /portfolio is worth|gain/i,
  },
  {
    id: "biggest_expense",
    category: "lookup",
    question: "What was my single biggest expense?",
    expect: /biggest expense/i,
  },
];

async function main() {
  const direct = process.argv.includes("--direct");
  const baseUrl = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
  let passed = 0;
  const failures: Array<{ id: string; question: string; answer: string }> = [];

  for (const testCase of cases) {
    const answer = direct ? (await askTara(testCase.question)).answer : await askHttp(baseUrl, testCase.question);
    const ok = testCase.expect.test(answer);
    if (ok) passed += 1;
    else failures.push({ id: testCase.id, question: testCase.question, answer });

    await query(
      `
      insert into evaluation_results (test_case_id, category, question, expected, actual, passed, score, failure_reason)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        testCase.id,
        testCase.category,
        testCase.question,
        String(testCase.expect),
        answer,
        ok,
        ok ? 1 : 0,
        ok ? null : "Answer did not match expected fact pattern.",
      ],
    );
  }

  console.log(`Eval summary: ${passed}/${cases.length} passed.`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const failure of failures) {
      console.log(`- ${failure.id}: ${failure.answer}`);
    }
  }
  await closePool();
  if (failures.length > 0) process.exit(1);
}

async function askHttp(baseUrl: string, question: string): Promise<string> {
  const response = await fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    throw new Error(`POST /ask failed with ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { answer?: string };
  if (typeof body.answer !== "string") {
    throw new Error("POST /ask response did not include an answer string");
  }
  return body.answer;
}

main().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exit(1);
});
