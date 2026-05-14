import { evidenceClaimLabels } from "@/lib/format";
import type { EvidenceClaimType, TopicCluster } from "@/types";

type DeltaOverviewItem = {
  claimType: EvidenceClaimType;
  title: string;
  titleJa: string;
  text: string;
};

export function TopicDeltaOverview({
  topic,
  peopleArticleCount,
  plaArticleCount,
}: {
  topic: TopicCluster;
  peopleArticleCount: number;
  plaArticleCount: number;
}) {
  const items: DeltaOverviewItem[] = [
    {
      claimType: "frame_shift",
      title: "Frame shift",
      titleJa: "フレーム",
      text: topic.delta.frameShift,
    },
    {
      claimType: "actor_shift",
      title: "Actor shift",
      titleJa: "主役",
      text: topic.delta.actorShift,
    },
    {
      claimType: "goal_shift",
      title: "Goal shift",
      titleJa: "目標",
      text: topic.delta.goalShift,
    },
    {
      claimType: "threat_shift",
      title: "Threat shift",
      titleJa: "問題設定",
      text: topic.delta.threatShift,
    },
    {
      claimType: "solution_shift",
      title: "Solution shift",
      titleJa: "解決策",
      text: topic.delta.solutionShift,
    },
    {
      claimType: "authority_shift",
      title: "Authority shift",
      titleJa: "権威源",
      text: topic.delta.authorityShift,
    },
  ];

  return (
    <section className="mt-6 border-y border-stone-200 py-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Cluster-level claims
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-950">トピック単位の差分主張</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-700">
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">
            人民日報 {peopleArticleCount}件
          </span>
          <span className="text-stone-400">×</span>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-teal-800">
            解放軍報 {plaArticleCount}件
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const evidenceCount = topic.evidence.filter(
            (snippet) => snippet.claimType === item.claimType,
          ).length;

          return (
            <article
              key={item.claimType}
              className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {item.title}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-stone-950">{item.titleJa}</h3>
                </div>
                <EvidenceCount count={evidenceCount} claimType={item.claimType} />
              </div>
              <p className="mt-3 text-sm leading-6 text-stone-700">{item.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EvidenceCount({ count, claimType }: { count: number; claimType: EvidenceClaimType }) {
  const label = evidenceClaimLabels[claimType];

  return (
    <span
      className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-600"
      title={`${label} を支える根拠スニペット数`}
    >
      根拠 {count}
    </span>
  );
}
