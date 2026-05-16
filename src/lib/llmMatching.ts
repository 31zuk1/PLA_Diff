import {
  compareMatchGroupsForDisplay,
  scoreArticlePair,
  type ArticleMatchGroup,
  type ArticlePairScore,
  type MatchReason,
  type MatchableArticle,
} from "./matching";
import {
  CLUSTERABLE_ANCHOR_TERMS,
  GENERIC_JUDGE_TERMS,
  HIGH_VALUE_ANCHOR_PATTERNS,
  TOPIC_FAMILY_LABELS,
  anchorTermScore,
  isHighValueAnchorTerm,
  isStrongShortAnchorTerm,
  type TopicFamily,
} from "./llmMatching/anchors";

export interface BuildJudgedMatchGroupsOptions {
  aggregateUnmatched?: boolean;
  candidateLimit?: number;
  minCandidateConfidence?: number;
  minLlmConfidence?: number;
  useAi?: boolean;
}

interface CandidatePair<TArticle extends MatchableArticle> {
  id: string;
  pair: ArticlePairScore<TArticle>;
  usefulSharedTerms: string[];
  anchorScore: number;
  clusterKey?: string;
  topicFamily?: TopicFamily;
  titleMatchKind?: "exact" | "strong_phrase";
}

interface LlmPairDecision {
  pairId: string;
  matched: boolean;
  confidence: number;
  reason: string;
}

interface LlmBatchResult {
  decisions: LlmPairDecision[];
  model: string;
  usedAi: boolean;
  error?: string;
}

const DEFAULT_CANDIDATE_LIMIT = 72;
const DEFAULT_MIN_CANDIDATE_CONFIDENCE = 0.12;
const DEFAULT_MIN_LLM_CONFIDENCE = 70;
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

declare global {
  var __PLA_DIFF_LLM_MATCH_CACHE__: Map<string, LlmBatchResult> | undefined;
}

export function canUseLlmJudge() {
  return isLlmJudgeEnabledByEnv() && Boolean(process.env.OPENAI_API_KEY);
}

