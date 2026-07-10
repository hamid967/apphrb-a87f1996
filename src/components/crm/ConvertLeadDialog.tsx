import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { convertLeadToDeal } from "@/lib/deals.functions";
import { listProperties } from "@/lib/properties.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: {
    id: string;
    org_id: string;
    property_id?: string | null;
    currency?: string | null;
    budget_max?: number | null;
    budget_min?: number | null;
  };
  onConverted?: (dealId: string) => void;
};

export function ConvertLeadDialog({ open, onOpenChange, lead, onConverted }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const navigate = useNavigate();

  const [propertyId, setPropertyId] = useState<string>(lead.property_id ?? "");
  const [offer, setOffer] = useState<string>(
    (lead.budget_max ?? lead.budget_min ?? "").toString(),
  );
  const [currency, setCurrency] = useState<string>(lead.currency ?? "SAR");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (open) {
      setPropertyId(lead.property_id ?? "");
      setOffer((lead.budget_max ?? lead.budget_min ?? "").toString());
      setCurrency(lead.currency ?? "SAR");
      setNotes("");
    }
  }, [open, lead]);

  const propsQ = useQuery({
    queryKey: ["properties", lead.org_id],
    queryFn: () => listProperties({ data: { org_id: lead.org_id } }),
    enabled: open && !lead.property_id,
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!propertyId) throw new Error(String(t("crm.leads.needsProperty", "Pick a property")));
      return convertLeadToDeal({
        data: {
          lead_id: lead.id,
          property_id: propertyId,
          offer_amount: offer ? Number(offer) : null,
          currency,
          notes: notes || null,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(String(t("crm.leads.convert", "Converted")));
      onOpenChange(false);
      onConverted?.(res.id);
      navigate({ to: "/deals/$id", params: { id: res.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="size-5" /> {String(t("crm.leads.convert", "Convert to deal"))}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{String(t("crm.leads.property", "Property"))}</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder={String(t("crm.leads.pickProperty", "Select property"))} />
              </SelectTrigger>
              <SelectContent>
                {(propsQ.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {isAr ? p.title_ar : p.title_en}
                  </SelectItem>
                ))}
                {lead.property_id && !propsQ.data && (
                  <SelectItem value={lead.property_id}>
                    {String(t("crm.leads.currentProperty", "Current property"))}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{String(t("crm.deals.offerAmount", "Offer amount"))}</Label>
              <Input
                type="number"
                min="0"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
              />
            </div>
            <div>
              <Label>{String(t("crm.leads.currency", "Currency"))}</Label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div>
            <Label>{String(t("crm.leads.notes", "Notes"))}</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {String(t("common.cancel", "Cancel"))}
          </Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            {convert.isPending
              ? String(t("common.saving", "Saving..."))
              : String(t("crm.leads.convert", "Convert"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
