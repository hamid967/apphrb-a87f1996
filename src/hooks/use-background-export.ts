import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { startExportJob, runExportJob, getExportJob } from "@/lib/export-jobs.functions";

type Format = "csv" | "json" | "pdf";
type StartArgs = {
  orgId: string;
  format: Format;
  templateId?: string | null;
  params?: Record<string, any>;
};

async function ensureNotifyPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}

function fireNotification(title: string, body: string) {
  try {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(title, { body });
    }
  } catch {}
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function useBackgroundExport() {
  const [jobId, setJobId] = useState<string | null>(null);
  const notifiedRef = useRef<string | null>(null);

  const jobQ = useQuery({
    queryKey: ["export-job", jobId],
    queryFn: () => getExportJob({ data: { jobId: jobId! } }),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const s: any = q.state.data;
      if (!s) return 1500;
      if (s.status === "completed" || s.status === "failed") return false;
      return 1500;
    },
  });

  const start = useCallback(async (args: StartArgs) => {
    await ensureNotifyPermission();
    const { jobId: id } = await startExportJob({
      data: {
        orgId: args.orgId,
        format: args.format,
        templateId: args.templateId ?? null,
        params: args.params ?? {},
      },
    });
    setJobId(id);
    // Fire-and-forget processing in a separate worker invocation
    runExportJob({ data: { jobId: id } }).catch(() => {
      /* status row carries error */
    });
    toast.success("Export queued — you'll be notified when it's ready");
    return id;
  }, []);

  useEffect(() => {
    const s: any = jobQ.data;
    if (!s || notifiedRef.current === s.id) return;
    if (s.status === "completed") {
      notifiedRef.current = s.id;
      const rd = s.result_data ?? {};
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      if (s.format === "csv" && rd.csv) {
        downloadBlob(new Blob([rd.csv], { type: "text/csv;charset=utf-8" }), `export-${stamp}.csv`);
      } else if (s.format === "json") {
        downloadBlob(
          new Blob([JSON.stringify(rd, null, 2)], { type: "application/json" }),
          `export-${stamp}.json`,
        );
      }
      toast.success(`Export ready (${s.row_count ?? 0} rows)`);
      fireNotification(
        "Export ready",
        `${s.format.toUpperCase()} export finished — ${s.row_count ?? 0} rows`,
      );
    } else if (s.status === "failed") {
      notifiedRef.current = s.id;
      toast.error(`Export failed: ${s.error ?? "unknown error"}`);
      fireNotification("Export failed", s.error ?? "Unknown error");
    }
  }, [jobQ.data]);

  const reset = useCallback(() => {
    setJobId(null);
    notifiedRef.current = null;
  }, []);

  return {
    jobId,
    job: jobQ.data as any,
    start,
    reset,
    isRunning: !!jobId && jobQ.data && !["completed", "failed"].includes((jobQ.data as any).status),
  };
}
