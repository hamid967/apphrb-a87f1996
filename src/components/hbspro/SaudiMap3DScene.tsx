import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import * as THREE from "three";
import { CITIES, HBS } from "./tokens";
import type { SaudiMap3DProps } from "./saudi-map.types";
import { supabase } from "@/integrations/supabase/client";
import { CityListingsModal } from "./CityListingsModal";
import { useTranslation } from "react-i18next";

// Realistic Saudi Arabia outline — Natural Earth boundary (lng/lat) projected
// linearly into the same SVG-space frame used by CITIES so markers land in the
// right cities.
const OUTLINE: [number, number][] = [
  [81.3, 178.9],
  [128.3, 184.0],
  [146.5, 174.2],
  [156.7, 162.7],
  [188.9, 158.3],
  [195.8, 147.6],
  [209.8, 142.1],
  [167.7, 110.2],
  [252.2, 94.2],
  [260.2, 89.4],
  [311.1, 98.1],
  [374.0, 120.4],
  [492.9, 184.6],
  [571.4, 187.2],
  [609.0, 190.2],
  [619.5, 205.5],
  [649.4, 204.6],
  [665.9, 232.2],
  [686.7, 239.5],
  [693.9, 250.7],
  [722.6, 264.1],
  [725.2, 277.3],
  [721.0, 287.9],
  [726.3, 298.6],
  [738.4, 307.6],
  [744.1, 318.0],
  [750.4, 325.9],
  [763.1, 332.2],
  [774.9, 330.0],
  [782.9, 342.2],
  [784.5, 349.5],
  [800.6, 381.9],
  [927.5, 398.0],
  [936.0, 391.2],
  [955.3, 413.8],
  [927.2, 477.7],
  [800.6, 509.6],
  [678.9, 521.9],
  [639.5, 536.2],
  [609.3, 569.8],
  [589.6, 575.1],
  [579.1, 564.5],
  [562.9, 566.1],
  [522.1, 562.9],
  [514.4, 559.7],
  [465.7, 560.4],
  [454.2, 563.3],
  [436.9, 555.0],
  [425.7, 570.7],
  [430.0, 584.1],
  [411.5, 594.3],
  [406.0, 580.7],
  [393.3, 571.1],
  [390.0, 558.3],
  [368.2, 546.9],
  [345.7, 520.1],
  [333.8, 494.1],
  [304.7, 472.1],
  [285.8, 466.9],
  [257.9, 436.4],
  [253.0, 414.3],
  [254.8, 395.3],
  [230.6, 359.9],
  [210.8, 347.5],
  [188.0, 340.9],
  [174.1, 322.6],
  [176.4, 315.3],
  [164.7, 298.8],
  [152.4, 291.7],
  [135.9, 267.9],
  [110.2, 242.2],
  [88.7, 220.2],
  [67.7, 220.4],
  [74.3, 202.9],
  [76.1, 191.7],
];

// Normalize SVG coords (0..900 x 0..720) into a centered world plane (~[-5,5]).
const SCALE = 0.014;
const CX = 500;
const CY = 400;
const toWorld = (x: number, y: number): [number, number] => [
  (x - CX) * SCALE,
  -(y - CY) * SCALE, // invert Y so north is up
];