export function activeJudgeModelLabel() {
  if (!canUseLlmJudge()) {
    return "local-heuristic";
  }

  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function isLlmJudgeEnabledByEnv() {
  const value = process.env.ENABLE_LLM_JUDGE;

  if (!value) {
    return true;
  }

  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

export async function buildLlmJudgedMatchGroups<TArticle extends MatchableArticle>(
  peopleArticles: readonly TArticle[],
  plaArticles: readonly TArticle[],
  options: BuildJudgedMatchGroupsOptions = {},
): Promise<ArticleMatchGroup<TArticle>[]> {
  const aggregateUnmatched = options.aggregateUnmatched ?? true;
  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const minCandidateConfidence =
    options.minCandidateConfidence ?? DEFAULT_MIN_CANDIDATE_CONFIDENCE;
  const minLlmConfidence = options.minLlmConfidence ?? DEFAULT_MIN_LLM_CONFIDENCE;

  const allCandidates = peopleArticles
    .flatMap((peopleArticle) =>
      plaArticles.map((plaArticle) => candidateFromPair(scoreArticlePair(peopleArticle, plaArticle))),
    )
    .filter((candidate): candidate is CandidatePair<TArticle> => Boolean(candidate))
    .filter(
      (candidate) =>
        candidate.titleMatchKind ||
        candidate.topicFamily ||
        candidate.anchorScore >= 0.42 ||
        candidate.usefulSharedTerms.some(isHighValueAnchorTerm) ||
        candidate.pair.confidence >= minCandidateConfidence,
    );
  const candidates = selectCandidatePool(allCandidates, candidateLimit);

  const llmResult =
    options.useAi === false ? undefined : await adjudicateCandidatePairsWithLlm(candidates);
  const acceptedPairs = selectMatchedPairs(
    candidates,
    llmResult,
    minLlmConfidence,
    options.useAi === false,
  );

  const groups = buildMatchedGroupsFromPairs(acceptedPairs, llmResult);
  const usedPeopleArticleIds = new Set(
    groups.flatMap((group) => group.peopleArticles.map(articleKey)),
  );
  const usedPlaArticleIds = new Set(groups.flatMap((group) => group.plaArticles.map(articleKey)));

  const unmatchedPeopleArticles = peopleArticles.filter(
    (article) => !usedPeopleArticleIds.has(articleKey(article)),
  );
  const unmatchedPlaArticles = plaArticles.filter(
    (article) => !usedPlaArticleIds.has(articleKey(article)),
  );

  groups.push(...buildUnmatchedGroups("people_only", unmatchedPeopleArticles, aggregateUnmatched));
  groups.push(...buildUnmatchedGroups("pla_only", unmatchedPlaArticles, aggregateUnmatched));

  return groups.sort(compareMatchGroupsForDisplay);
}

function candidateFromPair<TArticle extends MatchableArticle>(
  pair: ArticlePairScore<TArticle>,
): CandidatePair<TArticle> | undefined {
  if (isIgnorableArticleTitle(pair.peopleArticle) || isIgnorableArticleTitle(pair.plaArticle)) {
    return undefined;
  }

  const topicFamily = sharedTopicFamily(pair.peopleArticle, pair.plaArticle);
  const directAnchorTerms = [
    ...sharedTitleTerms(pair.peopleArticle, pair.plaArticle),
    ...sharedAnchorTerms(pair.peopleArticle, pair.plaArticle),
  ].filter(uniqueTerm);
  const usefulSharedTerms = [
    ...directAnchorTerms,
    ...pair.sharedTerms.filter(isUsefulJudgeTerm),
  ].filter(uniqueTerm).slice(0, 8);
  const anchorScore = sharedAnchorScore(directAnchorTerms);
  const titleMatchKind = titleMatchKindForPair(pair, directAnchorTerms);
  const clusterKey =
    titleMatchKind === "exact"
      ? exactTitleClusterKey(pair.peopleArticle, pair.plaArticle)
      : clusterKeyForSharedTerms(directAnchorTerms);

  if (!topicFamily && !titleMatchKind && usefulSharedTerms.length === 0 && pair.confidence < 0.2) {
    return undefined;
  }

  return {
    id: `pair:${articleKey(pair.peopleArticle)}:${articleKey(pair.plaArticle)}`,
    pair,
    usefulSharedTerms,
    anchorScore,
    clusterKey,
    topicFamily,
    titleMatchKind,
  };
}

function selectCandidatePool<TArticle extends MatchableArticle>(
  candidates: CandidatePair<TArticle>[],
  candidateLimit: number,
) {
  const selected = new Map<string, CandidatePair<TArticle>>();
  const add = (candidate: CandidatePair<TArticle>) => {
    if (selected.size < candidateLimit) {
      selected.set(candidate.id, candidate);
    }
  };
  const addMany = (items: CandidatePair<TArticle>[]) => {
    for (const item of items) {
      add(item);
    }
  };
  const ranked = [...candidates].sort(compareCandidatePriority);

  addMany(ranked.filter((candidate) => candidate.titleMatchKind === "exact"));
  addMany(
    ranked.filter(
      (candidate) => candidate.titleMatchKind === "strong_phrase" || candidate.anchorScore >= 0.78,
    ),
  );
  addMany(topCandidatesPerSide(candidates, "people", 3));
  addMany(topCandidatesPerSide(candidates, "pla", 3));
  addMany(ranked);

  return [...selected.values()].sort(compareCandidatePriority);
}

function topCandidatesPerSide<TArticle extends MatchableArticle>(
  candidates: CandidatePair<TArticle>[],
  side: "people" | "pla",
  limit: number,
) {
  const groups = new Map<string, CandidatePair<TArticle>[]>();

  for (const candidate of candidates) {
    if (candidate.usefulSharedTerms.length === 0 && !candidate.titleMatchKind) {
      continue;
    }

    const article =
      side === "people" ? candidate.pair.peopleArticle : candidate.pair.plaArticle;
    const key = articleKey(article);
    const group = groups.get(key) ?? [];

    group.push(candidate);
    groups.set(key, group);
  }

  return [...groups.values()].flatMap((group) =>
    group.sort(compareCandidatePriority).slice(0, limit),
  );
}

function compareCandidatePriority<TArticle extends MatchableArticle>(
  left: CandidatePair<TArticle>,
  right: CandidatePair<TArticle>,
) {
  return candidatePriority(right) - candidatePriority(left) || left.id.localeCompare(right.id);
}

function candidatePriority<TArticle extends MatchableArticle>(candidate: CandidatePair<TArticle>) {
  const titleBoost =
    candidate.titleMatchKind === "exact" ? 3 : candidate.titleMatchKind === "strong_phrase" ? 1.4 : 0;
  const topicFamilyBoost = candidate.topicFamily ? 0.12 : 0;

  return (
    titleBoost +
    topicFamilyBoost +
    candidate.anchorScore * 1.6 +
    candidate.pair.confidence +
    candidate.usefulSharedTerms.length * 0.04
  );
}

async function adjudicateCandidatePairsWithLlm<TArticle extends MatchableArticle>(
  candidates: CandidatePair<TArticle>[],
): Promise<LlmBatchResult | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || candidates.length === 0) {
    return undefined;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const cacheKey = llmCacheKey(model, candidates);
  const cached = llmCache().get(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a careful Japanese OSINT research assistant. Return compact JSON only.",
          },
          {
            role: "user",
            content: buildLlmPrompt(candidates),
          },
        ],
      }),
    });

    if (!response.ok) {
      const result = { decisions: [], model, usedAi: false, error: `OpenAI HTTP ${response.status}` };
      llmCache().set(cacheKey, result);
      return result;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as { decisions?: LlmPairDecision[] };
    const decisions = sanitizeDecisions(parsed.decisions ?? [], candidates);
    const result = { decisions, model, usedAi: true };

    llmCache().set(cacheKey, result);
    return result;
  } catch (error) {
    const result = {
      decisions: [],
      model,
      usedAi: false,
      error: error instanceof Error ? error.message : "OpenAI adjudication failed",
    };

    llmCache().set(cacheKey, result);
    return result;
  }
}

