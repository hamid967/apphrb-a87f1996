// Whitelisted finance data sources for the report builder.
// Only these tables and columns are exposed to the builder UI —
// arbitrary table access is intentionally not offered.

export type SourceKey =
  | "invoices"
  | "payments"
  | "expense_claims"
  | "expenses"
  | "subscription_payments"
  | "commissions";

export type ColumnKind = "text" | "number" | "date" | "status";

export type ColumnDef = {
  key: string;
  label: string;
  kind: ColumnKind;
};

export type FinanceSource = {
  key: SourceKey;
  label: string;
  dateField: string; // default date field for range filters
  statusField?: string; // default status column for status filter
  statusOptions?: string[];
  amountField?: string; // used for totals
  columns: ColumnDef[];
};

export const FINANCE_SOURCES: FinanceSource[] = [
  {
    key: "invoices",
    label: "Invoices",
    dateField: "issue_date",
    statusField: "status",
    statusOptions: ["draft", "sent", "paid", "overdue", "cancelled"],
    amountField: "total",
    columns: [
      { key: "number", label: "Number", kind: "text" },
      { key: "issue_date", label: "Issue date", kind: "date" },
      { key: "due_date", label: "Due date", kind: "date" },
      { key: "paid_at", label: "Paid on", kind: "date" },
      { key: "status", label: "Status", kind: "status" },
      { key: "subtotal", label: "Subtotal", kind: "number" },
      { key: "vat_amount", label: "VAT", kind: "number" },
      { key: "total", label: "Total", kind: "number" },
      { key: "currency", label: "Currency", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
    ],
  },
  {
    key: "payments",
    label: "Payments received",
    dateField: "paid_at",
    statusField: "status",
    statusOptions: ["completed", "pending", "failed", "refunded"],
    amountField: "amount",
    columns: [
      { key: "reference", label: "Reference", kind: "text" },
      { key: "paid_at", label: "Paid at", kind: "date" },
      { key: "amount", label: "Amount", kind: "number" },
      { key: "currency_code", label: "Currency", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "notes", label: "Notes", kind: "text" },
    ],
  },
  {
    key: "expense_claims",
    label: "Expense claims",
    dateField: "created_at",
    statusField: "status",
    statusOptions: ["draft", "submitted", "approved", "rejected", "paid"],
    amountField: "amount",
    columns: [
      { key: "claim_number", label: "Claim #", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "category", label: "Category", kind: "text" },
      { key: "amount", label: "Amount", kind: "number" },
      { key: "currency", label: "Currency", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "submitted_at", label: "Submitted at", kind: "date" },
      { key: "approved_at", label: "Approved at", kind: "date" },
    ],
  },
  {
    key: "expenses",
    label: "Expenses (ledger)",
    dateField: "spent_at",
    amountField: "amount",
    columns: [
      { key: "spent_at", label: "Date", kind: "date" },
      { key: "category", label: "Category", kind: "text" },
      { key: "vendor", label: "Vendor", kind: "text" },
      { key: "amount", label: "Amount", kind: "number" },
      { key: "vat_amount", label: "VAT", kind: "number" },
      { key: "currency", label: "Currency", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
    ],
  },
  {
    key: "subscription_payments",
    label: "Subscription payments",
    dateField: "created_at",
    statusField: "status",
    statusOptions: ["pending", "approved", "rejected"],
    amountField: "amount",
    columns: [
      { key: "reference", label: "Reference", kind: "text" },
      { key: "amount", label: "Amount", kind: "number" },
      { key: "currency", label: "Currency", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "created_at", label: "Created at", kind: "date" },
    ],
  },
  {
    key: "commissions",
    label: "Commissions",
    dateField: "created_at",
    statusField: "status",
    statusOptions: ["pending", "approved", "paid", "cancelled"],
    amountField: "amount",
    columns: [
      { key: "amount", label: "Amount", kind: "number" },
      { key: "percent", label: "Percent", kind: "number" },
      { key: "currency", label: "Currency", kind: "text" },
      { key: "status", label: "Status", kind: "status" },
      { key: "paid_at", label: "Paid on", kind: "date" },
      { key: "created_at", label: "Created at", kind: "date" },
    ],
  },
];

export function findSource(key: string): FinanceSource | undefined {
  return FINANCE_SOURCES.find((s) => s.key === key);
}
