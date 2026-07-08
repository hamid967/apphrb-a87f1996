import { useEffect, useState } from "react";
import { useQueryClient, onlineManager } from "@tanstack/react-query";
import { toast } from "sonner";
import { WifiOff, Wifi } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

/**
 * OfflineIndicator shows a banner when the browser reports offline.
 * On reconnect it notifies TanStack Query (which refetches all active
 * queries — our "sync on reconnect") and shows a success toast.
 */
export function OfflineIndicator() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      onlineManager.setOnline(true);
      toast.success("Back online — syncing…", { icon: <Wifi className="h-4 w-4" /> });
      // Trigger refetch of any active queries; invalidate to update stale caches.
      qc.invalidateQueries();
      qc.resumePausedMutations().catch(() => {});
    };
    const handleOffline = () => {
      setOnline(false);
      onlineManager.setOnline(false);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [qc]);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[100] flex justify-center pointer-events-none"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="pointer-events-auto m-2 flex items-center gap-2 rounded-full bg-amber-500/95 px-4 py-2 text-xs font-medium text-black shadow-lg">
            <WifiOff className="h-3.5 w-3.5" />
            You're offline — showing cached data
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