function buildLlmPrompt<TArticle extends MatchableArticle>(
  candidates: CandidatePair<TArticle>[],
) {
  return `人民日報と解放軍報の記事ペア候補について、同じ具体対象としてMATCHED扱いしてよいか判定してください。

判定ルール:
- matched=true は、同一の具体的な出来事、外交会談・会見、声明、政策発表、事故、訓練、会議、法令・執法検査を両紙が扱う場合だけです。
- 広い外交局面、政策モーメント、topic-cluster、同じ日付の関連テーマというだけなら matched=false。
- 例: 靖国神社という同一対象、莫桑比克/查波の同一会谈、老挝/沙伦赛の同一会见、同一の联合声明なら matched=true。
- 例: 「向新向好」「稳中有进」など特徴的な表現があっても、同じ具体対象や同じ声明本文に接続できないなら matched=false。
- 片方が首脳外交の総論、もう片方が経済協力や軍内学習など別対象を扱う場合は、同じ外交・政策局面に見えても matched=false。
- 「习近平」「中国」「发展」「高质量发展」など汎用語だけの一致は matched=false。
- 同じスローガンでも別の具体事例なら matched=false。
- topicFamily は候補選定の補助シグナルです。topicFamily が同じという理由だけで matched=true にしてはいけません。
- confidence は 0-100。70未満はUIではMATCHED採用しません。

JSONだけを返してください:
{
  "decisions": [
    { "pairId": "pair id", "matched": true, "confidence": 0-100, "reason": "日本語で短く" }
  ]
}

候補:
${JSON.stringify(candidates.map(candidateForPrompt), null, 2)}`;
}

function candidateForPrompt<TArticle extends MatchableArticle>(candidate: CandidatePair<TArticle>) {
  const people = candidate.pair.peopleArticle;
  const pla = candidate.pair.plaArticle;

  return {
    pairId: candidate.id,
    sharedTerms: candidate.usefulSharedTerms,
    topicFamilySignal: candidate.topicFamily ? TOPIC_FAMILY_LABELS[candidate.topicFamily] : undefined,
    heuristicConfidence: Math.round(candidate.pair.confidence * 100),
    peopleDaily: articleForPrompt(people),
    plaDaily: articleForPrompt(pla),
  };
}

