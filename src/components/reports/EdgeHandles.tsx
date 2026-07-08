import React from "react";

export type EdgeHandlesScale = ((v: string) => number | undefined) & {
  domain?: () => string[];
  bandwidth?: () => number;
};
export type EdgeHandlesInjected = {
  xAxisMap?: Record<string, { scale?: EdgeHandlesScale }>;
  offset?: { left: number; top: number; width: number; height: number };
};
export type EdgeHandlesProps = EdgeHandlesInjected & {
  from: string;
  to: string;
  editing: boolean;
  onStart: (which: "from" | "to") => void;
  onMove: (next: { from: string; to: string }) => void;
  onEnd: () => void;
  onCancel: () => void;
  onAnnounce?: (text: string) => void;
};

export function EdgeHandles({
  xAxisMap,
  offset,
  from: hFrom,
  to: hTo,
  editing,
  onStart,
  onMove,
  onEnd,
  onCancel,
  onAnnounce,
}: EdgeHandlesProps) {
  if (!xAxisMap || !offset) return null;
  const axis = xAxisMap[Object.keys(xAxisMap)[0]];
  const scale = axis?.scale;
  if (!scale || typeof scale.domain !== "function" || typeof scale.bandwidth !== "function")
    return null;
  const domain = scale.domain();
  const bw = scale.bandwidth();
  const posOf = (d: string): number | null => {
    const v = scale(d);
    return typeof v === "number" ? v + bw / 2 : null;
  };
  const fx = posOf(hFrom);
  const tx = posOf(hTo);
  if (fx == null || tx == null) return null;
  const top = offset.top;
  const bottom = offset.top + offset.height;
  const dayAtX = (x: number): string => {
    let best = domain[0];
    let bestD = Infinity;
    for (const d of domain) {
      const p = posOf(d);
      if (p == null) continue;
      const dist = Math.abs(p - x);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  };
  const activeRef = { current: null as null | "from" | "to" };
  const beginDrag = (which: "from" | "to") => (e: React.PointerEvent<SVGRectElement>) => {
    e.stopPropagation();
    (e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
    activeRef.current = which;
    onStart(which);
  };
  const moveDrag = (e: React.PointerEvent<SVGRectElement>) => {
    if (!activeRef.current) return;
    e.stopPropagation();
    const svg = (e.currentTarget as SVGRectElement).ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const day = dayAtX(e.clientX - rect.left);
    const which = activeRef.current;
    const other = which === "from" ? hTo : hFrom;
    const [a, b] = [day, other].sort();
    activeRef.current = day <= other ? "from" : "to";
    onMove({ from: a, to: b });
  };
  const endDrag = (e: React.PointerEvent<SVGRectElement>) => {
    if (!activeRef.current) return;
    e.stopPropagation();
    try {
      (e.currentTarget as SVGRectElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    activeRef.current = null;
    onEnd();
  };
  const onKeyDown = (which: "from" | "to") => (e: React.KeyboardEvent<SVGRectElement>) => {
    const key = e.key;
    const current = which === "from" ? hFrom : hTo;
    const idx = domain.indexOf(current);
    if (idx < 0) return;
    const step = e.shiftKey ? 7 : 1;
    if (key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      onAnnounce?.("تم إلغاء تعديل النطاق");
      return;
    }
    if (key === "Enter" || key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (editing) {
        onEnd();
        onAnnounce?.(`تم تأكيد النطاق: ${hFrom} — ${hTo}`);
      }
      return;
    }
    let next = idx;
    if (key === "ArrowRight") next = Math.min(domain.length - 1, idx + step);
    else if (key === "ArrowLeft") next = Math.max(0, idx - step);
    else if (key === "Home") next = 0;
    else if (key === "End") next = domain.length - 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    if (!editing) onStart(which);
    const day = domain[next];
    const other = which === "from" ? hTo : hFrom;
    const [a, b] = [day, other].sort();
    onMove({ from: a, to: b });
    onAnnounce?.(`النطاق المحدد: ${a} — ${b}`);
  };
  const onBlur = () => {
    if (editing) onEnd();
  };
  const stroke = editing ? "#F59E0B" : "#D4AF37";
  const minDay = domain[0];
  const maxDay = domain[domain.length - 1];
  return (
    <g>
      {(["from", "to"] as const).map((k) => {
        const x = k === "from" ? fx : tx;
        const val = k === "from" ? hFrom : hTo;
        const label = k === "from" ? "مقبض بداية النطاق (من)" : "مقبض نهاية النطاق (إلى)";
        return (
          <g key={k}>
            <line
              x1={x}
              y1={top}
              x2={x}
              y2={bottom}
              stroke={stroke}
              strokeWidth={2}
              pointerEvents="none"
            />
            <rect
              x={x - 10}
              y={top}
              width={20}
              height={bottom - top}
              fill="transparent"
              style={{ cursor: "ew-resize", touchAction: "none" }}
              onPointerDown={beginDrag(k)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              tabIndex={0}
              role="slider"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={domain.length - 1}
              aria-valuenow={Math.max(0, domain.indexOf(val))}
              aria-valuetext={`${val} (من ${minDay} إلى ${maxDay})`}
              aria-orientation="horizontal"
              aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End Enter Escape"
              onKeyDown={onKeyDown(k)}
              onBlur={onBlur}
              className="focus:outline-none focus-visible:outline-none"
              data-testid={`edge-handle-${k}`}
            />
            <circle
              cx={x}
              cy={top + 8}
              r={6}
              fill={stroke}
              stroke="#fff"
              strokeWidth={1.5}
              pointerEvents="none"
            />
            <circle
              cx={x}
              cy={bottom - 8}
              r={6}
              fill={stroke}
              stroke="#fff"
              strokeWidth={1.5}
              pointerEvents="none"
            />
            <rect
              x={x - 10}
              y={top}
              width={20}
              height={bottom - top}
              fill="none"
              stroke="#2563EB"
              strokeWidth={2}
              strokeDasharray="3 3"
              pointerEvents="none"
              className="opacity-0 [rect:focus-visible+&]:opacity-100"
            />
          </g>
        );
      })}
    </g>
  );
}
