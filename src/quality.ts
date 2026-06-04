import crypto from "node:crypto";
import { TransactionJson } from "./types.js";

const DROP_TOKENS = new Set([
  "UPI",
  "NEFT",
  "IMPS",
  "PAYMENT",
  "ORDER",
  "PVT",
  "LTD",
  "INDIA",
  "MUMBAI",
  "DELHI",
  "BANGALORE",
  "BENGALURU",
  "HYDERABAD",
  "CHENNAI",
  "PUNE",
  "GURGAON",
  "NOIDA",
]);

const TRANSFER_WORDS = ["transfer", "self transfer", "savings", "brokerage", "wallet load", "own account"];
const REFUND_WORDS = ["refund", "reversal", "cashback", "chargeback"];

export type NormalizedTransaction = TransactionJson & {
  merchantKey: string;
  canonicalMerchant: string;
  category: string;
  isRefund: boolean;
  isTransfer: boolean;
  isRecurringCandidate: boolean;
  spendAmount: number;
  fingerprint: string;
};

export function canonicalText(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\s*]/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMerchant(merchant: string, memo = ""): { key: string; canonical: string; confidence: number } {
  const merged = canonicalText(`${merchant} ${memo}`);
  const merchantOnly = canonicalText(merchant);
  const rawTokens = merchantOnly.replace(/\*/g, " ").split(/\s+/).filter(Boolean);
  const tokens = rawTokens.filter((token) => !DROP_TOKENS.has(token) && !/^\d+$/.test(token));
  const selected = tokens.length > 0 ? tokens : rawTokens;
  const keyTokens = selected.slice(0, 2);
  const key = keyTokens.join("_").toLowerCase() || "unknown_merchant";
  const canonical = keyTokens.map((token) => token[0] + token.slice(1).toLowerCase()).join(" ") || "Unknown Merchant";

  const hasNoisyMemo = /\b(UPI|NEFT|IMPS)\b/.test(merged);
  const confidence = hasNoisyMemo ? 0.86 : 0.94;
  return { key, canonical, confidence };
}

export function isTransfer(txn: TransactionJson): boolean {
  const text = `${txn.merchant} ${txn.memo ?? ""} ${txn.category ?? ""}`.toLowerCase();
  return TRANSFER_WORDS.some((word) => text.includes(word)) || (txn.category ?? "").toLowerCase() === "transfer";
}

export function isRefund(txn: TransactionJson): boolean {
  const text = `${txn.merchant} ${txn.memo ?? ""}`.toLowerCase();
  return txn.amount < 0 || REFUND_WORDS.some((word) => text.includes(word));
}

export function isRecurringCandidate(txn: TransactionJson, transfer: boolean, refund: boolean): boolean {
  const category = (txn.category ?? "").toLowerCase();
  if (transfer || refund) return false;
  if (txn.amount < 100) return false;
  return ["subscription", "utilities", "rent", "insurance", "software"].includes(category) || /monthly|subscription/i.test(txn.memo ?? "");
}

export function fingerprint(txn: TransactionJson, snapshotName: string): string {
  const payload = [snapshotName, txn.id, txn.date, canonicalText(txn.merchant), txn.amount.toFixed(2), txn.currency].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function normalizeTransaction(txn: TransactionJson, snapshotName: string): NormalizedTransaction {
  const merchant = normalizeMerchant(txn.merchant, txn.memo ?? "");
  const transfer = isTransfer(txn);
  const refund = isRefund(txn);
  const category = (txn.category ?? "uncategorized").toLowerCase();
  const spendAmount = transfer ? 0 : Number(txn.amount);

  return {
    ...txn,
    category,
    merchantKey: merchant.key,
    canonicalMerchant: merchant.canonical,
    isRefund: refund,
    isTransfer: transfer,
    isRecurringCandidate: isRecurringCandidate(txn, transfer, refund),
    spendAmount,
    fingerprint: fingerprint(txn, snapshotName),
  };
}