function articleForPrompt(article: MatchableArticle) {
  return {
    id: articleKey(article),
    page: article.pageNumber ?? article.page,
    title: articleTitle(article),
    subtitle: article.subtitle ?? article.extraction?.subtitle,
    excerpt: truncatePromptText(
      article.analysisText ??
        article.bodyText ??
        article.body ??
        article.text ??
        article.excerpt ??
        article.summary ??
        "",
      650,
    ),
  };
}

function sanitizeDecisions<TArticle extends MatchableArticle>(
  decisions: LlmPairDecision[],
  candidates: CandidatePair<TArticle>[],
) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  return decisions
    .filter((decision) => candidateIds.has(decision.pairId))
    .map((decision) => ({
      pairId: decision.pairId,
      matched: Boolean(decision.matched),
      confidence: clamp(Math.round(Number(decision.confidence) || 0), 0, 100),
      reason: truncatePromptText(String(decision.reason || "LLM判定"), 180),
    }));
}

function selectMatchedPairs<TArticle extends MatchableArticle>(
  candidates: CandidatePair<TArticle>[],
  llmResult: LlmBatchResult | undefined,
  minLlmConfidence: number,
  forceLocal: boolean,
) {
  const decisionsByPairId = new Map((llmResult?.decisions ?? []).map((decision) => [decision.pairId, decision]));
  const selected: CandidatePair<TArticle>[] = [];
  const rankedCandidates = [...candidates].sort((left, right) => {
    const leftDecision = decisionsByPairId.get(left.id);
    const rightDecision = decisionsByPairId.get(right.id);
    const leftConfidence = acceptedPairConfidence(left, leftDecision);
    const rightConfidence = acceptedPairConfidence(right, rightDecision);

    return rightConfidence - leftConfidence || right.pair.confidence - left.pair.confidence;
  });

  for (const candidate of rankedCandidates) {
    const decision = decisionsByPairId.get(candidate.id);
    const matchedByStrongTitle =
      candidate.titleMatchKind === "exact" ||
      (candidate.titleMatchKind === "strong_phrase" &&
        candidate.usefulSharedTerms.some(isHighValueAnchorTerm));
    const matchedByLlm =
      decision?.matched === true &&
      decision.confidence >= minLlmConfidence &&
      isConcreteLlmMatchCandidate(candidate);
    const matchedByLocalFallback =
      (forceLocal || !llmResult?.usedAi) &&
      isStrongLocalFallbackCandidate(candidate);

    if (!matchedByStrongTitle && !matchedByLlm && !matchedByLocalFallback) {
      continue;
    }

    selected.push(candidate);
  }

  return selected;
}

function buildMatchedGroupsFromPairs<TArticle extends MatchableArticle>(
  candidates: CandidatePair<TArticle>[],
  llmResult: LlmBatchResult | undefined,
) {
  if (candidates.length === 0) {
    return [];
  }

  const decisionsByPairId = new Map((llmResult?.decisions ?? []).map((decision) => [decision.pairId, decision]));
  const groupedPairs = new Map<string, CandidatePair<TArticle>[]>();

  for (const candidate of candidates) {
    const key = candidate.clusterKey ?? candidate.id;
    const group = groupedPairs.get(key) ?? [];

    group.push(candidate);
    groupedPairs.set(key, group);
  }

  return [...groupedPairs.values()].map((pairs) =>
    componentToMatchedGroup(
      pairs.sort(
        (left, right) =>
          acceptedPairConfidence(right, decisionsByPairId.get(right.id)) -
            acceptedPairConfidence(left, decisionsByPairId.get(left.id)) ||
          left.id.localeCompare(right.id),
      ),
      decisionsByPairId,
    ),
  );
}

