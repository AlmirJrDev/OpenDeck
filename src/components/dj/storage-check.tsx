import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { estimatePlan, mp3EquivalentBytes, PRICES_CHECKED_ON, STORAGE_PLANS, toGb, uploadSeconds } from "@/storage/plans";
import { canPickDirectory, scanFileList, scanPickedFolder, type FolderScan } from "@/storage/scan";

import { Pad } from "./pad";
import { CAPTION } from "./theme";

const formatGb = (bytes: number) => {
  const gb = toGb(bytes);
  return gb >= 10 ? `${gb.toFixed(1)} GB` : gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
};

const formatUsd = (usd: number) => (usd === 0 ? "$0" : usd < 0.01 ? "< $0.01" : `$${usd.toFixed(2)}`);

const formatDuration = (seconds: number) => {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;
};

const Readout = ({ caption, value }: { caption: string; value: string }) => (
  <div className="flex flex-col gap-1">
    <span className={CAPTION}>{caption}</span>
    <span className="font-mono text-2xl leading-none font-medium tabular-nums">{value}</span>
  </div>
);

/** Measures a music folder and shows whether it fits each storage provider's free tier. */
export const StorageCheck = () => {
  const [scan, setScan] = useState<FolderScan | null>(null);
  const [scanning, setScanning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [computers, setComputers] = useState(2);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = async () => {
    setError(null);
    if (!canPickDirectory()) {
      inputRef.current?.click();
      return;
    }
    setScanning(0);
    try {
      const result = await scanPickedFolder((files) => setScanning(files));
      if (result) setScan(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(null);
    }
  };

  const gb = scan ? toGb(scan.bytes) : 0;
  const estimates = scan ? STORAGE_PLANS.map((plan) => estimatePlan(plan, gb, computers)) : [];
  const freeOptions = estimates.filter((e) => e.fitsFree).map((e) => e.plan.name);
  const lossless = scan ? (scan.formats.wav?.bytes ?? 0) + (scan.formats.flac?.bytes ?? 0) + (scan.formats.aiff?.bytes ?? 0) : 0;
  const mp3Bytes = scan ? mp3EquivalentBytes(scan) : 0;

  return (
    <>
      <Pad disabled={scanning !== null} onClick={() => void start()} size="sm">
        {scanning === null ? "Check folder size" : `Scanning ${scanning} files`}
      </Pad>
      <input
        aria-label="Choose your music folder"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files) setScan(scanFileList(e.target.files));
          e.target.value = "";
        }}
        ref={inputRef}
        type="file"
        // Non-standard but supported by Chromium, Firefox and Safari for picking a whole folder.
        {...{ webkitdirectory: "" }}
      />

      {(scan || error) && (
        <section
          aria-label="Storage check"
          className="order-last basis-full border-t border-divider pt-4"
          role="region"
        >
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {scan && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-8">
                <div className="flex flex-col gap-1">
                  <span className={CAPTION}>Folder</span>
                  <span className="max-w-64 truncate text-lg leading-tight font-semibold">{scan.folder}</span>
                </div>
                <Readout caption="Music size" value={formatGb(scan.bytes)} />
                <Readout caption="Tracks" value={scan.tracks.toLocaleString("en-US")} />
                <Readout caption="Upload at 20 Mbps" value={formatDuration(uploadSeconds(scan.bytes, 20))} />
                <Readout caption="Upload at 100 Mbps" value={formatDuration(uploadSeconds(scan.bytes, 100))} />
                <Pad aria-label="Close storage check" className="ml-auto" onClick={() => setScan(null)} size="sm">
                  Close
                </Pad>
              </div>

              <p aria-live="polite" className={cn("text-sm font-semibold", freeOptions.length ? "text-signal" : "text-foreground")}>
                {scan.tracks === 0
                  ? "No audio files found in this folder."
                  : freeOptions.length
                    ? `Fits for free on ${new Intl.ListFormat("en", { type: "conjunction" }).format(freeOptions)}.`
                    : "Too big for any free tier. The cheapest option is listed first below."}
              </p>

              <p className="text-xs text-text-secondary">
                {Object.entries(scan.formats)
                  .sort((a, b) => b[1].bytes - a[1].bytes)
                  .map(([ext, f]) => `${ext.toUpperCase()} ${f.count} files, ${formatGb(f.bytes)}`)
                  .join(" · ")}
                {scan.otherFiles > 0 && ` · ${scan.otherFiles} other files left out (${formatGb(scan.otherBytes)})`}
              </p>

              {lossless > scan.bytes * 0.2 && (
                <p className="text-xs text-text-secondary">
                  Converted to 320 kbps MP3, this library would be about {formatGb(mp3Bytes)} (estimate).
                </p>
              )}

              <div className="flex items-center gap-3">
                <span className={CAPTION} id="computers-label">Computers that download it</span>
                <div aria-labelledby="computers-label" className="flex gap-1" role="group">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pad active={computers === n} className="w-10 px-0" key={n} onClick={() => setComputers(n)} size="sm" toggle>
                      {n}
                    </Pad>
                  ))}
                </div>
              </div>

              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className={cn("border-b border-divider", CAPTION)}>
                    <th className="py-2 font-medium">Service</th>
                    <th className="py-2 font-medium">Free tier</th>
                    <th className="py-2 font-medium">Free use</th>
                    <th className="py-2 font-medium">Result</th>
                    <th className="py-2 text-right font-medium">Per month</th>
                    <th className="py-2 text-right font-medium">
                      Downloads to {computers} {computers === 1 ? "PC" : "PCs"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...estimates]
                    .sort((a, b) => Number(b.fitsFree) - Number(a.fitsFree) || a.monthly + a.downloadCost - (b.monthly + b.downloadCost))
                    .map((e) => (
                      <tr className="border-b border-divider" key={e.plan.id}>
                        <td className="py-2">
                          <a className="underline decoration-pad-outline underline-offset-4 hover:decoration-foreground" href={e.plan.source} rel="noreferrer" target="_blank">
                            {e.plan.name}
                          </a>
                        </td>
                        <td className="py-2 font-mono tabular-nums">
                          {e.plan.freeGb} GB{Number.isFinite(e.plan.freeTransferGb) ? `, ${e.plan.freeTransferGb} GB downloads` : ""}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div aria-hidden className="h-1.5 w-24 bg-divider">
                              <div className={cn("h-full", e.fitsFree ? "bg-signal" : "bg-destructive")} style={{ width: `${Math.min(100, e.freeUsage * 100)}%` }} />
                            </div>
                            <span className="font-mono text-xs tabular-nums">{Math.round(e.freeUsage * 100)}%</span>
                          </div>
                        </td>
                        <td className="py-2">
                          {e.fitsFree ? (
                            <span className="bg-signal px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-[0.11em] text-on-signal uppercase">Free</span>
                          ) : (
                            <span className="font-mono text-[11px] font-medium tracking-[0.11em] uppercase">Needs {e.plan.paid.label}</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {formatUsd(e.monthly)}
                          {e.extraPlanFee && " + plan fee"}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">{formatUsd(e.downloadCost)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <p className="text-xs text-text-tertiary">
                Prices in USD from each provider&apos;s pricing page on {PRICES_CHECKED_ON}. Providers change their plans; open the links to confirm.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
};
