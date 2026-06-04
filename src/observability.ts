import fs from "node:fs";
import { query } from "./db.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function newRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function trace(event: Record<string, unknown>): Promise<void> {
  const payload = {
    timestamp: nowIso(),
    service: "tara-ai-agent",
    ...event,
  };
  const traceFile = process.env.TRACE_FILE ?? "./trace.ndjson";
  await fs.promises.appendFile(traceFile, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function createAgentLog(requestId: string, question: string): Promise<void> {
  await query(
    `insert into agent_logs (request_id, question, status) values ($1, $2, 'started')`,
    [requestId, question],
  );
}

export async function finishAgentLog(input: {
  requestId: string;
  intent: string;
  answer: string;
  status: string;
  latencyMs: number;
  fallbackReason?: string;
}): Promise<void> {
  await query(
    `
    update agent_logs
    set intent = $2, answer = $3, status = $4, latency_ms = $5, fallback_reason = $6
    where request_id = $1
    `,
    [input.requestId, input.intent, input.answer, input.status, input.latencyMs, input.fallbackReason ?? null],
  );
}

export async function recordToolExecution(input: {
  requestId: string;
  toolName: string;
  inputPayload: unknown;
  outputSummary?: unknown;
  status: string;
  latencyMs: number;
  errorType?: string;
  errorMessage?: string;
}): Promise<void> {
  const logs = await query<{ agent_log_id: string }>(
    "select agent_log_id from agent_logs where request_id = $1",
    [input.requestId],
  );
  await query(
    `
    insert into tool_executions (
      agent_log_id, request_id, tool_name, input_payload, output_summary,
      status, latency_ms, error_type, error_message
    ) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
    `,
    [
      logs[0]?.agent_log_id ?? null,
      input.requestId,
      input.toolName,
      JSON.stringify(input.inputPayload),
      JSON.stringify(input.outputSummary ?? {}),
      input.status,
      input.latencyMs,
      input.errorType ?? null,
      input.errorMessage ?? null,
    ],
  );
}