function componentToMatchedGroup<TArticle extends MatchableArticle>(
  candidates: CandidatePair<TArticle>[],
  decisionsByPairId: Map<string, LlmPairDecision>,
): ArticleMatchGroup<TArticle> {
  const topCandidate = candidates[0];
  const confidence = Math.max(
    ...candidates.map((candidate) =>
      acceptedPairConfidence(candidate, decisionsByPairId.get(candidate.id)),
    ),
  );
  const sharedTerms = candidates.flatMap((candidate) => candidate.usefulSharedTerms).filter(uniqueTerm).slice(0, 12);
  const isManyToMany = uniqueArticles(candidates.map((candidate) => candidate.pair.peopleArticle)).length > 1 ||
    uniqueArticles(candidates.map((candidate) => candidate.pair.plaArticle)).length > 1;
  const reasons: MatchReason[] = [
    {
      basis: "narrative",
      signal: isManyToMany
        ? candidates.some((candidate) => decisionsByPairId.get(candidate.id)?.matched)
          ? "llm_topic_component"
          : "anchor_topic_component"
        : topCandidate.titleMatchKind === "exact"
        ? "exact_title_match"
        : topCandidate.titleMatchKind === "strong_phrase"
          ? "strong_title_phrase_match"
        : decisionsByPairId.get(topCandidate.id)
          ? "llm_adjudication"
          : "local_high_precision_match",
      score: confidence,
      weight: 1,
      detail:
        isManyToMany
          ? "採用済みMACHEDペアを連結し、N対MのMACHEDグループとして表示。1対1の全文差分ではなく、同一トピック内の表現差を見るための束です。"
          : topCandidate.titleMatchKind === "exact"
          ? "正規化タイトルが一致したため、高精度MATCHEDとして採用。"
          : topCandidate.titleMatchKind === "strong_phrase"
            ? "タイトル内の固有政策名・固有トピックが強く一致したため、MATCHEDとして採用。"
          : decisionsByPairId.get(topCandidate.id)?.reason ??
        "LLMを使えないため、共有語と高いヒューリスティック信頼度でMATCHED候補化。",
      terms: sharedTerms,
    },
    ...candidates.flatMap((candidate) => matchedPairReasons(candidate, decisionsByPairId.get(candidate.id))),
    ...topCandidate.pair.reasons,
  ];

  return {
    id: `matched:${uniqueArticles(candidates.map((candidate) => candidate.pair.peopleArticle)).map(articleKey).join("+")}:${uniqueArticles(candidates.map((candidate) => candidate.pair.plaArticle)).map(articleKey).join("+")}`,
    matchType: topCandidate.pair.matchType,
    confidence,
    lexicalSimilarity: Math.max(...candidates.map((candidate) => candidate.pair.lexicalSimilarity)),
    narrativeSimilarity: Math.max(...candidates.map((candidate) => candidate.pair.narrativeSimilarity)),
    peopleArticles: sortArticlesForGroup(
      uniqueArticles(candidates.map((candidate) => candidate.pair.peopleArticle)),
    ),
    plaArticles: sortArticlesForGroup(
      uniqueArticles(candidates.map((candidate) => candidate.pair.plaArticle)),
    ),
    reasons,
    sharedTerms,
    peopleOnlyTerms: candidates.flatMap((candidate) => candidate.pair.peopleOnlyTerms).filter(uniqueTerm).slice(0, 8),
    plaOnlyTerms: candidates.flatMap((candidate) => candidate.pair.plaOnlyTerms).filter(uniqueTerm).slice(0, 8),
  };
}

function matchedPairReasons<TArticle extends MatchableArticle>(
  candidate: CandidatePair<TArticle>,
  decision: LlmPairDecision | undefined,
): MatchReason[] {
  if (!decision?.matched) {
    return [];
  }

  return [
    {
      basis: "narrative",
      signal: "llm_adjudication",
      score: decision.confidence / 100,
      weight: 0.72,
      detail: decision.reason,
      terms: candidate.usefulSharedTerms,
    },
  ];
}

function acceptedPairConfidence<TArticle extends MatchableArticle>(
  candidate: CandidatePair<TArticle>,
  decision: LlmPairDecision | undefined,
) {
  const matchedDecisionConfidence = decision?.matched === true ? decision.confidence / 100 : 0;

  if (candidate.titleMatchKind === "exact") {
    return Math.max(0.92, matchedDecisionConfidence);
  }

  if (candidate.titleMatchKind === "strong_phrase") {
    return Math.max(0.84, matchedDecisionConfidence);
  }

  if (decision?.matched === true) {
    return matchedDecisionConfidence;
  }

  if (candidate.anchorScore >= 0.78) {
    return Math.max(0.72, candidate.pair.confidence);
  }

  return candidate.pair.confidence;
}

