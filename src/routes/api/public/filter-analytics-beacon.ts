import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { decodeBatch, type CompactEventRow, type FullEventRow } from "@/lib/filter-analytics-codec";

/**
 * Beacon endpoint for the ActiveFiltersBar analytics flusher.
 *
 * Why a dedicated public route: `navigator.sendBeacon` cannot set custom
 * headers, so the auth-middleware-guarded `ingestFilterAnalytics` server
 * fn is unreachable from a beacon. This route accepts a JSON body that
 * carries the caller's access token, verifies it with Supabase Auth, and
 * then inserts rows as that user. It exists solely to salvage the last
 * batch on `pagehide` / `visibilitychange:hidden` when a normal fetch may
 * be cancelled by the browser (common on mobile).
 *
 * Security posture:
 * - Access token is verified via `supabase.auth.getUser(token)` — a spoofed
 *   or expired token yields 401. No trust in the body's user_id claim.
 * - Rows are inserted with `user_id = verified user`, matching the RLS
 *   policy shape used by the regular server function.
 * - No sensitive data returned (no user PII, no row echo).
 */

/**
 * Legacy (uncompressed) event shape — accepted for backward compatibility
 * with beacons queued in `localStorage` before the codec shipped.
 */
const legacyEventSchema = z.object({
  session_id: z.string().max(64).optional().nullable(),
  event_name: z.string().min(1).max(64),
  filter_key: z.string().max(64).optional().nullable(),
  source: z.string().max(32).optional().nullable(),
  chip_count: z.number().int().min(0).max(1000).optional().nullable(),
  remaining: z.number().int().min(0).max(1000).optional().nullable(),
  distance_px: z.number().int().min(0).max(10_000).optional().nullable(),
  progress: z.number().min(0).max(1).optional().nullable(),
  reached_end: z.boolean().optional().nullable(),
  path: z.string().max(256).optional().nullable(),
  action: z.string().max(16).optional().nullable(),
  prev_event_name: z.string().max(64).optional().nullable(),
  prev_event_age_ms: z.number().int().min(0).max(600_000).optional().nullable(),
});

/**
 * Compact wire schema — matches `CompactEventRow` in the codec. Every
 * field is optional except `e` (event code / name); the server rehydrates
 * defaults during decode.
 */
const compactEventSchema = z.object({
  s: z.string().max(64).optional(),
  e: z.union([z.number().int().min(1).max(999), z.string().min(1).max(64)]),
  f: z.string().max(64).optional(),
  o: z.union([z.number().int().min(1).max(99), z.string().max(32)]).optional(),
  c: z.number().int().min(0).max(1000).optional(),
  r: z.number().int().min(0).max(1000).optional(),
  d: z.number().int().min(0).max(10_000).optional(),
  p: z.number().min(0).max(1).optional(),
  x: z.union([z.literal(0), z.literal(1)]).optional(),
  u: z.string().max(256).optional(),
  a: z.union([z.number().int().min(1).max(99), z.string().max(16)]).optional(),
  pe: z.union([z.number().int().min(1).max(999), z.string().max(64)]).optional(),
  pa: z.number().int().min(0).max(600_000).optional(),
});

const bodySchema = z.object({
  token: z.string().min(10).max(4096),
  // `v: 1` → compact payload; absent → legacy uncompressed payload.
  v: z.literal(1).optional(),
  events: z.union([
    z.array(compactEventSchema).min(1).max(100),
    z.array(legacyEventSchema).min(1).max(100),
  ]),
});

export const Route = createFileRoute("/api/public/filter-analytics-beacon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return new Response("Invalid payload", { status: 400 });
        }
        const { token, v, events } = parsed.data;
        // Compact payload → decode back to the full DB row shape.
        // Legacy payload → already in DB shape, pass through.
        const dbRows: FullEventRow[] =
          v === 1
            ? decodeBatch(events as unknown as CompactEventRow[])
            : (events as unknown as FullEventRow[]);

        const { createClient } = await import("@supabase/supabase-js");
        const authClient = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: {
              storage: undefined,
              persistSession: false,
              autoRefreshToken: false,
            },
          },
        );
        const { data: userData, error: userErr } = await authClient.auth.getUser(token);
        if (userErr || !userData?.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = userData.user.id;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rows = dbRows.map((e) => ({ ...e, user_id: userId }));
        const { error } = await supabaseAdmin.from("filter_analytics_events").insert(rows);
        if (error) {
          return new Response("Insert failed", { status: 500 });
        }
        return new Response("ok", { status: 202 });
      },
    },
  },
});
