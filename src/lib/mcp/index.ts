import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyContext from "./tools/get-my-context";
import listProperties from "./tools/list-properties";
import listBranches from "./tools/list-branches";
import createProperty from "./tools/create-property";
import listPendingTickets from "./tools/list-pending-tickets";
import decideExpenseClaim from "./tools/decide-expense-claim";
import createExpenseClaim from "./tools/create-expense-claim";
import createExpenseClaimFromReceipt from "./tools/create-expense-claim-from-receipt";

// The OAuth issuer MUST be the direct Supabase host. On publish, SUPABASE_URL
// is rewritten to the `.lovable.cloud` proxy, which mcp-js rejects
// (RFC 8414 issuer mismatch). VITE_SUPABASE_PROJECT_ID is inlined by Vite at
// build time and is the only Supabase value that survives publish unchanged.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "aqari-hrhbs-mcp",
  title: "HBSpro",
  version: "0.1.0",
  instructions:
    "Tools for HBSpro — a Saudi real-estate SaaS. Use these to inspect the signed-in user's company profile, list branches and properties, and create new properties. All calls act as the signed-in user and respect the app's row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyContext, listProperties, listBranches, createProperty, listPendingTickets, decideExpenseClaim, createExpenseClaim, createExpenseClaimFromReceipt],
});
