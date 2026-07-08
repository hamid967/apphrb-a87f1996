import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import { Flame, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPropertiesByCity, type CityCount } from "@/lib/properties-by-city.functions";

type RegionKey =
  | "riyadh"
  | "makkah"
  | "madinah"
  | "eastern"
  | "asir"
  | "jazan"
  | "najran"
  | "tabuk"
  | "qassim"
  | "hail"
  | "northern"
  | "baha"
  | "jouf";

const REGIONS: Record<RegionKey, { ar: string; en: string; lat: number; lng: number }> = {
  riyadh: { ar: "منطقة الرياض", en: "Riyadh Region", lat: 24.7, lng: 46.7 },
  makkah: { ar: "منطقة مكة المكرمة", en: "Makkah Region", lat: 21.4, lng: 39.9 },
  madinah: { ar: "منطقة المدينة", en: "Madinah Region", lat: 24.5, lng: 39.6 },
  eastern: { ar: "المنطقة الشرقية", en: "Eastern Province", lat: 26.4, lng: 50.1 },
  asir: { ar: "منطقة عسير", en: "Asir Region", lat: 18.2, lng: 42.5 },
  jazan: { ar: "منطقة جازان", en: "Jazan Region", lat: 16.9, lng: 42.6 },
  najran: { ar: "منطقة نجران", en: "Najran Region", lat: 17.5, lng: 44.1 },
  tabuk: { ar: "منطقة تبوك", en: "Tabuk Region", lat: 28.4, lng: 36.6 },
  qassim: { ar: "منطقة القصيم", en: "Qassim Region", lat: 26.3, lng: 43.9 },
  hail: { ar: "منطقة حائل", en: "Hail Region", lat: 27.5, lng: 41.7 },
  northern: { ar: "الحدود الشمالية", en: "Northern Borders", lat: 30.9, lng: 41.0 },
  baha: { ar: "منطقة الباحة", en: "Al Bahah Region", lat: 20.0, lng: 41.5 },
  jouf: { ar: "منطقة الجوف", en: "Al Jouf Region", lat: 29.8, lng: 40.1 },
};

type CityDef = {
  key: string;
  region: RegionKey;
  ar: string;
  en: string;
  lat: number;
  lng: number;
  aliases?: string[];
};

const CITIES: CityDef[] = [
  {
    key: "riyadh",
    region: "riyadh",
    ar: "الرياض",
    en: "Riyadh",
    lat: 24.7136,
    lng: 46.6753,
    aliases: ["riyad", "ar-riyadh"],
  },
  {
    key: "jeddah",
    region: "makkah",
    ar: "جدة",
    en: "Jeddah",
    lat: 21.4858,
    lng: 39.1925,
    aliases: ["jiddah", "jedda"],
  },
  {
    key: "makkah",
    region: "makkah",
    ar: "مكة المكرمة",
    en: "Makkah",
    lat: 21.3891,
    lng: 39.8579,
    aliases: ["mecca", "makka", "makkah al mukarramah"],
  },
  {
    key: "taif",
    region: "makkah",
    ar: "الطائف",
    en: "Taif",
    lat: 21.4373,
    lng: 40.5127,
    aliases: ["at taif", "al taif"],
  },
  {
    key: "madinah",
    region: "madinah",
    ar: "المدينة المنورة",
    en: "Madinah",
    lat: 24.5247,
    lng: 39.5692,
    aliases: ["medina", "al madinah", "medinah"],
  },
  { key: "yanbu", region: "madinah", ar: "ينبع", en: "Yanbu", lat: 24.0895, lng: 38.0618 },
  { key: "dammam", region: "eastern", ar: "الدمام", en: "Dammam", lat: 26.4207, lng: 50.0888 },
  {
    key: "khobar",
    region: "eastern",
    ar: "الخبر",
    en: "Khobar",
    lat: 26.2172,
    lng: 50.1971,
    aliases: ["al khobar"],
  },
  {
    key: "ahsa",
    region: "eastern",
    ar: "الأحساء",
    en: "Al Ahsa",
    lat: 25.3833,
    lng: 49.5833,
    aliases: ["hofuf", "al hasa", "al-ahsa"],
  },
  { key: "abha", region: "asir", ar: "أبها", en: "Abha", lat: 18.2164, lng: 42.5053 },
  {
    key: "jazan",
    region: "jazan",
    ar: "جازان",
    en: "Jazan",
    lat: 16.8892,
    lng: 42.5511,
    aliases: ["jizan"],
  },
  { key: "najran", region: "najran", ar: "نجران", en: "Najran", lat: 17.4924, lng: 44.1277 },
  { key: "tabuk", region: "tabuk", ar: "تبوك", en: "Tabuk", lat: 28.3838, lng: 36.555 },
  {
    key: "qassim",
    region: "qassim",
    ar: "القصيم",
    en: "Qassim",
    lat: 26.326,
    lng: 43.975,
    aliases: ["buraydah", "buraidah", "al qassim"],
  },
  { key: "hail", region: "hail", ar: "حائل", en: "Hail", lat: 27.5219, lng: 41.6907 },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s\-_.]/g, "")
    .trim();

