import { cn } from "@/lib/utils";
import { confidenceTone, formatConfidence, pageProminence, sourceLabels } from "@/lib/format";
import type { Source } from "@/types";

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const tone = confidenceTone(confidence);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "高" && "border-emerald-300 bg-emerald-50 text-emerald-800",
        tone === "中" && "border-amber-300 bg-amber-50 text-amber-800",
        tone === "低" && "border-stone-300 bg-stone-100 text-stone-700",
      )}
      aria-label={`信頼度 ${formatConfidence(confidence)}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      信頼度 {formatConfidence(confidence)}
    </span>
  );
}

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        source === "people_daily"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-teal-200 bg-teal-50 text-teal-800",
      )}
    >
      {sourceLabels[source]}
    </span>
  );
}

export function KeywordChips({
  terms,
  variant = "neutral",
  limit,
}: {
  terms: string[];
  variant?: "neutral" | "people" | "pla" | "actor";
  limit?: number;
}) {
  const visibleTerms = limit ? terms.slice(0, limit) : terms;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleTerms.map((term) => (
        <span
          key={term}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs leading-none",
            variant === "neutral" && "border-stone-200 bg-white text-stone-700",
            variant === "people" && "border-rose-200 bg-rose-50 text-rose-800",
            variant === "pla" && "border-teal-200 bg-teal-50 text-teal-800",
            variant === "actor" && "border-indigo-200 bg-indigo-50 text-indigo-800",
          )}
        >
          {term}
        </span>
      ))}
    </div>
  );
}

export function ActorChips({ actors }: { actors: string[] }) {
  return <KeywordChips terms={actors} variant="actor" />;
}

export function PageProminenceIndicator({ pageNumber }: { pageNumber: number }) {
  const prominence = pageProminence(pageNumber);

  return (
    <div className="flex items-center gap-2" aria-label={`版面注目度 ${prominence.label}`}>
      <span className="text-xs font-medium text-stone-500">注目度</span>
      <div className="flex items-end gap-0.5">
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={cn(
              "block w-1.5 rounded-sm",
              level <= prominence.level ? "bg-stone-800" : "bg-stone-200",
              level === 1 && "h-2",
              level === 2 && "h-3",
              level === 3 && "h-4",
              level === 4 && "h-5",
            )}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-stone-700">{prominence.label}</span>
    </div>
  );
}
