import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "property-photos";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function PropertyImageUploader({
  propertyId,
  value,
  onChange,
}: {
  propertyId: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Max 8MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Image files only");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${propertyId}/cover-${Date.now()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (up.error) throw up.error;
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, ONE_YEAR);
      if (signed.error) throw signed.error;
      onChange(signed.data.signedUrl);
      toast.success("✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative overflow-hidden rounded-lg border">
          <img src={value} alt="" className="aspect-[16/9] w-full object-cover" />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute end-2 top-2 size-7"
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="grid aspect-[16/9] w-full place-items-center rounded-lg border border-dashed bg-muted/40 text-xs text-muted-foreground">
          {t("properties.form.coverImage")}
        </div>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="me-2 size-4 animate-spin" />
          ) : (
            <Upload className="me-2 size-4" />
          )}
          {t("properties.form.uploadImage")}
        </Button>
      </div>
    </div>
  );
}
