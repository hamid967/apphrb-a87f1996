import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  getImportSettings,
  updateImportSettings,
  type DupStrategy,
  type ContactMatchKey,
} from "@/lib/import-settings.functions";
import { can, type OrgRole } from "@/lib/permissions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/settings/import")({
  head: () => sectionHead({ section: "dashboard", entityAr: "الاستيراد", entityEn: "Import", path: "/dashboard/settings/import" }),
  component: ImportSettingsPage,
});

function ImportSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const membership = orgsQ.data?.[0];
  const org = membership?.org;
  const role = membership?.role as OrgRole | undefined;
  const canEdit = can.deleteCRM(role); // owner/admin

  const settingsQ = useQuery({
    queryKey: ["import-settings", org?.id],
    queryFn: () => getImportSettings({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [contactsStrategy, setContactsStrategy] = useState<DupStrategy>("skip");
  const [leadsStrategy, setLeadsStrategy] = useState<DupStrategy>("skip");
  const [matchKeys, setMatchKeys] = useState<ContactMatchKey[]>(["email", "phone"]);

  useEffect(() => {
    if (settingsQ.data) {
      setContactsStrategy(settingsQ.data.contacts_strategy);
      setLeadsStrategy(settingsQ.data.leads_strategy);
      setMatchKeys(settingsQ.data.contacts_match_keys);
    }
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: () =>
      updateImportSettings({
        data: {
          org_id: org!.id,
          contacts_strategy: contactsStrategy,
          contacts_match_keys: matchKeys.length ? matchKeys : ["email"],
          leads_strategy: leadsStrategy,
        },
      }),
    onSuccess: () => {
      toast.success(t("importSettings.saved"));
      qc.invalidateQueries({ queryKey: ["import-settings", org?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const toggleKey = (k: ContactMatchKey) =>
    setMatchKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("importSettings.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("importSettings.subtitle")}</p>
      {!canEdit && (
        <div className="mt-4 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("importSettings.adminOnly")}
        </div>
      )}

      <fieldset disabled={!canEdit} className="mt-6 space-y-6">
        <section className="surface-card p-5">
          <h2 className="text-lg font-semibold">{t("importSettings.contactsSection")}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label className="mb-2 block">{t("importSettings.matchBy")}</Label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={matchKeys.includes("email")}
                    onCheckedChange={() => toggleKey("email")}
                  />
                  {t("importSettings.matchEmail")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={matchKeys.includes("phone")}
                    onCheckedChange={() => toggleKey("phone")}
                  />
                  {t("importSettings.matchPhone")}
                </label>
              </div>
            </div>
            <StrategyRadio value={contactsStrategy} onChange={setContactsStrategy} t={t} />
          </div>
        </section>

        <section className="surface-card p-5">
          <h2 className="text-lg font-semibold">{t("importSettings.leadsSection")}</h2>
          <div className="mt-4">
            <StrategyRadio value={leadsStrategy} onChange={setLeadsStrategy} t={t} />
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !canEdit || !org}>
            {t("importSettings.save")}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}

function StrategyRadio({
  value,
  onChange,
  t,
}: {
  value: DupStrategy;
  onChange: (v: DupStrategy) => void;
  t: (k: string) => string;
}) {
  return (
    <div>
      <Label className="mb-2 block">{t("importSettings.strategy")}</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as DupStrategy)}
        className="space-y-2"
      >
        {(["skip", "update", "merge"] as DupStrategy[]).map((s) => (
          <label
            key={s}
            className="flex items-center gap-3 rounded-lg border bg-background p-3 text-sm"
          >
            <RadioGroupItem value={s} />
            <span>{t(`importSettings.${s}`)}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