function isStrongLocalFallbackCandidate<TArticle extends MatchableArticle>(
  candidate: CandidatePair<TArticle>,
) {
  return (
    (candidate.anchorScore >= 0.72 && candidate.usefulSharedTerms.some(isHighValueAnchorTerm)) ||
    candidate.titleMatchKind === "exact" ||
    candidate.titleMatchKind === "strong_phrase"
  );
}

function isConcreteLlmMatchCandidate<TArticle extends MatchableArticle>(
  candidate: CandidatePair<TArticle>,
) {
  if (candidate.titleMatchKind === "exact" || candidate.titleMatchKind === "strong_phrase") {
    return true;
  }

  return candidate.anchorScore >= 0.72 && candidate.usefulSharedTerms.some(isHighValueAnchorTerm);
}

function uniqueArticles<TArticle extends MatchableArticle>(articles: TArticle[]) {
  const byKey = new Map<string, TArticle>();

  for (const article of articles) {
    byKey.set(articleKey(article), article);
  }

  return [...byKey.values()];
}

function sortArticlesForGroup<TArticle extends MatchableArticle>(articles: TArticle[]) {
  return [...articles].sort(
    (left, right) =>
      articlePageNumber(left) - articlePageNumber(right) ||
      articleKey(left).localeCompare(articleKey(right)),
  );
}

function buildUnmatchedGroups<TArticle extends MatchableArticle>(
  matchType: "people_only" | "pla_only",
  articles: readonly TArticle[],
  aggregateUnmatched: boolean,
): ArticleMatchGroup<TArticle>[] {
  if (articles.length === 0) {
    return [];
  }

  if (!aggregateUnmatched) {
    return articles.map((article) => unmatchedGroup(matchType, [article]));
  }

  return [...groupArticlesByPage(articles).entries()].map(([pageKey, pageArticles]) =>
    unmatchedGroup(matchType, pageArticles, pageKey),
  );
}

function unmatchedGroup<TArticle extends MatchableArticle>(
  matchType: "people_only" | "pla_only",
  articles: readonly TArticle[],
  pageKey?: string,
): ArticleMatchGroup<TArticle> {
  const label = matchType === "people_only" ? "People's only" : "81cn only";

  return {
    id: `${matchType}:${pageKey ?? articleKey(articles[0])}`,
    matchType,
    confidence: 0,
    lexicalSimilarity: 0,
    narrativeSimilarity: 0,
    peopleArticles: matchType === "people_only" ? [...articles] : [],
    plaArticles: matchType === "pla_only" ? [...articles] : [],
    reasons: [
      {
        basis: "metadata",
        signal: "unmatched_after_llm",
        score: 1,
        weight: 1,
        detail: `${label}: LLM判定後にMATCHED採用されなかった記事群。`,
      },
    ],
    sharedTerms: [],
    peopleOnlyTerms: [],
    plaOnlyTerms: [],
  };
}

function groupArticlesByPage<TArticle extends MatchableArticle>(
  articles: readonly TArticle[],
) {
  const groups = new Map<string, TArticle[]>();

  for (const article of articles) {
    const pageNumber = article.pageNumber ?? article.page ?? "unknown";
    const pageName = article.pageName ?? "";
    const key = `${pageNumber}:${pageName || "page"}`;
    const group = groups.get(key) ?? [];

    group.push(article);
    groups.set(key, group);
  }

  return groups;
}

function llmCacheKey<TArticle extends MatchableArticle>(
  model: string,
  candidates: CandidatePair<TArticle>[],
) {
  return [
    "peoplepla-match-v3-specific-target",
    model,
    candidates
      .map(
        (candidate) =>
          `${candidate.id}:${candidate.pair.peopleArticle.title ?? ""}:${candidate.pair.plaArticle.title ?? ""}:${candidate.usefulSharedTerms.join(",")}`,
      )
      .join("|"),
  ].join(":");
}

function llmCache() {
  globalThis.__PLA_DIFF_LLM_MATCH_CACHE__ ??= new Map<string, LlmBatchResult>();
  return globalThis.__PLA_DIFF_LLM_MATCH_CACHE__;
}

