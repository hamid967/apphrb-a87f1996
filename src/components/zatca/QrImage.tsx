import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrImageProps {
  value: string;
  size?: number;
  alt?: string;
}

/**
 * Local QR renderer for ZATCA TLV — avoids external services (previous
 * implementation used qrserver.com which leaks invoice data).
 */
export function QrImage({ value, size = 220, alt = "QR" }: QrImageProps) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch((e: Error) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [value, size]);

  if (err) {
    return (
      <div className="text-xs text-destructive p-2 border border-destructive/40 rounded">
        {err}
      </div>
    );
  }
  if (!dataUrl) {
    return (
      <div
        className="animate-pulse bg-muted/50 rounded"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      className="rounded border bg-white p-2"
    />
  );
}
