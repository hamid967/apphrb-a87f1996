import { motion } from "motion/react";
import { useState } from "react";
import { CITIES, HBS } from "./tokens";

// Stylised Saudi Arabia outline (approx). viewBox 900x720.
const KSA_PATH =
  "M180,210 L260,150 L360,140 L440,170 L520,150 L620,180 L720,220 L790,270 L820,340 L800,410 L760,470 L700,500 L640,540 L580,580 L520,640 L450,680 L380,680 L340,640 L300,600 L280,540 L260,470 L230,410 L210,340 L190,280 Z";

export function SaudiMap({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState<string | null>("Riyadh");
  const height = compact ? 380 : 560;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox="0 0 900 720"
        className="absolute inset-0 h-full w-full"
        style={{ filter: "drop-shadow(0 0 40px rgba(30,136,229,0.25))" }}
      >
        <defs>
          <radialGradient id="ksa-fill" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#0d2438" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#050e18" stopOpacity="0.95" />
          </radialGradient>
          <linearGradient id="ksa-stroke" x1="0" x2="1">
            <stop offset="0%" stopColor={HBS.gold} stopOpacity="0.9" />
            <stop offset="100%" stopColor={HBS.blue} stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="city-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HBS.gold} stopOpacity="0.9" />
            <stop offset="100%" stopColor={HBS.gold} stopOpacity="0" />
          </radialGradient>
          <filter id="soft-glow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* grid backdrop */}
        <g opacity="0.08" stroke={HBS.blue}>
          {Array.from({ length: 18 }).map((_, i) => (
            <line key={`h${i}`} x1="0" x2="900" y1={i * 40} y2={i * 40} strokeWidth="0.5" />
          ))}
          {Array.from({ length: 22 }).map((_, i) => (
            <line key={`v${i}`} y1="0" y2="720" x1={i * 40} x2={i * 40} strokeWidth="0.5" />
          ))}
        </g>

        <path d={KSA_PATH} fill="url(#ksa-fill)" stroke="url(#ksa-stroke)" strokeWidth="1.5" />

        {/* network lines from Riyadh hub */}
        {CITIES.filter(
          (c) => c.name !== "Riyadh" && Number.isFinite(c.x) && Number.isFinite(c.y),
        ).map((c, i) => {
          const riyadh = CITIES[0];
          if (!Number.isFinite(riyadh?.x) || !Number.isFinite(riyadh?.y)) return null;
          return (
            <g key={`ln-${c.name}`}>
              <line
                x1={riyadh.x}
                y1={riyadh.y}
                x2={c.x}
                y2={c.y}
                stroke={HBS.blue}
                strokeOpacity="0.25"
                strokeWidth="0.8"
                strokeDasharray="2 4"
              />
              <motion.circle
                cx={riyadh.x}
                cy={riyadh.y}
                r="2.4"
                fill={HBS.gold}
                initial={{ opacity: 0, cx: riyadh.x, cy: riyadh.y }}
                animate={{
                  cx: [riyadh.x, c.x],
                  cy: [riyadh.y, c.y],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 3 + (i % 4),
                  repeat: Infinity,
                  delay: i * 0.35,
                  ease: "easeInOut",
                }}
              />
            </g>
          );
        })}

        {/* cities */}
        {CITIES.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y)).map((c) => {
          const isActive = active === c.name;
          return (
            <g
              key={c.name}
              onMouseEnter={() => setActive(c.name)}
              onFocus={() => setActive(c.name)}
              tabIndex={0}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={c.x}
                cy={c.y}
                r="22"
                fill="url(#city-glow)"
                filter="url(#soft-glow)"
                opacity={isActive ? 1 : 0.55}
              />
              <circle cx={c.x} cy={c.y} r={c.hub ? 5 : 3.2} fill={HBS.gold} />
              <circle
                cx={c.x}
                cy={c.y}
                r={c.hub ? 9 : 6}
                fill="none"
                stroke={HBS.gold}
                strokeOpacity="0.5"
              />
              <text
                x={c.x + 10}
                y={c.y + 4}
                fill={isActive ? HBS.white : HBS.gray}
                fontSize="11"
                fontWeight={isActive ? 700 : 500}
              >
                {c.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* active city card */}
      {active && !compact && (
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 left-4 rounded-2xl border px-4 py-3 backdrop-blur-md"
          style={{ borderColor: HBS.border, background: "rgba(7,19,32,0.75)" }}
        >
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: HBS.gold }}>
            AI Node
          </div>
          <div className="text-lg font-semibold text-white">{active}</div>
          <div className="text-xs" style={{ color: HBS.gray }}>
            {CITIES.find((c) => c.name === active)?.ar} · Live sync 99.98%
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default SaudiMap;
