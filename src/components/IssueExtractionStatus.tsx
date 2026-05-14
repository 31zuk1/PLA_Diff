import { cn } from "@/lib/utils";
import type { ExtractionStatus, ExtractionSummary } from "./IssueComparisonTypes";

const statusLabels: Record<ExtractionStatus, string> = {
  not_started: "未開始",
  fetching: "取得中",
  success: "抽出済",
  partial: "一部抽出",
  empty: "空",
  failed: "失敗",
};

export function ExtractionStatusPill({
  extraction,
  fallbackStatus,
}: {
  extraction?: ExtractionSummary;
  fallbackStatus?: ExtractionStatus;
}) {
  const status = extraction?.status ?? fallbackStatus;

  if (!status && !extraction?.method) {
    return null;
  }

  const title = [extraction?.method, extraction?.message].filter(Boolean).join(" / ");

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-sm border bg-white/70 px-2 py-0.5 text-[11px] font-semibold leading-5 dark:bg-stone-950/70",
        status === "success" && "border-emerald-500 text-emerald-800 dark:text-emerald-300",
        status === "partial" && "border-amber-500 text-amber-800 dark:text-amber-300",
        status === "failed" && "border-rose-500 text-rose-800 dark:text-rose-300",
        status === "empty" && "border-stone-400 text-stone-700 dark:text-stone-300",
        (status === "fetching" || status === "not_started" || !status) &&
          "border-stone-300 text-stone-600 dark:border-stone-700 dark:text-stone-300",
      )}
      title={title || undefined}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{status ? statusLabels[status] : "抽出"}</span>
    </span>
  );
}

export function ExtractionStatusLine({ extraction }: { extraction?: ExtractionSummary }) {
  if (!extraction?.message && !extraction?.method && !extraction?.extractedAt) {
    return null;
  }

  return (
    <p className="text-[11px] leading-5 text-stone-500 dark:text-stone-400">
      {extraction.method ? <span>method: {extraction.method}</span> : null}
      {extraction.method && extraction.extractedAt ? <span> / </span> : null}
      {extraction.extractedAt ? <span>{extraction.extractedAt}</span> : null}
      {extraction.message ? <span className="block text-stone-600 dark:text-stone-300">{extraction.message}</span> : null}
    </p>
  );
}
