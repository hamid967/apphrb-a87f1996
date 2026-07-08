import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listUnits } from "@/lib/units.functions";
import { listTenants, createTenant } from "@/lib/tenants.functions";
import { createContract } from "@/lib/contracts.functions";
import { z } from "zod";

import { sectionHead } from "@/lib/section-og-head";
const searchSchema = z.object({ unitId: z.string().optional() }).partial();

export const Route = createFileRoute("/_authenticated/dashboard/contracts/new")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => sectionHead({ section: "dashboard", entityAr: "عقد جديد", entityEn: "New Contract", path: "/dashboard/contracts/new" }),
  component: NewContractWizard,
});

type Step = 1 | 2 | 3 | 4;

const todayISO = () => new Date().toISOString().slice(0, 10);

function NewContractWizard() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const nav = useNavigate();
  const qc = useQueryClient();
  const { unitId: prefUnit } = Route.useSearch();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;

  const unitsQ = useQuery({
    queryKey: ["units", org?.id],
    queryFn: () => listUnits({ data: { org_id: org!.id } }),
    enabled: !!org,
  });
  const tenantsQ = useQuery({
    queryKey: ["tenants", org?.id],
    queryFn: () => listTenants({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [step, setStep] = useState<Step>(1);
  const [unitId, setUnitId] = useState<string>(prefUnit ?? "");
  const [tenantId, setTenantId] = useState<string>("");
  const [newTenant, setNewTenant] = useState({ full_name: "", email: "", phone: "" });
  const [terms, setTerms] = useState({
    start_date: todayISO(),
    end_date: (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    })(),
    amount: "",
    payment_frequency: "monthly" as "monthly" | "quarterly" | "semi_annual" | "annual",
    deposit: "0",
    notes: "",
  });

  const vacantUnits = useMemo(
    () => (unitsQ.data ?? []).filter((u) => u.status === "vacant"),
    [unitsQ.data],
  );
  const selectedUnit = useMemo(
    () => (unitsQ.data ?? []).find((u) => u.id === unitId),
    [unitsQ.data, unitId],
  );
  const selectedTenant = useMemo(
    () => (tenantsQ.data ?? []).find((t) => t.id === tenantId),
    [tenantsQ.data, tenantId],
  );

  const createTenantMut = useMutation({
    mutationFn: createTenant,
    onSuccess: (t) => {
      toast.success(i18n.t("newContract.tenantCreated"));
      qc.invalidateQueries({ queryKey: ["tenants", org?.id] });
      setTenantId(t.id);
      setNewTenant({ full_name: "", email: "", phone: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: createContract,
    onSuccess: (r) => {
      toast.success(i18n.t("newContract.contractCreated"));
      qc.invalidateQueries({ queryKey: ["contracts", org?.id] });
      nav({ to: "/dashboard/contracts/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canNext =
    (step === 1 && !!unitId) ||
    (step === 2 && !!tenantId) ||
    (step === 3 &&
      !!terms.amount &&
      Number(terms.amount) > 0 &&
      terms.start_date < terms.end_date) ||
    step === 4;

  const submit = () => {
    if (!org) return;
    createMut.mutate({
      data: {
        org_id: org.id,
        unit_id: unitId,
        tenant_id: tenantId,
        type: "rent",
        start_date: terms.start_date,
        end_date: terms.end_date,
        amount: Number(terms.amount),
        currency_code: "SAR",
        payment_frequency: terms.payment_frequency,
        deposit: Number(terms.deposit || 0),
        notes: terms.notes || null,
        activate: true,
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <button
        onClick={() => nav({ to: "/dashboard/contracts" })}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("newContract.back")}
      </button>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("newContract.title")}
      </h1>

      <Stepper step={step} t={t} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">
            {step === 1 && t("newContract.step1")}
            {step === 2 && t("newContract.step2")}
            {step === 3 && t("newContract.step3")}
            {step === 4 && t("newContract.step4")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <div className="space-y-2">
              <Label>{t("newContract.vacantUnit")}</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("newContract.pickVacant")} />
                </SelectTrigger>
                <SelectContent>
                  {vacantUnits.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      {t("newContract.noVacant")}
                    </div>
                  ) : (
                    vacantUnits.map((u) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const b: any = (u as any).buildings;
                      return (
                        <SelectItem key={u.id} value={u.id}>
                          {u.code} · {b?.name ?? "—"}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              {selectedUnit && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {t("newContract.refRent", {
                    amt: selectedUnit.rent_amount ?? "—",
                    cur: selectedUnit.currency_code ?? "SAR",
                    type: selectedUnit.type ?? "—",
                  })}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("newContract.existingTenant")}</Label>
                <Select value={tenantId} onValueChange={setTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("newContract.pickTenant")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(tenantsQ.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">{t("newContract.orCreateTenant")}</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    placeholder={t("newContract.fullName")}
                    value={newTenant.full_name}
                    onChange={(e) => setNewTenant({ ...newTenant, full_name: e.target.value })}
                  />
                  <Input
                    placeholder={t("newContract.email")}
                    value={newTenant.email}
                    onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                  />
                  <Input
                    placeholder={t("newContract.phone")}
                    value={newTenant.phone}
                    onChange={(e) => setNewTenant({ ...newTenant, phone: e.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  disabled={
                    createTenantMut.isPending || newTenant.full_name.trim().length < 2 || !org
                  }
                  onClick={() =>
                    createTenantMut.mutate({
                      data: {
                        org_id: org!.id,
                        full_name: newTenant.full_name,
                        email: newTenant.email,
                        phone: newTenant.phone,
                      },
                    })
                  }
                >
                  <UserPlus className="me-2 size-4" /> {t("newContract.createTenant")}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{t("newContract.startDate")}</Label>
                <Input
                  type="date"
                  value={terms.start_date}
                  onChange={(e) => setTerms({ ...terms, start_date: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("newContract.endDate")}</Label>
                <Input
                  type="date"
                  value={terms.end_date}
                  onChange={(e) => setTerms({ ...terms, end_date: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("newContract.annualSar")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={terms.amount}
                  onChange={(e) => setTerms({ ...terms, amount: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("newContract.freq")}</Label>
                <Select
                  value={terms.payment_frequency}
                  onValueChange={(v) =>
                    setTerms({ ...terms, payment_frequency: v as typeof terms.payment_frequency })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{t("newContract.monthly")}</SelectItem>
                    <SelectItem value="quarterly">{t("newContract.quarterly")}</SelectItem>
                    <SelectItem value="semi_annual">{t("newContract.semi_annual")}</SelectItem>
                    <SelectItem value="annual">{t("newContract.annual")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t("newContract.deposit")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={terms.deposit}
                  onChange={(e) => setTerms({ ...terms, deposit: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>{t("newContract.notes")}</Label>
                <Textarea
                  rows={2}
                  value={terms.notes}
                  onChange={(e) => setTerms({ ...terms, notes: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-sm">
              <Row k={t("newContract.unit")} v={selectedUnit?.code ?? "—"} />
              <Row k={t("newContract.tenant")} v={selectedTenant?.full_name ?? "—"} />
              <Row k={t("newContract.duration")} v={`${terms.start_date} → ${terms.end_date}`} />
              <Row
                k={t("newContract.annualValue")}
                v={`${Number(terms.amount || 0).toLocaleString(isAr ? "ar" : "en")} SAR`}
              />
              <Row k={t("newContract.freq")} v={t(`newContract.${terms.payment_frequency}`)} />
              <Row
                k={t("newContract.deposit")}
                v={`${Number(terms.deposit || 0).toLocaleString(isAr ? "ar" : "en")} SAR`}
              />
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                {t("newContract.activateNote")}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" disabled={step === 1} onClick={() => setStep((step - 1) as Step)}>
          <ArrowRight className="me-2 size-4" /> {t("newContract.prev")}
        </Button>
        {step < 4 ? (
          <Button disabled={!canNext} onClick={() => setStep((step + 1) as Step)}>
            {t("newContract.next")} <ArrowLeft className="ms-2 size-4" />
          </Button>
        ) : (
          <Button disabled={createMut.isPending} onClick={submit}>
            <Check className="me-2 size-4" />{" "}
            {createMut.isPending ? t("newContract.saving") : t("newContract.activate")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step, t }: { step: Step; t: (k: string) => string }) {
  const labels = [
    t("newContract.stepUnit"),
    t("newContract.stepTenant"),
    t("newContract.stepTerms"),
    t("newContract.stepReview"),
  ];
  return (
    <div className="mt-6 flex items-center gap-2">
      {labels.map((l, i) => {
        const idx = (i + 1) as Step;
        const active = idx === step;
        const done = idx < step;
        return (
          <div key={l} className="flex items-center gap-2">
            <div
              className={
                "grid size-7 place-items-center rounded-full text-xs font-medium " +
                (active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground")
              }
            >
              {done ? <Check className="size-4" /> : i + 1}
            </div>
            <span className={"text-sm " + (active ? "font-medium" : "text-muted-foreground")}>
              {l}
            </span>
            {i < labels.length - 1 && <div className="mx-1 h-px w-6 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
