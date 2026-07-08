import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { BedDouble, Bath, Maximize2, MapPin, Loader2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

const MotionLink = motion(Link);

type Listing = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  city: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  hero_image: string | null;
  created_at: string;
  published: boolean;
};

type SortKey = "newest" | "price_asc" | "price_desc" | "area_desc";
type PropType = "any" | "apartment" | "villa" | "studio" | "office" | "land";
type Availability = "available" | "all";

const TYPE_KEYWORDS: Record<Exclude<PropType, "any">, string[]> = {
  apartment: ["شقة", "شقق", "apartment", "flat"],
  villa: ["فيلا", "فلل", "villa", "قصر"],
  studio: ["استوديو", "ستوديو", "studio"],
  office: ["مكتب", "مكاتب", "office"],
  land: ["أرض", "ارض", "اراضي", "أراضي", "land", "plot"],
};

function matchesType(l: Pick<Listing, "title" | "description">, t: PropType) {
  if (t === "any") return true;
  const hay = `${l.title ?? ""} ${l.description ?? ""}`.toLowerCase();
  return TYPE_KEYWORDS[t].some((k) => hay.includes(k.toLowerCase()));
}

const STORAGE_KEY = "city-listings-modal:prefs:v1";

type Prefs = {
  sort: SortKey;
  minBeds: string;
  maxPrice: string;
  propType: PropType;
  availability: Availability;
};

function loadPrefs(): Prefs {
  const def: Prefs = {
    sort: "newest",
    minBeds: "any",
    maxPrice: "",
    propType: "any",
    availability: "available",
  };
  if (typeof window === "undefined") return def;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      sort: (p.sort as SortKey) ?? "newest",
      minBeds: p.minBeds ?? "any",
      maxPrice: p.maxPrice ?? "",
      propType: (p.propType as PropType) ?? "any",
      availability: (p.availability as Availability) ?? "available",
    };
  } catch {
    return def;
  }
}

