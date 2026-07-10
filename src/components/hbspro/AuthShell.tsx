import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { HBS } from "./tokens";

export function HBSAuthShell({
  children,
  eyebrow,
  topRight,
}: {
  children: ReactNode;
  eyebrow?: string;
  topRight?: ReactNode;
}) {
  return (
    <div
      className="relative min-h-[var(--app-height,100vh)] overflow-hidden"
      style={{ background: HBS.bg, color: HBS.white }}
    >
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div
          className="absolute -top-40 -start-40 size-[520px] rounded-full blur-3xl"
          style={{ background: `${HBS.blue}33` }}
        />
        <div
          className="absolute -bottom-40 -end-40 size-[520px] rounded-full blur-3xl"
          style={{ background: `${HBS.gold}22` }}
        />
      </div>

      {topRight && <div className="absolute top-4 end-4 z-20">{topRight}</div>}

      <div className="relative z-10 mx-auto grid min-h-[var(--app-height,100vh)] w-full max-w-md place-items-center px-4 py-10">
        <div className="relative w-full">
          <div
            className="pointer-events-none absolute -inset-[1px] rounded-3xl"
            aria-hidden
            style={{
              background: `conic-gradient(from 0deg, ${HBS.gold}, transparent 30%, ${HBS.blue}, transparent 70%, ${HBS.gold})`,
              filter: "blur(8px)",
              opacity: 0.35,
            }}
          />
          <div
            className="relative rounded-3xl p-8 backdrop-blur-2xl"
            style={{
              background: `linear-gradient(160deg, rgba(11,27,44,0.92), rgba(7,19,32,0.96))`,
              border: `1px solid ${HBS.border}`,
              boxShadow: `0 40px 120px -30px ${HBS.blue}, 0 0 0 1px rgba(212,175,55,0.08) inset`,
            }}
          >
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Link to="/" className="flex items-center gap-2" style={{ color: HBS.white }}>
                <span
                  className="grid size-9 place-items-center rounded-xl"
                  style={{ background: `linear-gradient(140deg, ${HBS.gold}, ${HBS.blue})` }}
                >
                  <Building2 className="size-4 text-white" />
                </span>
                <span>
                  HBSpro <span style={{ color: HBS.gold }}>AI</span>
                </span>
              </Link>
              {eyebrow && (
                <span
                  className="ms-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em]"
                  style={{ borderColor: HBS.border, color: HBS.goldSoft }}
                >
                  {eyebrow}
                </span>
              )}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export const hbsInputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  color: HBS.white,
  borderColor: HBS.border,
};

export const hbsInputClass = "border bg-transparent text-white placeholder:text-white/40";

export const hbsPrimaryBtnStyle: React.CSSProperties = {
  background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
  boxShadow: `0 20px 50px -15px ${HBS.gold}`,
  color: HBS.white,
  border: `1px solid ${HBS.border}`,
};