function KsaLandmass({ lite = false }: { lite?: boolean }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    OUTLINE.forEach(([x, y], i) => {
      const [wx, wy] = toWorld(x, y);
      if (i === 0) s.moveTo(wx, wy);
      else s.lineTo(wx, wy);
    });
    s.closePath();
    return s;
  }, []);

  const geometry = useMemo(
    () =>
      new THREE.ExtrudeGeometry(shape, {
        depth: lite ? 0.25 : 0.35,
        bevelEnabled: !lite,
        bevelSegments: lite ? 1 : 3,
        bevelSize: 0.05,
        bevelThickness: 0.06,
        curveSegments: lite ? 4 : 12,
      }),
    [shape, lite],
  );

  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 20), [geometry]);

  return (
    <group rotation={[-Math.PI / 2.4, 0, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={"#0d2438"}
          metalness={0.55}
          roughness={0.35}
          emissive={"#071b2e"}
          emissiveIntensity={0.4}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={HBS.gold} transparent opacity={0.85} />
      </lineSegments>
    </group>
  );
}

function CityMarker({
  city,
  active,
  onSelect,
  onOpen,
  animate,
  count,
  lite = false,
}: {
  city: (typeof CITIES)[number];
  active: boolean;
  onSelect: (name: string) => void;
  onOpen: (name: string) => void;
  animate: boolean;
  count?: number;
  lite?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [wx, wy] = toWorld(city.x, city.y);
  const { t: tr } = useTranslation();
  // After parent rotation (-PI/2.4 on X), y becomes depth; we place markers slightly
  // above surface by lifting Z (before rotation) -> world Y after rotation.
  const z = city.hub ? 0.55 : 0.42;

  useFrame((state) => {
    if (!animate || !ref.current) return;
    const t = state.clock.elapsedTime;
    const scale = 1 + Math.sin(t * 2 + city.x) * 0.15 + (active ? 0.4 : 0);
    ref.current.scale.setScalar(scale);
  });

  return (
    <group
      position={[wx, z, -wy]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onSelect(city.name);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(city.name);
        onOpen(city.name);
      }}
    >
      <mesh ref={ref}>
        <sphereGeometry args={[city.hub ? 0.11 : 0.075, lite ? 10 : 20, lite ? 10 : 20]} />
        <meshStandardMaterial
          color={HBS.gold}
          emissive={HBS.gold}
          emissiveIntensity={active ? 2.2 : 1.1}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <ringGeometry args={[city.hub ? 0.16 : 0.11, city.hub ? 0.19 : 0.13, lite ? 16 : 32]} />
        <meshBasicMaterial
          color={HBS.gold}
          transparent
          opacity={active ? 0.9 : 0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      {active && (
        <Html center distanceFactor={8} position={[0, 0.35, 0]} style={{ pointerEvents: "none" }}>
          <div
            className="whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-md"
            style={{
              borderColor: HBS.border,
              background: "rgba(7,19,32,0.85)",
              color: HBS.white,
            }}
          >
            {city.name} · <span style={{ color: HBS.gold }}>{city.ar}</span>
            {typeof count === "number" && (
              <span
                className="ms-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px]"
                style={{ color: HBS.gold }}
              >
                {tr("hbspro.map.propertiesShort", { count })}
              </span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function NetworkArc({
  from,
  to,
  delay,
}: {
  from: (typeof CITIES)[number];
  to: (typeof CITIES)[number];
  delay: number;
}) {
  const points = useMemo(() => {
    const [ax, ay] = toWorld(from.x, from.y);
    const [bx, by] = toWorld(to.x, to.y);
    const start = new THREE.Vector3(ax, 0.5, -ay);
    const end = new THREE.Vector3(bx, 0.5, -by);
    const mid = start.clone().lerp(end, 0.5);
    const dist = start.distanceTo(end);
    mid.y += Math.min(1.6, dist * 0.6);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return curve.getPoints(40);
  }, [from, to]);

  const packetRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!packetRef.current) return;
    const t = ((state.clock.elapsedTime + delay) % 4) / 4;
    const i = Math.floor(t * (points.length - 1));
    const p = points[i];
    packetRef.current.position.copy(p);
    (packetRef.current.material as THREE.MeshBasicMaterial).opacity = t < 0.1 || t > 0.9 ? 0 : 1;
  });

  return (
    <group>
      <Line points={points} color={HBS.blue} lineWidth={1} transparent opacity={0.25} />
      <mesh ref={packetRef}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial color={HBS.gold} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

function Scene({
  active,
  setActive,
  onOpen,
  animate,
  counts,
  lite,
}: {
  active: string | null;
  setActive: (n: string) => void;
  onOpen: (n: string) => void;
  animate: boolean;
  counts: Record<string, number>;
  lite: boolean;
}) {
  const riyadh = CITIES[0];
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 6]} intensity={1.2} color={"#ffe6a8"} />
      {!lite && <directionalLight position={[-8, 4, -4]} intensity={0.6} color={HBS.blue} />}
      <KsaLandmass lite={lite} />
      {animate &&
        !lite &&
        CITIES.filter((c) => c.name !== riyadh.name && c.hub).map((c, i) => (
          <NetworkArc key={`arc-${c.name}`} from={riyadh} to={c} delay={i * 0.8} />
        ))}
      {(lite ? CITIES.filter((c) => c.hub) : CITIES).map((c) => (
        <CityMarker
          key={c.name}
          city={c}
          active={active === c.name}
          onSelect={setActive}
          onOpen={onOpen}
          animate={animate}
          count={counts[c.name.toLowerCase()] ?? counts[c.ar] ?? 0}
          lite={lite}
        />
      ))}
    </>
  );
}

export function SaudiMap3DScene({ compact = false }: SaudiMap3DProps) {
  const { t: tr } = useTranslation();
  const [active, setActive] = useState<string | null>("Riyadh");
  const [openCity, setOpenCity] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const animate = !reduce;
  const height = compact ? 380 : 560;
  // Detect mobile once for lower-detail rendering.
  const [lite, setLite] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const apply = () => setLite(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  // Lazy-mount Canvas only when scrolled into view.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || mounted) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  // Fetch active/published listings and group counts by city (case-insensitive,
  // matches either English or Arabic city name).
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("listings")
        .select("city")
        .eq("published", true)
        .limit(2000);
      if (cancelled || !data) return;
      const map: Record<string, number> = {};
      for (const row of data as { city: string | null }[]) {
        if (!row.city) continue;
        const key = row.city.trim().toLowerCase();
        map[key] = (map[key] ?? 0) + 1;
      }
      setCounts(map);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCity = CITIES.find((c) => c.name === active);
  const openCityObj = CITIES.find((c) => c.name === openCity);
  const activeCount = activeCity
    ? (counts[activeCity.name.toLowerCase()] ?? counts[activeCity.ar] ?? 0)
    : 0;

  // Fetch top districts for the active city (parsed from properties.address).
  const [districtsByCity, setDistrictsByCity] = useState<
    Record<string, { name: string; count: number }[]>
  >({});
  useEffect(() => {
    if (!activeCity) return;
    const key = activeCity.name.toLowerCase();
    if (districtsByCity[key]) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("properties")
        .select("address, city")
        .or(`city.ilike.${activeCity.name},city.ilike.${activeCity.ar}`)
        .eq("is_public", true)
        .limit(500);
      if (cancelled) return;
      const bucket = new Map<string, number>();
      for (const row of (data ?? []) as { address: string | null }[]) {
        if (!row.address) continue;
        const first = row.address.split(/[،,\-–|]/)[0]?.trim();
        if (!first || first.length < 2 || first.length > 40) continue;
        bucket.set(first, (bucket.get(first) ?? 0) + 1);
      }
      const top = Array.from(bucket.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
      setDistrictsByCity((prev) => ({ ...prev, [key]: top }));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCity, districtsByCity]);
  const activeDistricts = activeCity ? (districtsByCity[activeCity.name.toLowerCase()] ?? []) : [];

  return (
    <motion.div
      ref={wrapperRef}
      className="relative w-full overflow-hidden rounded-2xl"
      style={{
        height,
        background:
          "radial-gradient(1200px 600px at 50% 20%, rgba(30,136,229,0.18), transparent 60%), #050e18",
        border: `1px solid ${HBS.border}`,
        touchAction: "none",
      }}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {mounted && (
        <Canvas
          camera={{ position: [0, 4.2, 5.5], fov: 45 }}
          dpr={lite ? [1, 1.5] : [1, 2]}
          gl={{
            antialias: !lite,
            alpha: true,
            powerPreference: lite ? "low-power" : "high-performance",
          }}
          frameloop={animate ? "always" : "demand"}
        >
          <Suspense fallback={null}>
            <Scene
              active={active}
              setActive={setActive}
              onOpen={setOpenCity}
              animate={animate && !lite}
              counts={counts}
              lite={lite}
            />
          </Suspense>
          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={4}
            maxDistance={9}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.1}
            autoRotate={animate && !lite}
            autoRotateSpeed={0.35}
            enableDamping
            dampingFactor={0.08}
          />
        </Canvas>
      )}

      {/* Overlay: title + hint */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div
          className="rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em] backdrop-blur-md"
          style={{ borderColor: HBS.border, background: "rgba(7,19,32,0.6)", color: HBS.gold }}
        >
          KSA · Live Network
        </div>
        <div
          className="hidden rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] backdrop-blur-md sm:block"
          style={{ borderColor: HBS.border, background: "rgba(7,19,32,0.6)", color: HBS.gray }}
        >
          {tr("hbspro.map.dragHint")}
        </div>
      </div>

      {/* Active city card */}
      <AnimatePresence mode="wait">
        {activeCity && (
          <motion.div
            key={activeCity.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute bottom-4 left-4 right-4 rounded-2xl border px-4 py-3 backdrop-blur-md sm:right-auto sm:min-w-[240px]"
            style={{ borderColor: HBS.border, background: "rgba(7,19,32,0.78)" }}
          >
            <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: HBS.gold }}>
              {tr("hbspro.map.aiNode")} ·{" "}
              {activeCity.hub ? tr("hbspro.map.regionalHub") : tr("hbspro.map.edgeNode")}
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {activeCity.name}{" "}
              <span className="text-sm" style={{ color: HBS.gray }}>
                / {activeCity.ar}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: HBS.gray }}>
              <span
                className="rounded-full px-2 py-0.5 font-semibold"
                style={{ background: "rgba(212,168,83,0.15)", color: HBS.gold }}
              >
                {tr("hbspro.map.activeProperties", { count: activeCount })}
              </span>
              <span>{tr("hbspro.map.liveSync")}</span>
            </div>
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: HBS.gray }}>
                {tr("hbspro.map.districts")}
              </div>
              {activeDistricts.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {activeDistricts.map((d) => (
                    <span
                      key={d.name}
                      className="rounded-full border px-2 py-0.5 text-[10px]"
                      style={{
                        borderColor: HBS.border,
                        color: HBS.white,
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      {d.name} <span style={{ color: HBS.gold }}>· {d.count}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-[11px]" style={{ color: HBS.gray }}>
                  {tr("hbspro.map.noDistricts")}
                </div>
              )}
            </div>
            <button
              onClick={() => setOpenCity(activeCity.name)}
              className="mt-3 w-full rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
              style={{
                borderColor: HBS.gold,
                color: HBS.gold,
                background: "rgba(212,168,83,0.08)",
              }}
            >
              {tr("hbspro.map.viewActive")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* City quick-pick pills (mobile-friendly) */}
      <div className="absolute bottom-4 right-4 hidden max-w-[260px] flex-wrap justify-end gap-1.5 sm:flex">
        {CITIES.filter((c) => c.hub).map((c) => (
          <button
            key={c.name}
            onClick={() => {
              setActive(c.name);
              setOpenCity(c.name);
            }}
            className="rounded-full border px-2.5 py-1 text-[11px] transition"
            style={{
              borderColor: active === c.name ? HBS.gold : HBS.border,
              color: active === c.name ? HBS.gold : HBS.gray,
              background: "rgba(7,19,32,0.6)",
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <CityListingsModal
        open={!!openCity}
        onOpenChange={(v) => !v && setOpenCity(null)}
        cityName={openCityObj?.name ?? null}
        cityAr={openCityObj?.ar ?? null}
      />
    </motion.div>
  );
}

export default SaudiMap3DScene;
