import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitDemoRequest } from "@/lib/demo-request.functions";
import { HBS } from "./tokens";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(160).optional(),
  units: z.string().trim().max(40).optional(),
  message: z.string().trim().max(2000).optional(),
});
type FormValues = z.infer<typeof schema>;

export function BookDemoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const submit = useServerFn(submitDemoRequest);
  const [done, setDone] = useState(false);

  const schemaLocal = z.object({
    name: z.string().trim().min(2, t("hbspro.demo.errName")).max(120),
    email: z.string().trim().email(t("hbspro.demo.errEmail")).max(255),
    phone: z.string().trim().max(40).optional(),
    company: z.string().trim().max(160).optional(),
    units: z.string().trim().max(40).optional(),
    message: z.string().trim().max(2000).optional(),
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schemaLocal),
    defaultValues: { name: "", email: "", phone: "", company: "", units: "", message: "" },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = form;

  async function onSubmit(values: FormValues) {
    try {
      await submit({ data: { ...values, source: "homepage" } });
      setDone(true);
      toast.success(t("hbspro.demo.success"));
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("hbspro.demo.genericError"));
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) setDone(false);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg border text-white sm:rounded-3xl"
        style={{
          background: "rgba(7,19,32,0.96)",
          borderColor: HBS.border,
          backdropFilter: "blur(20px)",
        }}
      >
        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: HBS.gold }} />
            <h3 className="mt-4 text-xl font-semibold">{t("hbspro.demo.thanks")}</h3>
            <p className="mt-2 text-sm" style={{ color: HBS.gray }}>
              {t("hbspro.demo.thanksBody")}
            </p>
            <Button className="mt-6" onClick={() => handleOpenChange(false)}>
              {t("hbspro.demo.close")}
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-white">{t("hbspro.demo.title")}</DialogTitle>
              <DialogDescription style={{ color: HBS.gray }}>
                {t("hbspro.demo.desc")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("hbspro.demo.fullName")} error={errors.name?.message}>
                  <Input {...register("name")} maxLength={120} autoComplete="name" />
                </Field>
                <Field label={t("hbspro.demo.workEmail")} error={errors.email?.message}>
                  <Input type="email" {...register("email")} maxLength={255} autoComplete="email" />
                </Field>
                <Field label={t("hbspro.demo.company")} error={errors.company?.message}>
                  <Input {...register("company")} maxLength={160} autoComplete="organization" />
                </Field>
                <Field label={t("hbspro.demo.phone")} error={errors.phone?.message}>
                  <Input {...register("phone")} maxLength={40} autoComplete="tel" inputMode="tel" />
                </Field>
                <Field label={t("hbspro.demo.unitsManaged")} error={errors.units?.message}>
                  <Input
                    {...register("units")}
                    maxLength={40}
                    placeholder={t("hbspro.demo.unitsPh")}
                  />
                </Field>
                <Field label={t("hbspro.demo.preferredTime")} error={undefined}>
                  <Input
                    {...register("message")}
                    maxLength={80}
                    placeholder={t("hbspro.demo.timePh")}
                  />
                </Field>
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full font-semibold text-slate-900"
                style={{ background: HBS.gold }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("hbspro.demo.sending")}
                  </>
                ) : (
                  t("hbspro.demo.submit")
                )}
              </Button>
              <p className="text-center text-xs" style={{ color: HBS.gray }}>
                {t("hbspro.demo.privacy")}
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-1"
      style={{ color: HBS.gray }}
    >
      <span>{label}</span>
      <div className="[&_input]:bg-white/5 [&_input]:border-white/10 [&_input]:text-white [&_input]:placeholder:text-slate-500">
        {children}
      </div>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </label>
  );
}

export default BookDemoDialog;
