import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import videoAsset from "@/assets/compare-intro.mp4.asset.json";
import posterAsset from "@/assets/compare-intro-poster.jpg.asset.json";

interface Props {
  title: string;
  subtitle: string;
  playLabel: string;
  duration: string;
  dialogTitle: string;
}

export function CompareIntroVideo({ title, subtitle, playLabel, duration, dialogTitle }: Props) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:rounded-3xl sm:shadow-2xl"
        aria-label={playLabel}
        style={{ contentVisibility: "auto", containIntrinsicSize: "1px 480px" }}
      >
        <div className="relative aspect-[4/3] w-full sm:aspect-video">
          <img
            src={posterAsset.url}
            alt=""
            loading="lazy"
            decoding="async"
            width={1600}
            height={900}
            sizes="(min-width: 1024px) 960px, 100vw"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <motion.div
            initial={reduce ? false : { scale: 0.9, opacity: 0 }}
            whileInView={reduce ? undefined : { scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", damping: 14 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_40px_rgba(212,175,55,0.55)] transition group-hover:scale-110 sm:h-24 sm:w-24 sm:shadow-[0_0_60px_rgba(212,175,55,0.55)]">
              {!reduce && (
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
              )}
              <Play className="relative ms-1 h-6 w-6 fill-current sm:h-9 sm:w-9" />
            </span>
          </motion.div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 text-start sm:p-8">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-primary sm:text-xs">
              {duration}
            </span>
            <h3 className="text-lg font-bold leading-tight text-white sm:text-3xl">{title}</h3>
            <p className="line-clamp-2 max-w-2xl text-xs text-white/80 sm:line-clamp-none sm:text-base">
              {subtitle}
            </p>
          </div>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl border-border/60 bg-background p-0 sm:rounded-2xl">
          <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
          <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
            {open && (
              <video
                src={videoAsset.url}
                poster={posterAsset.url}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="h-full w-full"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
