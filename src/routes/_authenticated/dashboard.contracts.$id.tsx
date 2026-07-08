import { createFileRoute, Link } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Printer, RefreshCw, Send, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  getContractDetail,
  markContractSentToEjar,
  renewContract,
  terminateContract,
} from "@/lib/contracts.functions";

export const Route = createFileRoute("/_authenticated/dashboard/contracts/$id")({
  head: ({ params }) => detailHead({ entityAr: 'عقد', entityEn: 'Contract', id: String(params.id), path: `/dashboard/contracts/${params.id}`, kind: 'article' }),
  component: ContractDetail,
});

const todayISO = () => new Date().toISOString().slice(0, 10);

function ContractDetail() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;
  const q = useQuery({
    queryKey: ["contract-detail", id, org?.id],
    queryFn: () => getContractDetail({ data: { orgId: org!.id, contractId: id } }),
    enabled: !!org,
  });

  const [renewOpen, setRenewOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [ejarOpen, setEjarOpen] = useState(false);
  const [ejarRef, setEjarRef] = useState("");

  const [renewForm, setRenewForm] = useState({ new_end_date: "", new_amount: "" });
  const [termForm, setTermForm] = useState({ termination_date: todayISO(), reason: "" });

  const renew = useMutation({
    mutationFn: renewContract,
    onSuccess: () => {
      toast.success(t("contracts.renewed"));
      qc.invalidateQueries({ queryKey: ["contract-detail", id] });
      qc.invalidateQueries({ queryKey: ["contracts", org?.id] });
      setRenewOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const term = useMutation({
    mutationFn: terminateContract,
    onSuccess: () => {
      toast.success(t("contracts.terminated"));
      qc.invalidateQueries({ queryKey: ["contract-detail", id] });
      qc.invalidateQueries({ queryKey: ["contracts", org?.id] });
      setTermOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ejar = useMutation({
    mutationFn: markContractSentToEjar,
    onSuccess: () => {
      toast.success(t("contracts.ejarMarked"));
      qc.invalidateQueries({ queryKey: ["contract-detail", id] });
      setEjarOpen(false);
      setEjarRef("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading)
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-muted-foreground">
        {t("contracts.loading")}
      </div>
    );
  if (!q.data) return null;
  const { contract: c, tenant, unit, building, owner } = q.data;
  const isActive = c.status === "active";
  const ejarSentAt: string | null = (c as { ejar_sent_at?: string | null }).ejar_sent_at ?? null;
  const ejarRefValue: string | null =
    (c as { ejar_reference?: string | null }).ejar_reference ?? null;

  // Build a deep-link to the Ejar portal, prefilled with what we can share
  // via URL query params. The real Ejar portal ignores unknown params, so this
  // is safe as a hint even when we don't have every field.
  const ejarDeepLink = (() => {
    const params = new URLSearchParams({
      contract_no: c.contract_number ?? "",
      start_date: c.start_date ?? "",
      end_date: c.end_date ?? "",
      amount: String(c.amount ?? ""),
      tenant_name: tenant?.full_name ?? "",
      unit_code: unit?.code ?? "",
    });
    return `https://eportal.ejar.sa/?${params.toString()}`;
  })();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        to="/dashboard/contracts"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("contracts.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {c.contract_number ?? t("contracts.contract")}
            </h1>
            <Badge variant="outline">{c.status}</Badge>
            {ejarSentAt && (
              <Badge variant="secondary" className="gap-1">
                <Send className="size-3" /> {t("contracts.ejarSent")}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant?.full_name ?? "—"} · {unit?.code ?? "—"}
          </p>
          {ejarSentAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("contracts.ejarSentOn", {
                date: new Date(ejarSentAt).toLocaleString(isAr ? "ar-SA-u-ca-islamic" : "en"),
              })}
              {ejarRefValue ? ` · ${t("contracts.ejarRef")} ${ejarRefValue}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="me-2 size-4" /> {t("contracts.printPdf")}
          </Button>
          <Button variant="secondary" onClick={() => setEjarOpen(true)}>
            <Send className="me-2 size-4" /> {t("contracts.ejarSend")}
          </Button>
          <Button variant="secondary" disabled={!isActive} onClick={() => setRenewOpen(true)}>
            <RefreshCw className="me-2 size-4" /> {t("contracts.renew")}
          </Button>
          <Button variant="destructive" disabled={!isActive} onClick={() => setTermOpen(true)}>
            <XCircle className="me-2 size-4" /> {t("contracts.terminate")}
          </Button>
        </div>
      </div>

      <div id="contract-print" className="mt-6 rounded-lg border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">{org?.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{t("contracts.leaseContract")}</div>
          </div>
          <div className="text-end text-sm">
            <div className="text-muted-foreground">{t("contracts.colNo")}</div>
            <div className="font-semibold">{c.contract_number ?? c.id.slice(0, 8)}</div>
          </div>
        </div>

        <div className="my-4 h-px bg-border" />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field k={t("contracts.landlord")} v={owner?.full_name ?? org?.name ?? "—"} />
          <Field k={t("contracts.tenantL")} v={tenant?.full_name ?? "—"} />
          <Field k={t("contracts.unitL")} v={unit?.code ?? "—"} />
          <Field k={t("contracts.buildingL")} v={building?.name ?? "—"} />
          <Field k={t("contracts.startL")} v={c.start_date} />
          <Field k={t("contracts.endL")} v={c.end_date} />
          <Field
            k={t("contracts.annualL")}
            v={`${Number(c.amount).toLocaleString(isAr ? "ar" : "en")} ${c.currency_code}`}
          />
          <Field k={t("contracts.freqL")} v={c.payment_frequency ?? "—"} />
          <Field
            k={t("contracts.depositL")}
            v={`${Number(c.deposit ?? 0).toLocaleString(isAr ? "ar" : "en")} ${c.currency_code}`}
          />
          <Field k={t("contracts.statusL")} v={c.status} />
        </div>

        {c.notes && (
          <>
            <div className="my-4 h-px bg-border" />
            <div className="text-xs text-muted-foreground">{t("contracts.notes")}</div>
            <div className="mt-1 whitespace-pre-wrap text-sm">{c.notes}</div>
          </>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs text-muted-foreground">
          <div>
            <div className="mb-8 border-b border-dashed" />
            {t("contracts.landlordSig")}
          </div>
          <div>
            <div className="mb-8 border-b border-dashed" />
            {t("contracts.tenantSig")}
          </div>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("contracts.payments")}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.data.payments.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("contracts.noPayments")}
            </div>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {q.data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">{p.paid_at}</span>
                  <span className="tabular-nums font-medium">
                    {Number(p.amount).toLocaleString(isAr ? "ar" : "en")} {p.currency_code}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("contracts.renewTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("contracts.newEndDate")}</Label>
              <Input
                type="date"
                value={renewForm.new_end_date}
                onChange={(e) => setRenewForm({ ...renewForm, new_end_date: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("contracts.newAmountOpt")}</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={String(c.amount)}
                value={renewForm.new_amount}
                onChange={(e) => setRenewForm({ ...renewForm, new_amount: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenewOpen(false)}>
              {t("contracts.cancel")}
            </Button>
            <Button
              disabled={renew.isPending || !renewForm.new_end_date}
              onClick={() =>
                renew.mutate({
                  data: {
                    id: c.id,
                    new_end_date: renewForm.new_end_date,
                    new_amount: renewForm.new_amount ? Number(renewForm.new_amount) : undefined,
                  },
                })
              }
            >
              {t("contracts.renew")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={termOpen} onOpenChange={setTermOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("contracts.termTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("contracts.termDate")}</Label>
              <Input
                type="date"
                value={termForm.termination_date}
                onChange={(e) => setTermForm({ ...termForm, termination_date: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("contracts.reason")}</Label>
              <Textarea
                rows={3}
                value={termForm.reason}
                onChange={(e) => setTermForm({ ...termForm, reason: e.target.value })}
              />
            </div>
            <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
              {t("contracts.termNote")}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTermOpen(false)}>
              {t("contracts.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={term.isPending || !termForm.termination_date}
              onClick={() =>
                term.mutate({
                  data: {
                    id: c.id,
                    termination_date: termForm.termination_date,
                    reason: termForm.reason || null,
                  },
                })
              }
            >
              {t("contracts.confirmTerm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #contract-print, #contract-print * { visibility: visible !important; }
          #contract-print { position: absolute; inset: 0; margin: 0; border: 0; }
        }
      `}</style>

      <Dialog open={ejarOpen} onOpenChange={setEjarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("contracts.ejarDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{t("contracts.ejarDialogDesc")}</p>
            <a
              href={ejarDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20"
            >
              <ExternalLink className="size-4" />
              {t("contracts.ejarOpenPortal")}
            </a>
            <div className="grid gap-1.5">
              <Label htmlFor="ejar-ref">{t("contracts.ejarRefLabel")}</Label>
              <Input
                id="ejar-ref"
                value={ejarRef}
                onChange={(e) => setEjarRef(e.target.value)}
                placeholder={t("contracts.ejarRefPlaceholder")}
                maxLength={64}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEjarOpen(false)}>
              {t("contracts.cancel")}
            </Button>
            <Button
              disabled={ejar.isPending}
              onClick={() => ejar.mutate({ data: { id: c.id, ejar_reference: ejarRef || null } })}
            >
              {t("contracts.ejarConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
