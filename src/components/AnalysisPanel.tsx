import { evidenceClaimLabels, sourceShortLabels } from "@/lib/format";
import type { ReactNode } from "react";
import type { TopicCluster } from "@/types";
import { KeywordChips, SourceBadge } from "./VisualBits";

export function AnalysisPanel({ topic }: { topic: TopicCluster }) {
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Narrative delta analysis
        </p>
        <h2 className="mt-1 text-xl font-semibold text-stone-950">ナラティブ差分分析</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-stone-600">
          ここでは「似ている」ではなく、何が移動し、誰が主語になり、どの問題と解決策が前景化したかを整理します。
        </p>
      </div>

      <AnalysisSection title="Common ground" titleJa="共通基盤">
        <ul className="grid gap-2 md:grid-cols-3">
          {topic.commonGround.map((item) => (
            <li key={item} className="rounded-md border border-stone-200 bg-white p-3 text-sm text-stone-700">
              {item}
            </li>
          ))}
        </ul>
      </AnalysisSection>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DeltaCard title="Frame shift" titleJa="フレームの変化" text={topic.delta.frameShift} />
        <DeltaCard title="Actor shift" titleJa="主役の変化" text={topic.delta.actorShift} />
        <DeltaCard title="Goal shift" titleJa="中心目標の変化" text={topic.delta.goalShift} />
        <DeltaCard
          title="Threat / problem shift"
          titleJa="脅威・問題設定の変化"
          text={topic.delta.threatShift}
        />
        <DeltaCard title="Solution shift" titleJa="解決策の変化" text={topic.delta.solutionShift} />
        <DeltaCard
          title="Authority source shift"
          titleJa="権威源の変化"
          text={topic.delta.authorityShift}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <LexicalContrast topic={topic} />
        <SilenceMap topic={topic} />
      </div>

      <EvidenceSnippetList topic={topic} />
    </section>
  );
}

function AnalysisSection({
  title,
  titleJa,
  children,
}: {
  title: string;
  titleJa: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p>
        <h3 className="text-lg font-semibold text-stone-950">{titleJa}</h3>
      </div>
      {children}
    </section>
  );
}

function DeltaCard({ title, titleJa, text }: { title: string; titleJa: string; text: string }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p>
      <h3 className="mt-1 text-base font-semibold text-stone-950">{titleJa}</h3>
      <p className="mt-3 text-sm leading-6 text-stone-700">{text}</p>
    </article>
  );
}

function LexicalContrast({ topic }: { topic: TopicCluster }) {
  return (
    <AnalysisSection title="Lexical contrast" titleJa="語彙コントラスト">
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-stone-100 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="w-1/2 px-4 py-3">人民日報の語彙</th>
              <th className="w-1/2 border-l border-stone-200 px-4 py-3">解放軍報の語彙</th>
            </tr>
          </thead>
          <tbody>
            <tr className="align-top">
              <td className="px-4 py-4">
                <KeywordChips terms={topic.delta.lexicalContrast.peopleDailyTerms} variant="people" />
              </td>
              <td className="border-l border-stone-200 px-4 py-4">
                <KeywordChips terms={topic.delta.lexicalContrast.plaDailyTerms} variant="pla" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AnalysisSection>
  );
}

function SilenceMap({ topic }: { topic: TopicCluster }) {
  return (
    <AnalysisSection title="Silence map" titleJa="沈黙マップ">
      <div className="grid gap-3">
        <div className="rounded-lg border border-rose-100 bg-rose-50/70 p-4">
          <p className="text-sm font-semibold text-rose-900">人民日報にあり、解放軍報では弱い</p>
          <div className="mt-3">
            <KeywordChips terms={topic.delta.silenceMap.peopleOnly} variant="people" />
          </div>
        </div>
        <div className="rounded-lg border border-teal-100 bg-teal-50/70 p-4">
          <p className="text-sm font-semibold text-teal-900">解放軍報にあり、人民日報では弱い</p>
          <div className="mt-3">
            <KeywordChips terms={topic.delta.silenceMap.plaOnly} variant="pla" />
          </div>
        </div>
      </div>
    </AnalysisSection>
  );
}

function EvidenceSnippetList({ topic }: { topic: TopicCluster }) {
  return (
    <AnalysisSection title="Evidence snippets" titleJa="根拠スニペット">
      <div className="grid gap-3">
        {topic.evidence.map((snippet) => (
          <article
            key={`${snippet.articleId}-${snippet.text}`}
            className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={snippet.source} />
              <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700">
                {evidenceClaimLabels[snippet.claimType]}
              </span>
              <span className="text-xs text-stone-500">記事ID: {snippet.articleId}</span>
            </div>
            <blockquote className="mt-3 border-l-2 border-stone-300 pl-3 text-sm leading-6 text-stone-800">
              {snippet.text}
            </blockquote>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              <span className="font-semibold text-stone-900">
                {sourceShortLabels[snippet.source]}側の支持点:
              </span>{" "}
              {snippet.supports}
            </p>
          </article>
        ))}
      </div>
    </AnalysisSection>
  );
}
