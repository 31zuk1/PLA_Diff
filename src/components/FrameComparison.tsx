import { summarizeSide } from "@/lib/data";
import type { Article } from "@/types";
import { KeywordChips } from "./VisualBits";

export function FrameComparison({
  peopleArticles,
  plaArticles,
}: {
  peopleArticles: Article[];
  plaArticles: Article[];
}) {
  const people = summarizeSide(peopleArticles);
  const pla = summarizeSide(plaArticles);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Side-by-side frame comparison
        </p>
        <h2 className="mt-1 text-lg font-semibold text-stone-950">フレーム比較</h2>
      </div>

      <div className="grid gap-3">
        <FrameSide
          label="人民日報"
          accent="people"
          frame={people.frames[0] ?? "未抽出"}
          actors={people.actors}
          problems={people.problems}
          solutions={people.solutions}
          authorities={people.authorities}
        />
        <FrameSide
          label="解放軍報"
          accent="pla"
          frame={pla.frames[0] ?? "未抽出"}
          actors={pla.actors}
          problems={pla.problems}
          solutions={pla.solutions}
          authorities={pla.authorities}
        />
      </div>
    </section>
  );
}

function FrameSide({
  label,
  accent,
  frame,
  actors,
  problems,
  solutions,
  authorities,
}: {
  label: string;
  accent: "people" | "pla";
  frame: string;
  actors: string[];
  problems: string[];
  solutions: string[];
  authorities: string[];
}) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-stone-900">{label}</h3>
        <span className="text-xs text-stone-500">{accent === "people" ? "党・国家紙" : "軍紙"}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-stone-700">{frame}</p>
      <CompactRow label="主役" terms={actors.slice(0, 4)} variant={accent} />
      <CompactRow label="問題" terms={problems.slice(0, 4)} variant={accent} />
      <CompactRow label="解決" terms={solutions.slice(0, 4)} variant={accent} />
      <CompactRow label="権威" terms={authorities.slice(0, 3)} variant={accent} />
    </div>
  );
}

function CompactRow({
  label,
  terms,
  variant,
}: {
  label: string;
  terms: string[];
  variant: "people" | "pla";
}) {
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <KeywordChips terms={terms} variant={variant} />
    </div>
  );
}
