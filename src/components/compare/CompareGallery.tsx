import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface GalleryShot {
  src: string;
  label: string;
  caption?: string;
  dir?: "rtl" | "ltr";
  /**
   * Optional `<source>` entries for modern formats (AVIF, WebP).
   * Rendered inside a `<picture>` element in order, with `src` used as the
   * `<img>` fallback. Pass empty/undefined to use `src` only.
   */
  sources?: Array<{ type: string; srcSet: string; sizes?: string }>;
}

interface CompareGalleryProps {
  shots: GalleryShot[];
  isRTL?: boolean;
  autoPlayMs?: number;
  ariaLabels?: { prev: string; next: string; goTo: string };
}

const SWIPE_THRESHOLD = 60;
const SWIPE_VELOCITY = 400;

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0, scale: 0.98 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0, scale: 0.98 }),
};

export function CompareGallery({
  shots,
  isRTL = false,
  autoPlayMs,
  ariaLabels = { prev: "Previous", next: "Next", goTo: "Go to slide" },
}: CompareGalleryProps) {
  const [[index, direction], setState] = useState<[number, number]>([0, 0]);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const count = shots.length;
  const current = shots[((index % count) + count) % count];

  const paginate = useCallback((dir: number) => setState(([i]) => [i + dir, dir]), []);

  const goTo = useCallback(
    (target: number) =>
      setState(([i]) => [target, target > ((i % count) + count) % count ? 1 : -1]),
    [count],
  );

  useEffect(() => {
    if (!autoPlayMs || paused || count < 2) return;
    const id = window.setTimeout(() => paginate(1), autoPlayMs);
    return () => window.clearTimeout(id);
  }, [autoPlayMs, paused, index, count, paginate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") paginate(isRTL ? -1 : 1);
      else if (e.key === "ArrowLeft") paginate(isRTL ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paginate, isRTL]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    if (offset < -SWIPE_THRESHOLD || velocity < -SWIPE_VELOCITY) {
      paginate(isRTL ? -1 : 1);
    } else if (offset > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY) {
      paginate(isRTL ? 1 : -1);
    }
  };

  const activeIndex = ((index % count) + count) % count;

  const defaultSizes = "(min-width: 1024px) 900px, (min-width: 640px) 80vw, 100vw";

  return (
    <div
      className="relative select-none"
      style={{ contentVisibility: "auto", containIntrinsicSize: "1px 520px" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {/* Stage */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 to-background shadow-lg sm:rounded-2xl sm:shadow-xl">
        <div className="relative aspect-[4/5] w-full sm:aspect-[16/10] lg:aspect-[16/9]">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.figure
              key={current.src}
              custom={direction}
              variants={slideVariants}
              initial={reduce ? false : "enter"}
              animate="center"
              exit={reduce ? undefined : "exit"}
              transition={{
                x: { type: "spring", stiffness: 260, damping: 30 },
                opacity: { duration: 0.25 },
                scale: { duration: 0.35 },
              }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={onDragEnd}
              className="absolute inset-0 flex cursor-grab items-center justify-center active:cursor-grabbing"
            >
              <picture>
                {current.sources?.map((s) => (
                  <source
                    key={`${s.type}-${s.srcSet}`}
                    type={s.type}
                    srcSet={s.srcSet}
                    sizes={s.sizes ?? defaultSizes}
                  />
                ))}
                <img
                  src={current.src}
                  alt={current.label}
                  dir={current.dir}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={index === 0 ? "high" : "low"}
                  width={1600}
                  height={1000}
                  sizes={defaultSizes}
                  draggable={false}
                  className="pointer-events-none max-h-full max-w-full rounded-lg object-contain p-2 sm:rounded-xl sm:p-3"
                />
              </picture>
            </motion.figure>
          </AnimatePresence>
          {/* Preload next slide for instant swipe */}
          {count > 1 && (
            <link rel="preload" as="image" href={shots[(activeIndex + 1) % count].src} />
          )}
        </div>

        {/* Prev / Next — hidden on mobile (swipe instead) */}
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label={ariaLabels.prev}
              onClick={() => paginate(isRTL ? 1 : -1)}
              className="absolute start-3 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/85 p-2 shadow-md backdrop-blur transition hover:bg-background sm:inline-flex"
            >
              <ChevronLeft className="h-5 w-5 rtl:hidden" />
              <ChevronRight className="hidden h-5 w-5 rtl:block" />
            </button>
            <button
              type="button"
              aria-label={ariaLabels.next}
              onClick={() => paginate(isRTL ? -1 : 1)}
              className="absolute end-3 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/85 p-2 shadow-md backdrop-blur transition hover:bg-background sm:inline-flex"
            >
              <ChevronRight className="h-5 w-5 rtl:hidden" />
              <ChevronLeft className="hidden h-5 w-5 rtl:block" />
            </button>
          </>
        )}
      </div>

      {/* Caption + dots */}
      <div className="mt-3 flex flex-col items-center gap-2 sm:mt-4 sm:gap-3">
        <motion.p
          key={current.label}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="text-center text-xs text-muted-foreground sm:text-sm"
        >
          <span className="font-medium text-foreground">{current.label}</span>
          {current.caption ? <span className="mx-2">·</span> : null}
          {current.caption}
        </motion.p>

        {count > 1 && (
          <div role="tablist" aria-label="Gallery" className="flex items-center gap-2">
            {shots.map((s, i) => {
              const active = i === activeIndex;
              return (
                <button
                  key={s.src}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  aria-label={`${ariaLabels.goTo} ${i + 1}`}
                  onClick={() => goTo(i)}
                  className="group relative h-2 overflow-hidden rounded-full bg-muted transition-all"
                  style={{ width: active ? 28 : 8 }}
                >
                  <motion.span
                    layoutId="gallery-dot-active"
                    className={
                      active
                        ? "absolute inset-0 rounded-full bg-primary"
                        : "absolute inset-0 rounded-full bg-transparent"
                    }
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