function isUsefulJudgeTerm(term: string) {
  const normalized = term.trim();

  return normalized.length >= 2 && !GENERIC_JUDGE_TERMS.has(normalized);
}

function sharedTitleTerms(left: MatchableArticle, right: MatchableArticle) {
  const leftTitle = normalizeTitleForMatch(articleTitle(left));
  const rightTitle = normalizeTitleForMatch(articleTitle(right));

  if (!leftTitle || !rightTitle) {
    return [];
  }

  if (leftTitle === rightTitle) {
    return [articleTitle(left).trim()];
  }

  const common = cleanSharedTitleTerm(longestCommonSubstring(leftTitle, rightTitle));

  if (
    (common.length >= 5 || isStrongShortAnchorTerm(common)) &&
    !GENERIC_JUDGE_TERMS.has(common)
  ) {
    return [common];
  }

  return [];
}

function sharedAnchorTerms(left: MatchableArticle, right: MatchableArticle) {
  const leftTerms = extractAnchorTerms(left);
  const rightTerms = extractAnchorTerms(right);
  const terms: string[] = [];

  for (const term of leftTerms) {
    if (rightTerms.has(term) && isUsefulJudgeTerm(term)) {
      terms.push(term);
    }
  }

  return terms.sort((leftTerm, rightTerm) => anchorTermScore(rightTerm) - anchorTermScore(leftTerm));
}

function extractAnchorTerms(article: MatchableArticle) {
  const text = articleTextForAnchors(article);
  const headlineText = articleHeadlineTextForAnchors(article);
  const terms = new Set<string>();

  for (const anchor of HIGH_VALUE_ANCHOR_PATTERNS) {
    if (anchor.pattern.test(anchor.headlineOnly ? headlineText : text)) {
      terms.add(anchor.canonical);
    }
    anchor.pattern.lastIndex = 0;
  }

  const eventLikeMatches =
    text.match(
      /[\u3400-\u9fffA-Za-z0-9\-—－]{2,26}(?:法|执法检查|经贸磋商|经贸论坛|论坛|会议|会晤|会见|会谈|国事访问|访问|发布会|联合声明|声明|行动计划|专项行动|研讨会|联谊赛|工程|清单|制度)/g,
    ) ?? [];

  for (const match of eventLikeMatches) {
    const term = normalizeAnchorTerm(match);

    if (term.length >= 4 && term.length <= 24 && isHighValueAnchorTerm(term)) {
      terms.add(term);
    }
  }

  return terms;
}

function sharedAnchorScore(terms: string[]) {
  return clamp(
    terms.reduce((score, term) => score + anchorTermScore(term), 0) / 2,
    0,
    1,
  );
}

function clusterKeyForSharedTerms(terms: string[]) {
  const clusterTerm = terms
    .filter((term) => CLUSTERABLE_ANCHOR_TERMS.has(term))
    .sort((leftTerm, rightTerm) => anchorTermScore(rightTerm) - anchorTermScore(leftTerm))[0];

  return clusterTerm ? `anchor:${normalizeAnchorTerm(clusterTerm)}` : undefined;
}

function exactTitleClusterKey(left: MatchableArticle, right: MatchableArticle) {
  const leftTitle = normalizeTitleForMatch(articleTitle(left));
  const rightTitle = normalizeTitleForMatch(articleTitle(right));

  if (!leftTitle || leftTitle !== rightTitle) {
    return undefined;
  }

  return `exact-title:${leftTitle}`;
}

function sharedTopicFamily(left: MatchableArticle, right: MatchableArticle): TopicFamily | undefined {
  const leftFamilies = articleTopicFamilies(left);
  const rightFamilies = articleTopicFamilies(right);

  for (const family of leftFamilies) {
    if (rightFamilies.has(family)) {
      return family;
    }
  }

  return undefined;
}

function articleTopicFamilies(article: MatchableArticle) {
  const text = normalizeAnchorTerm(articleTextForAnchors(article));
  const headlineText = normalizeAnchorTerm(articleHeadlineTextForAnchors(article));
  const families = new Set<TopicFamily>();

  if (/粮食安全保障法/.test(text)) {
    families.add("food_security_law");
  }

  if (/正确政绩观|树立和践行正确政绩观/.test(headlineText)) {
    families.add("correct_political_achievement");
  }

  if (
    /中美|美中/.test(text) &&
    /关系|经贸|民间|人文|青年|友谊|正确相处之道|特朗普|美国企业|加州|经贸磋商|元首会晤|访华|国事访问|匹克球/.test(
      text,
    )
  ) {
    families.add("china_us_relations");
  }

  return families;
}

