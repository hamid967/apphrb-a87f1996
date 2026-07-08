/**
 * Integration tests for the archive/restore audit trail.
 *
 * Executes `public.log_soft_delete` — the SECURITY DEFINER RPC that
 * every `archive*` / `restore*` server function calls after a successful
 * update — directly against the database, then asserts that the resulting
 * `audit_log` row carries the expected `actor`, `at`, and `reason`.
 *
 * Runs inside a transaction that is always ROLLBACKed, so the database
 * is untouched. Skips automatically when `PGHOST` (managed psql access)
 * is not present, so it is safe in any CI environment.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const HAS_PG = Boolean(process.env.PGHOST);
const d = HAS_PG ? describe : describe.skip;

function psql(sql: string): string {
  return execFileSync("psql", ["-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Grab a real auth-linked user id (log_soft_delete's actor FK targets auth.users). */
function pickActor(): string {
  const id = psql("SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`No actor available: got "${id}"`);
  return id;
}

/**
 * Run a snippet inside a transaction impersonating `actor`, capturing
 * the audit_log rows created for the given entity_ids, then ROLLBACK.
 * We echo `<<<>>>` markers around the SELECT payload so the shell
 * output is easy to parse.
 */
function runInTx(actor: string, snippet: string, ids: string[]): Array<{
  entity: string;
  action: string;
  entity_id: string;
  actor: string;
  created_at: string;
  reason: string | null;
  at: string | null;
  soft_delete: string | null;
}> {
  const idList = ids.map((i) => `'${i}'::uuid`).join(",");
  const sql = `
    BEGIN;
    SET LOCAL "request.jwt.claims" TO '{"sub":"${actor}"}';
    ${snippet}
    SELECT '<<<' ||
           entity           || '§' ||
           action           || '§' ||
           entity_id::text  || '§' ||
           actor::text      || '§' ||
           created_at::text || '§' ||
           COALESCE(diff->>'reason','')      || '§' ||
           COALESCE(diff->>'at','')          || '§' ||
           COALESCE(diff->>'soft_delete','') ||
           '>>>'
      FROM public.audit_log
     WHERE entity_id IN (${idList})
     ORDER BY created_at ASC;
    ROLLBACK;
  `;
  const out = psql(sql);
  const rows: ReturnType<typeof runInTx> = [];
  for (const m of out.matchAll(/<<<([^>]+)>>>/g)) {
    const [entity, action, entity_id, act, created_at, reason, at, soft_delete] =
      m[1].split("§");
    rows.push({
      entity,
      action,
      entity_id,
      actor: act,
      created_at,
      reason: reason || null,
      at: at || null,
      soft_delete: soft_delete || null,
    });
  }
  return rows;
}

d("log_soft_delete audit trail", () => {
  const actor = pickActor();

  it("writes one row per id with the caller as actor, entity/action set, and an ISO `at` timestamp", () => {
    const ids = [randomUUID(), randomUUID()];
    const rows = runInTx(
      actor,
      `SELECT public.log_soft_delete('contracts','archive', ARRAY[${ids
        .map((i) => `'${i}'::uuid`)
        .join(",")}], 'unit test');`,
      ids,
    );

    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.actor).toBe(actor);
      expect(r.entity).toBe("contracts");
      expect(r.action).toBe("archive");
      expect(r.soft_delete).toBe("archive");
      expect(r.reason).toBe("unit test");
      expect(ids).toContain(r.entity_id);
      // `at` is set by the fn (now()); must parse as a valid date within the last minute.
      const at = new Date(r.at ?? "");
      expect(Number.isNaN(at.getTime())).toBe(false);
      expect(Math.abs(Date.now() - at.getTime())).toBeLessThan(60_000);
    }
  });

  it("stores reason=null in the diff when no reason is provided", () => {
    const id = randomUUID();
    const rows = runInTx(
      actor,
      `SELECT public.log_soft_delete('payments','restore', ARRAY['${id}'::uuid], NULL);`,
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("restore");
    expect(rows[0].entity).toBe("payments");
    expect(rows[0].reason).toBeNull();
  });

  it.each(["contracts", "payments", "tenants", "units"] as const)(
    "logs archive+restore round-trip for %s with matching actor/reason",
    (entity) => {
      const id = randomUUID();
      const rows = runInTx(
        actor,
        `SELECT public.log_soft_delete('${entity}','archive', ARRAY['${id}'::uuid], 'why archive');
         SELECT public.log_soft_delete('${entity}','restore', ARRAY['${id}'::uuid], 'why restore');`,
        [id],
      );
      expect(rows.map((r) => r.action)).toEqual(["archive", "restore"]);
      expect(rows.map((r) => r.reason)).toEqual(["why archive", "why restore"]);
      for (const r of rows) {
        expect(r.entity).toBe(entity);
        expect(r.actor).toBe(actor);
      }
    },
  );

  it("rejects unknown actions (guards against typos in server-fn callers)", () => {
    const id = randomUUID();
    expect(() =>
      psql(
        `BEGIN; SET LOCAL "request.jwt.claims" TO '{"sub":"${actor}"}'; ` +
          `SELECT public.log_soft_delete('contracts','delete', ARRAY['${id}'::uuid], NULL); ROLLBACK;`,
      ),
    ).toThrow(/Invalid action/);
  });

  it("rejects calls without an authenticated user (auth.uid() is required)", () => {
    const id = randomUUID();
    expect(() =>
      psql(
        `SELECT public.log_soft_delete('contracts','archive', ARRAY['${id}'::uuid], NULL);`,
      ),
    ).toThrow(/Not authenticated/);
  });

  it("no-ops on an empty id array and writes zero rows", () => {
    const rows = runInTx(actor, `SELECT public.log_soft_delete('units','archive', NULL, 'x');`, [
      randomUUID(),
    ]);
    expect(rows).toHaveLength(0);
  });
});