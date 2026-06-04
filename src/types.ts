export type TransactionJson = {
  id: string;
  date: string;
  merchant: string;
  category?: string | null;
  amount: number;
  currency: string;
  memo?: string | null;
};

export type FundJson = {
  id: string;
  name: string;
  category: string;
  nav: Array<{ date: string; value: number }>;
};

export type HoldingJson = {
  fund_id: string;
  fund_name: string;
  units: number;
  purchase_date: string;
  purchase_nav: number;
};

export type AskRequest = {
  question: string;
};

export type AskResponse = {
  answer: string;
  request_id: string;
  tools_called: string[];
  status: "success" | "no_data" | "error";
};

export type DateRange = {
  startDate?: string;
  endDate?: string;
};

export type SpendAggregate =
  | "total"
  | "average"
  | "top_merchants"
  | "by_category"
  | "by_month"
  | "compare_categories"
  | "biggest_expense"
  | "category_mom_increase";

export type QueryTransactionsInput = DateRange & {
  category?: string;
  merchant?: string;
  categories?: string[];
  aggregate: SpendAggregate;
  limit?: number;
  includeTransfers?: boolean;
  includeRefunds?: boolean;
};

export type FundReturnInput = DateRange & {
  fundName?: string;
  fundId?: string;
  rankAll?: boolean;
};

export type HoldingReturnInput = {
  fundName?: string;
  fundId?: string;
  rankAll?: boolean;
};