function titleMatchKindForPair<TArticle extends MatchableArticle>(
  pair: ArticlePairScore<TArticle>,
  usefulSharedTerms: string[],
): CandidatePair<TArticle>["titleMatchKind"] {
  if (isExactUsefulTitleMatch(pair.peopleArticle, pair.plaArticle)) {
    return "exact";
  }

  const strongestTerm = usefulSharedTerms[0] ?? "";

  if (
    (strongestTerm.length >= 6 || isStrongShortAnchorTerm(strongestTerm)) &&
    (pair.confidence >= 0.2 || isStrongShortAnchorTerm(strongestTerm)) &&
    isHighValueAnchorTerm(strongestTerm)
  ) {
    return "strong_phrase";
  }

  return undefined;
}

function isExactUsefulTitleMatch(left: MatchableArticle, right: MatchableArticle) {
  const leftTitle = normalizeTitleForMatch(articleTitle(left));
  const rightTitle = normalizeTitleForMatch(articleTitle(right));

  return leftTitle.length >= 8 && leftTitle === rightTitle;
}

function isIgnorableArticleTitle(article: MatchableArticle) {
  const normalized = normalizeTitleForMatch(articleTitle(article));

  return (
    normalized === "图片" ||
    normalized === "图片报道" ||
    normalized === "导读" ||
    normalized === "短讯"
  );
}

function cleanSharedTitleTerm(value: string) {
  return value.replace(/^动(?=.{5,})/, "").trim();
}

function normalizeTitleForMatch(value: string) {
  return value
    .replace(/[\s\-—–·・:：,，.。"'“”‘’（）()《》【】、]/g, "")
    .trim();
}

function longestCommonSubstring(left: string, right: string) {
  let best = "";

  for (let start = 0; start < left.length; start += 1) {
    for (let end = start + best.length + 1; end <= left.length; end += 1) {
      const candidate = left.slice(start, end);

      if (right.includes(candidate)) {
        best = candidate;
      }
    }
  }

  return best;
}

function uniqueTerm(term: string, index: number, terms: string[]) {
  return terms.indexOf(term) === index;
}

function articleKey(article: MatchableArticle) {
  return (
    article.id ??
    article.sourceArticleId ??
    article.extraction?.sourceArticleId ??
    `${article.source ?? "article"}:${article.issueDate ?? article.date ?? "unknown"}:${article.pageNumber ?? article.page ?? "x"}:${articleTitle(article)}`
  );
}

function articlePageNumber(article: MatchableArticle) {
  const page = article.pageNumber ?? article.extraction?.pageNumber ?? article.page ?? article.extraction?.page;

  if (typeof page === "number") {
    return page;
  }

  if (typeof page === "string") {
    const parsed = Number.parseInt(page, 10);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  }

  return Number.MAX_SAFE_INTEGER;
}

function articleTitle(article: MatchableArticle) {
  return article.title ?? article.headline ?? article.extraction?.title ?? article.extraction?.headline ?? "Untitled";
}

function articleTextForAnchors(article: MatchableArticle) {
  return [
    articleTitle(article),
    article.subtitle,
    article.extraction?.subtitle,
    article.excerpt,
    article.summary,
    article.analysisText,
    article.bodyText,
    article.body,
    article.text,
    article.extraction?.excerpt,
    article.extraction?.summary,
    article.extraction?.analysisText,
    article.extraction?.bodyText,
    article.extraction?.body,
    article.extraction?.text,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .slice(0, 4_000);
}

function articleHeadlineTextForAnchors(article: MatchableArticle) {
  return [
    articleTitle(article),
    article.subtitle,
    article.extraction?.subtitle,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

function truncatePromptText(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAnchorTerm(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(/[，。、“”‘’《》（）()［］\[\]：:；;,.!?！？]/g, "")
    .replace(/[—－]/g, "-")
    .trim();
}
