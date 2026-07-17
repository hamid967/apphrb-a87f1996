import { ArrowLeft, Mail, Sparkles, X } from "lucide-react";

type UpgradeReason = {
  title: string;
  message: string;
  plan?: { name_ar?: string; code?: string } | null;
};

export function PlanUpgradeDialog({
  reason,
  onClose,
}: {
  reason: UpgradeReason | null;
  onClose: () => void;
}) {
  if (!reason) return null;

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-[#071729]/70 p-4 backdrop-blur-xl" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-[#0A1A2F] text-white shadow-[0_34px_120px_-60px_rgba(0,217,192,0.85)]">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div className="inline-flex items-center gap-2 text-sm font-black text-[#00D9C0]">
            <Sparkles className="size-4" />
            ترقية الباقة
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/15" aria-label="إغلاق">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6">
          <h2 className="text-3xl font-black">{reason.title}</h2>
          <p className="mt-3 leading-8 text-slate-300">{reason.message}</p>

          <div className="mt-6 rounded-2xl border border-[#00D9C0]/20 bg-[#00D9C0]/10 p-4 text-sm leading-7 text-slate-200">
            لا توجد بوابة دفع مفعلة حالياً. الترقية تتم بالتواصل اليدوي مع فريق HBSpro لتفعيل الباقة المناسبة، دون إرسال بيانات حسابك تلقائياً.
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="mailto:app@hrhbs.com?subject=HBSpro%20Upgrade"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#00D9C0] px-5 py-3 text-sm font-black text-[#071729]"
            >
              <Mail className="size-4" />
              تواصل للترقية
            </a>
            <a
              href="/#pricing"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white"
            >
              عرض الباقات
              <ArrowLeft className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