function matchCity(raw: string): CityDef | undefined {
  const n = norm(raw);
  return CITIES.find(
    (c) => norm(c.en) === n || norm(c.ar) === n || (c.aliases ?? []).some((a) => norm(a) === n),
  );
}

function HeatLayer({ points, visible }: { points: [number, number, number][]; visible: boolean }) {
  const map = useMap();
  const ref = useRef<L.Layer | null>(null);
  useEffect(() => {
    if (ref.current) {
      map.removeLayer(ref.current);
      ref.current = null;
    }
    if (!visible || points.length === 0) return;
    const layer = (
      L as unknown as { heatLayer: (pts: [number, number, number][], opts: object) => L.Layer }
    ).heatLayer(points, { radius: 40, blur: 30, maxZoom: 8, minOpacity: 0.35 });
    layer.addTo(map);
    ref.current = layer;
    return () => {
      if (ref.current) {
        map.removeLayer(ref.current);
        ref.current = null;
      }
    };
  }, [map, points, visible]);
  return null;
}

export function SaudiMap({ orgId, isAr }: { orgId: string | undefined; isAr: boolean }) {
  const [heat, setHeat] = useState(false);
  const [view, setView] = useState<"cities" | "regions">("cities");
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["properties-by-city", orgId],
    queryFn: () => getPropertiesByCity({ data: { org_id: orgId! } }),
    staleTime: 60_000,
  });

  const byCity = useMemo(() => {
    const rows: CityCount[] = q.data ?? [];
    const map = new Map<string, number>();
    for (const r of rows) {
      const c = matchCity(r.city);
      if (!c) continue;
      map.set(c.key, (map.get(c.key) ?? 0) + r.count);
    }
    return map;
  }, [q.data]);

  const byRegion = useMemo(() => {
    const m = new Map<RegionKey, number>();
    for (const c of CITIES) {
      const n = byCity.get(c.key) ?? 0;
      if (n === 0) continue;
      m.set(c.region, (m.get(c.region) ?? 0) + n);
    }
    return m;
  }, [byCity]);

  const total = useMemo(() => Array.from(byCity.values()).reduce((a, b) => a + b, 0), [byCity]);
  const max = useMemo(
    () =>
      view === "cities"
        ? Math.max(1, ...Array.from(byCity.values()))
        : Math.max(1, ...Array.from(byRegion.values())),
    [byCity, byRegion, view],
  );
  const heatPoints: [number, number, number][] = useMemo(
    () =>
      CITIES.filter((c) => (byCity.get(c.key) ?? 0) > 0).map((c) => [
        c.lat,
        c.lng,
        (byCity.get(c.key) ?? 0) / max,
      ]),
    [byCity, max],
  );
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const dirAttr = isAr ? "rtl" : "ltr";

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border bg-card/70 backdrop-blur-xl ring-1 ring-border/40">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">
            {isAr ? "توزيع العقارات في السعودية" : "Saudi Arabia — Property Distribution"}
          </div>
          <div className="text-xs text-muted-foreground">
            {isAr
              ? view === "cities"
                ? "علامات مضيئة لكل مدينة، حسب عدد العقارات"
                : "تجميع حسب المناطق الإدارية الـ13"
              : view === "cities"
                ? "Glowing markers per city, sized by property count"
                : "Grouped by the 13 administrative regions"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setView((v) => (v === "cities" ? "regions" : "cities"))}
            className="gap-1.5"
          >
            <Layers className="size-4" />
            {isAr
              ? view === "cities"
                ? "عرض المناطق"
                : "عرض المدن"
              : view === "cities"
                ? "Regions"
                : "Cities"}
          </Button>
          <Button
            size="sm"
            variant={heat ? "default" : "outline"}
            onClick={() => setHeat((v) => !v)}
            className="gap-1.5"
          >
            <Flame className="size-4" />
            {isAr ? (heat ? "إخفاء الحرارة" : "الوضع الحراري") : heat ? "Hide Heatmap" : "Heatmap"}
          </Button>
        </div>
      </div>
      <div className="h-[420px] w-full">
        <MapContainer
          center={[24.5, 45.5]}
          zoom={5}
          minZoom={4}
          maxZoom={12}
          zoomSnap={0.25}
          zoomDelta={0.5}
          wheelPxPerZoomLevel={90}
          zoomAnimation
          fadeAnimation
          markerZoomAnimation
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: "hsl(var(--muted))" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <HeatLayer points={heatPoints} visible={heat} />
          {view === "cities"
            ? CITIES.map((c) => {
                const count = byCity.get(c.key) ?? 0;
                const radius = 6 + Math.min(22, count === 0 ? 0 : Math.round((count / max) * 18));
                const active = count > 0;
                const regionLabel = isAr ? REGIONS[c.region].ar : REGIONS[c.region].en;
                return (
                  <CircleMarker
                    key={c.key}
                    center={[c.lat, c.lng]}
                    radius={radius}
                    pathOptions={{
                      color: active ? "#D4AF37" : "#64748B",
                      weight: 2,
                      fillColor: active ? "#D4AF37" : "#334155",
                      fillOpacity: active ? 0.55 : 0.25,
                      className: active ? "aqari-city-glow" : undefined,
                    }}
                  >
                    <Tooltip
                      direction="top"
                      offset={[0, -radius]}
                      opacity={1}
                      className="!bg-popover !text-popover-foreground !border-border"
                    >
                      <div className="text-xs" dir={dirAttr}>
                        <div className="font-semibold">{isAr ? c.ar : c.en}</div>
                        <div className="text-[10px] text-muted-foreground">{regionLabel}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-medium">
                            {count.toLocaleString(isAr ? "ar-SA" : "en-US")}
                          </span>
                          <span className="text-muted-foreground">
                            {isAr ? "عقار" : count === 1 ? "property" : "properties"}
                          </span>
                          {total > 0 && (
                            <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                              {pct(count)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })
            : (Object.keys(REGIONS) as RegionKey[]).map((rk) => {
                const r = REGIONS[rk];
                const count = byRegion.get(rk) ?? 0;
                const radius = 10 + Math.min(30, count === 0 ? 0 : Math.round((count / max) * 26));
                const active = count > 0;
                return (
                  <CircleMarker
                    key={rk}
                    center={[r.lat, r.lng]}
                    radius={radius}
                    pathOptions={{
                      color: active ? "#D4AF37" : "#64748B",
                      weight: 2,
                      fillColor: active ? "#D4AF37" : "#334155",
                      fillOpacity: active ? 0.35 : 0.2,
                      className: active ? "aqari-city-glow" : undefined,
                    }}
                  >
                    <Tooltip
                      direction="top"
                      offset={[0, -radius]}
                      opacity={1}
                      className="!bg-popover !text-popover-foreground !border-border"
                    >
                      <div className="text-xs" dir={dirAttr}>
                        <div className="font-semibold">{isAr ? r.ar : r.en}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-medium">
                            {count.toLocaleString(isAr ? "ar-SA" : "en-US")}
                          </span>
                          <span className="text-muted-foreground">
                            {isAr ? "عقار" : count === 1 ? "property" : "properties"}
                          </span>
                          {total > 0 && (
                            <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                              {pct(count)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })}
        </MapContainer>
      </div>
      <style>{`
        .aqari-city-glow { filter: drop-shadow(0 0 6px rgba(212,175,55,0.9)) drop-shadow(0 0 14px rgba(212,175,55,0.5)); animation: aqariPulse 2.4s ease-in-out infinite; }
        @keyframes aqariPulse { 0%,100% { opacity: 0.85 } 50% { opacity: 1 } }
        .leaflet-container { font-family: inherit; }
        .leaflet-tooltip { padding: 6px 8px; border-radius: 8px; }
        .leaflet-tooltip-top:before { border-top-color: hsl(var(--popover)); }
        .leaflet-control-zoom a { transition: background 150ms ease, color 150ms ease; }
      `}</style>
    </div>
  );
}
