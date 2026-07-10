import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileMinus, FilePlus, FileDown, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listInvoiceNotes, createInvoiceNote, deleteInvoiceNote, getInvoiceNoteForPdf,
} from "@/lib/invoice-notes.functions";

type Note = Awaited<ReturnType<typeof listInvoiceNotes>>[number];

export function InvoiceNotesSection({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    note_type: "credit" as "credit" | "debit",
    reason: "",
    subtotal: 0,
    vat_rate: 15,
    notes: "",
  });

  const notesQ = useQuery({
    queryKey: ["invoice-notes", invoiceId],
    queryFn: () => listInvoiceNotes({ data: { invoiceId } }),
  });

  const createMut = useMutation({
    mutationFn: () => createInvoiceNote({ data: { invoiceId, ...form } }),
    onSuccess: (res) => {
      toast.success(isAr ? `تم إنشاء ${res?.number}` : `Created ${res?.number}`);
      qc.invalidateQueries({ queryKey: ["invoice-notes", invoiceId] });
      setOpen(false);
      setForm({ note_type: "credit", reason: "", subtotal: 0, vat_rate: 15, notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (noteId: string) => deleteInvoiceNote({ data: { noteId } }),
    onSuccess: () => {
      toast.success(isAr ? "تم الحذف" : "Deleted");
      qc.invalidateQueries({ queryKey: ["invoice-notes", invoiceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadPdf = async (n: Note) => {
    try {
      const data = await getInvoiceNoteForPdf({ data: { noteId: n.id } });
      const { generateInvoicePdf, downloadPdfBlob } = await import("@/lib/zatca/pdf-invoice");
      const bytes = await generateInvoicePdf({
        invoice: {
          number: n.number,
          issue_date: n.issue_date,
          subtotal: Number(n.subtotal),
          vat_amount: Number(n.vat_amount),
          total: Number(n.total),
          currency: n.currency,
          notes: n.notes,
        },
        docKind: n.note_type === "credit" ? "credit_note" : "debit_note",
        reference: {
          number: data.original.number ?? invoiceNumber,
          issue_date: data.original.issue_date,
          reason: n.reason,
        },
        seller: data.seller,
        buyer: data.buyer,
        lines: [{
          description: n.reason,
          qty: 1,
          unit_price: Number(n.subtotal),
          vat_rate: Number(n.vat_rate),
          amount: Number(n.subtotal),
        }],
      });
      downloadPdfBlob(bytes, `${n.number}.pdf`);
      toast.success(isAr ? "تم تنزيل PDF" : "PDF downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const total = form.subtotal + form.subtotal * (form.vat_rate / 100);

  return (
    <Card className="p-4 md:p-6 space-y-4 border-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileMinus className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">
            {isAr ? "إشعارات دائنة / مدينة" : "Credit / Debit Notes"}
          </h2>
          {notesQ.data && notesQ.data.length > 0 && (
            <Badge variant="secondary">{notesQ.data.length}</Badge>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 me-1" />
              {isAr ? "إنشاء إشعار" : "Create Note"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle>
                {isAr ? "إشعار دائن/مدين" : "Credit / Debit Note"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{isAr ? "النوع" : "Type"}</Label>
                  <Select
                    value={form.note_type}
                    onValueChange={(v) => setForm((f) => ({ ...f, note_type: v as "credit" | "debit" }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">
                        <span className="flex items-center gap-2"><FileMinus className="h-4 w-4" /> {isAr ? "دائن (إرجاع/خصم)" : "Credit (refund/discount)"}</span>
                      </SelectItem>
                      <SelectItem value="debit">
                        <span className="flex items-center gap-2"><FilePlus className="h-4 w-4" /> {isAr ? "مدين (رسوم إضافية)" : "Debit (extra charge)"}</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isAr ? "نسبة الضريبة %" : "VAT %"}</Label>
                  <Input
                    type="number" min={0} max={100} step="0.01"
                    value={form.vat_rate}
                    onChange={(e) => setForm((f) => ({ ...f, vat_rate: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div>
                <Label>{isAr ? "السبب" : "Reason"} *</Label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder={isAr ? "مثال: إرجاع جزئي للخدمة" : "e.g. Partial service refund"}
                />
              </div>
              <div>
                <Label>{isAr ? "المبلغ قبل الضريبة" : "Subtotal (pre-VAT)"} *</Label>
                <Input
                  type="number" min={0} step="0.01"
                  value={form.subtotal}
                  onChange={(e) => setForm((f) => ({ ...f, subtotal: Number(e.target.value) }))}
                />
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>{isAr ? "الضريبة" : "VAT"}</span>
                  <span className="font-mono">{fmt(form.subtotal * (form.vat_rate / 100))}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>{isAr ? "الإجمالي" : "Total"}</span>
                  <span className="font-mono">{fmt(total)}</span>
                </div>
              </div>
              <div>
                <Label>{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !form.reason || form.subtotal <= 0}
              >
                {isAr ? "إنشاء" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {notesQ.isLoading ? (
        <div className="text-sm text-muted-foreground text-center p-6">{isAr ? "جارٍ التحميل…" : "Loading…"}</div>
      ) : !notesQ.data || notesQ.data.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center p-6 border rounded-md">
          {isAr ? "لا توجد إشعارات لهذه الفاتورة." : "No notes for this invoice yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {notesQ.data.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center gap-3 p-3 border rounded-md">
              <Badge variant={n.note_type === "credit" ? "destructive" : "default"}>
                {n.note_type === "credit"
                  ? (isAr ? "دائن" : "Credit")
                  : (isAr ? "مدين" : "Debit")}
              </Badge>
              <span className="font-mono text-sm font-semibold">{n.number}</span>
              <span className="text-sm text-muted-foreground">{n.issue_date}</span>
              <span className="flex-1 text-sm truncate" title={n.reason}>{n.reason}</span>
              <span className="font-mono text-sm font-semibold">
                {fmt(Number(n.total))} {n.currency}
              </span>
              <Button size="sm" variant="outline" onClick={() => downloadPdf(n)}>
                <FileDown className="h-3.5 w-3.5 me-1" />PDF
              </Button>
              <Button
                size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                onClick={() => {
                  if (confirm(isAr ? `حذف ${n.number}؟` : `Delete ${n.number}?`)) delMut.mutate(n.id);
                }}
                disabled={delMut.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
