import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, Users2, Building2, ScrollText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminGlobalSearch, type AdminSearchResult } from "@/lib/admin-search.functions";

const STATUSES = ["approved", "pending", "rejected", "suspended"] as const;

export function AdminGlobalSearch({ isAr }: { isAr: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [result, setResult] = useState<AdminSearchResult | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      adminGlobalSearch({
        data: {
          q,
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(to + "T23:59:59").toISOString() : null,
          status: status === "all" ? null : status,
        },
      }),
    onSuccess: (r) => setResult(r),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    mut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Search className="size-4" />{" "}
          <span className="hidden sm:inline">{isAr ? "بحث شامل" : "Global search"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isAr ? "البحث الشامل (Super Admin)" : "Global search (Super Admin)"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                isAr ? "ابحث عن مستخدم، مؤسسة، حدث…" : "Search users, orgs, audit events…"
              }
            />
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {isAr ? "بحث" : "Search"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label className="text-xs">{isAr ? "من تاريخ" : "From"}</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">{isAr ? "إلى تاريخ" : "To"}</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">{isAr ? "حالة المستخدم" : "User status"}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>

        {mut.isError && <p className="text-sm text-destructive">{(mut.error as Error).message}</p>}

        <div className="mt-2 max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {result && (
            <>
              <Section
                icon={<Users2 className="size-4" />}
                title={isAr ? "المستخدمون" : "Users"}
                count={result.users.length}
              >
                {result.users.map((u) => (
                  <Link
                    key={u.id}
                    to="/admin/users"
                    onClick={() => setOpen(false)}
                    className="block rounded-md border p-2 hover:bg-muted"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {u.full_name ?? u.id.slice(0, 8)}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {u.approval_status}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.phone ?? "—"} · {new Date(u.created_at).toLocaleDateString()}
                    </div>
                  </Link>
                ))}
              </Section>

              <Section
                icon={<Building2 className="size-4" />}
                title={isAr ? "المؤسسات" : "Organizations"}
                count={result.organizations.length}
              >
                {result.organizations.map((o) => (
                  <div key={o.id} className="rounded-md border p-2">
                    <div className="truncate text-sm font-medium">{o.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {o.slug} · {new Date(o.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </Section>

              <Section
                icon={<ScrollText className="size-4" />}
                title={isAr ? "سجل التدقيق" : "Audit log"}
                count={result.audit.length}
              >
                {result.audit.map((a) => (
                  <Link
                    key={a.id}
                    to="/admin/audit-log"
                    onClick={() => setOpen(false)}
                    className="block rounded-md border p-2 hover:bg-muted"
                  >
                    <div className="truncate text-sm font-medium">
                      {a.action} · {a.entity}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.entity_id} · {new Date(a.created_at).toLocaleString()}
                    </div>
                  </Link>
                ))}
              </Section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {icon} {title} <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <div className="grid gap-1.5">{children}</div>
      )}
    </div>
  );
}
