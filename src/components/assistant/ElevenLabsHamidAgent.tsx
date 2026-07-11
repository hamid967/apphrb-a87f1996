import { ExternalLink, Mic2, ShieldCheck, Sparkles } from "lucide-react";

export const ELEVENLABS_HAMID_AGENT_URL =
  "https://elevenlabs.io/app/talk-to?agent_id=agent_8501kx7gr269eprrn4fjmhvq282k&branch_id=agtbrch_4901kx7gr2s2enjr9mg6zebp3cdz";

type Props = {
  isAr?: boolean;
  className?: string;
};

export function ElevenLabsHamidAgent({ isAr = true, className = "" }: Props) {
  return (
    <section
      className={["studio-shell min-h-full overflow-hidden rounded-[2rem] p-4 sm:p-6", className].join(" ")}
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="mx-auto grid h-full max-w-7xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="studio-panel-dark studio-noise p-6">
          <div className="studio-eyebrow mb-5 border-white/15 bg-white/10 text-[#E8D9A6]">
            <Sparkles className="size-3.5" />
            {isAr ? "حامد عبر ElevenLabs" : "Hamid via ElevenLabs"}
          </div>
          <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl">
            {isAr ? "محادثة صوتية مباشرة مع حامد" : "Live voice conversation with Hamid"}
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#c9ddd4]">
            {isAr
              ? "هذه الصفحة تربط وكيل ElevenLabs المحدد داخل لوحة HBSpro. اسمح للمتصفح باستخدام المايك عند الطلب."
              : "This page embeds the selected ElevenLabs agent inside HBSpro. Allow microphone access when prompted."}
          </p>

          <div className="mt-6 space-y-3">
            {[
              isAr ? "يدعم المحادثة الصوتية المباشرة" : "Supports live voice conversations",
              isAr ? "مناسب للدعم والتسجيل والإرشاد" : "Useful for support, onboarding, and guidance",
              isAr ? "يمكن فتحه خارجيًا إذا منع المتصفح التضمين" : "Can open externally if embedding is blocked",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-[#E8D9A6]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#C5A059]" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <a
            href={ELEVENLABS_HAMID_AGENT_URL}
            target="_blank"
            rel="noreferrer"
            className="studio-button mt-7 w-full px-5 py-3 text-sm"
          >
            <ExternalLink className="size-4" />
            {isAr ? "فتح في ElevenLabs" : "Open in ElevenLabs"}
          </a>
        </aside>

        <div className="studio-card-lg flex min-h-[720px] flex-col overflow-hidden bg-white/90">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C5A059]/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-[#043927] text-[#C5A059]">
                <Mic2 className="size-5" />
              </span>
              <div>
                <div className="font-black text-[#043927]">
                  {isAr ? "وكيل حامد الصوتي" : "Hamid Voice Agent"}
                </div>
                <div className="text-xs text-muted-foreground">agent_8501kx7gr269eprrn4fjmhvq282k</div>
              </div>
            </div>
            <span className="rounded-full border border-[#C5A059]/30 bg-[#C5A059]/10 px-3 py-1 text-xs font-bold text-[#043927]">
              ElevenLabs
            </span>
          </div>

          <iframe
            title={isAr ? "مساعد حامد عبر ElevenLabs" : "Hamid ElevenLabs assistant"}
            src={ELEVENLABS_HAMID_AGENT_URL}
            className="min-h-[680px] flex-1 border-0"
            allow="microphone; autoplay"
            referrerPolicy="strict-origin-when-cross-origin"
          />

          <div className="border-t border-[#C5A059]/20 bg-[#f5f0e0]/70 px-4 py-3 text-xs leading-6 text-[#486357]">
            {isAr
              ? "إذا لم يظهر الوكيل داخل الإطار، استخدم زر فتح في ElevenLabs. بعض إعدادات المتصفح أو ElevenLabs قد تمنع التضمين داخل iframe."
              : "If the agent does not appear in the frame, use Open in ElevenLabs. Some browser or ElevenLabs settings may block iframe embedding."}
          </div>
        </div>
      </div>
    </section>
  );
}