export function CityListingsModal({
  cityName,
  cityAr,
  open,
  onOpenChange,
}: {
  cityName: string | null;
  cityAr: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const initial = loadPrefs();
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [minBeds, setMinBeds] = useState<string>(initial.minBeds);
  const [maxPrice, setMaxPrice] = useState<string>(initial.maxPrice);
  const [propType, setPropType] = useState<PropType>(initial.propType);
  const [availability, setAvailability] = useState<Availability>(initial.availability);
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sort, minBeds, maxPrice, propType, availability }),
      );
    } catch {
      // ignore quota / disabled storage
    }
  }, [sort, minBeds, maxPrice, propType, availability]);

  useEffect(() => {
    if (!open || !cityName) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = supabase
        .from("listings")
        .select(
          "id,slug,title,description,price,currency,city,bedrooms,bathrooms,area,hero_image,created_at,published",
        )
        .or(
          [`city.ilike.${cityName}`, cityAr ? `city.ilike.${cityAr}` : null]
            .filter(Boolean)
            .join(","),
        )
        .limit(200);
      if (availability === "available") q = q.eq("published", true);
      const { data } = await q;
      if (cancelled) return;
      setRows((data as Listing[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cityName, cityAr, availability]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let out = [...rows];
    if (propType !== "any") out = out.filter((r) => matchesType(r, propType));
    if (minBeds !== "any") {
      const n = Number(minBeds);
      out = out.filter((r) => (r.bedrooms ?? 0) >= n);
    }
    const mp = Number(maxPrice);
    if (maxPrice && !Number.isNaN(mp) && mp > 0) {
      out = out.filter((r) => r.price <= mp);
    }
    switch (sort) {
      case "price_asc":
        out.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        out.sort((a, b) => b.price - a.price);
        break;
      case "area_desc":
        out.sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
        break;
      default:
        out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }
    return out;
  }, [rows, sort, minBeds, maxPrice, propType]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    // Hysteresis thresholds prevent flicker around a single boundary.
    const SHOW_AT = 180;
    const HIDE_AT = 120;
    let rafId = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTop = el.scrollTop;

    const evaluate = () => {
      rafId = 0;
      const top = el.scrollTop;
      lastTop = top;
      setShowJoin((prev) => {
        if (!prev && top > SHOW_AT) return true;
        if (prev && top < HIDE_AT) return false;
        return prev;
      });
    };

    const onScroll = () => {
      // rAF-throttle: at most one update per frame while scrolling.
      if (rafId) return;
      rafId = requestAnimationFrame(evaluate);
      // Debounce a final check after the user stops scrolling.
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (Math.abs(el.scrollTop - lastTop) > 2) evaluate();
      }, 120);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    evaluate();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [open, filtered.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="relative max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {t("hbspro.cityModal.title", { city: cityAr || cityName || "" })}
            <span className="text-sm text-muted-foreground">({filtered.length})</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select value={propType} onValueChange={(v) => setPropType(v as PropType)}>
            <SelectTrigger>
              <SelectValue placeholder={t("hbspro.cityModal.typePh")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("hbspro.cityModal.allTypes")}</SelectItem>
              <SelectItem value="apartment">{t("hbspro.cityModal.apartment")}</SelectItem>
              <SelectItem value="villa">{t("hbspro.cityModal.villa")}</SelectItem>
              <SelectItem value="studio">{t("hbspro.cityModal.studio")}</SelectItem>
              <SelectItem value="office">{t("hbspro.cityModal.office")}</SelectItem>
              <SelectItem value="land">{t("hbspro.cityModal.land")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={availability} onValueChange={(v) => setAvailability(v as Availability)}>
            <SelectTrigger>
              <SelectValue placeholder={t("hbspro.cityModal.statusPh")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">{t("hbspro.cityModal.availableOnly")}</SelectItem>
              <SelectItem value="all">{t("hbspro.cityModal.allStatuses")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger>
              <SelectValue placeholder={t("hbspro.cityModal.sortPh")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("hbspro.cityModal.newest")}</SelectItem>
              <SelectItem value="price_asc">{t("hbspro.cityModal.priceAsc")}</SelectItem>
              <SelectItem value="price_desc">{t("hbspro.cityModal.priceDesc")}</SelectItem>
              <SelectItem value="area_desc">{t("hbspro.cityModal.areaDesc")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={minBeds} onValueChange={setMinBeds}>
            <SelectTrigger>
              <SelectValue placeholder={t("hbspro.cityModal.bedsPh")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("hbspro.cityModal.anyBeds")}</SelectItem>
              <SelectItem value="1">1+</SelectItem>
              <SelectItem value="2">2+</SelectItem>
              <SelectItem value="3">3+</SelectItem>
              <SelectItem value="4">4+</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="numeric"
            placeholder={t("hbspro.cityModal.maxPricePh")}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>

        <div ref={scrollRef} className="relative mt-3 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {t("hbspro.cityModal.empty")}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 pb-20 sm:grid-cols-2 sm:pb-16">
              {filtered.map((l) => (
                <li key={l.id}>
                  <a
                    href={`/listings/${l.slug}`}
                    className="group flex gap-3 rounded-xl border border-border/60 bg-card p-2 transition hover:border-primary/60"
                  >
                    <div className="h-24 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {l.hero_image ? (
                        <img
                          src={l.hero_image}
                          alt={l.title}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{l.title}</div>
                      <div className="mt-0.5 text-sm text-primary">
                        {l.price.toLocaleString()} {l.currency}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {l.bedrooms != null && (
                          <span className="inline-flex items-center gap-1">
                            <BedDouble className="h-3 w-3" />
                            {l.bedrooms}
                          </span>
                        )}
                        {l.bathrooms != null && (
                          <span className="inline-flex items-center gap-1">
                            <Bath className="h-3 w-3" />
                            {l.bathrooms}
                          </span>
                        )}
                        {l.area != null && (
                          <span className="inline-flex items-center gap-1">
                            <Maximize2 className="h-3 w-3" />
                            {l.area} م²
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <AnimatePresence>
          {showJoin && (
            <MotionLink
              key="join-cta"
              to="/auth"
              aria-label={t("hbspro.cityModal.joinCta")}
              style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
              className="pointer-events-auto absolute end-4 z-50 inline-flex items-center gap-2 rounded-full bg-primary p-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 ring-2 ring-background sm:px-4"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.85 }}
              animate={
                reduce
                  ? { opacity: 1, transition: { duration: 0.15 } }
                  : {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: { type: "spring", stiffness: 360, damping: 22 },
                    }
              }
              exit={
                reduce
                  ? { opacity: 0, transition: { duration: 0.12 } }
                  : {
                      opacity: 0,
                      y: 12,
                      scale: 0.9,
                      transition: { duration: 0.18, ease: "easeIn" },
                    }
              }
              whileHover={
                reduce
                  ? undefined
                  : { scale: 1.06, boxShadow: "0 12px 28px -8px hsl(var(--primary) / 0.55)" }
              }
              whileTap={reduce ? undefined : { scale: 0.94 }}
            >
              <motion.span
                initial={reduce ? false : { rotate: -12 }}
                animate={reduce ? undefined : { rotate: 0 }}
                whileHover={
                  reduce ? undefined : { rotate: [0, -10, 10, 0], transition: { duration: 0.5 } }
                }
                className="inline-flex"
              >
                <UserPlus className="h-4 w-4" />
              </motion.span>
              <span className="hidden sm:inline">{t("hbspro.cityModal.joinCta")}</span>
            </MotionLink>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

export default CityListingsModal;
