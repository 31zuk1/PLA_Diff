export type NewspaperSource = "people_daily" | "pla_daily";

export type ArticleMatchType =
  | "same_event"
  | "same_policy"
  | "policy_to_military"
  | "same_slogan_different_case"
  | "people_only"
  | "pla_only"
  | "uncertain";

export type MatchReasonBasis = "lexical" | "narrative" | "metadata";

export interface MatchReason {
  basis: MatchReasonBasis;
  signal: string;
  score: number;
  weight: number;
  detail: string;
  terms?: string[];
}

export interface MatchableEntity {
  text: string;
  type?: string;
  confidence?: number;
}

export interface MatchableNarrativeProfile {
  coreFrame?: string;
  mainActors?: readonly string[];
  beneficiaries?: readonly string[];
  problemTerms?: readonly string[];
  solutionTerms?: readonly string[];
  authoritySources?: readonly string[];
  actionVerbs?: readonly string[];
}

export interface MatchableExtraction {
  sourceArticleId?: string;
  title?: string;
  headline?: string;
  subtitle?: string;
  excerpt?: string;
  summary?: string;
  body?: string;
  bodyText?: string;
  analysisText?: string;
  content?: string;
  text?: string;
  keywords?: readonly string[];
  entities?: readonly MatchableEntity[];
  narrativeProfile?: MatchableNarrativeProfile;
  issueDate?: string;
  date?: string;
  publishedAt?: string;
  pageNumber?: number;
  page?: number | string;
}

export interface MatchableArticle {
  id?: string;
  sourceArticleId?: string;
  source?: NewspaperSource;
  issueDate?: string;
  date?: string;
  publishedAt?: string;
  pageNumber?: number;
  page?: number | string;
  pageName?: string;
  title?: string;
  headline?: string;
  subtitle?: string;
  author?: string;
  url?: string;
  excerpt?: string;
  summary?: string;
  body?: string;
  bodyText?: string;
  analysisText?: string;
  content?: string;
  text?: string;
  keywords?: readonly string[];
  entities?: readonly MatchableEntity[];
  narrativeProfile?: MatchableNarrativeProfile;
  extraction?: MatchableExtraction;
}

export interface ArticleMatchGroup<TArticle extends MatchableArticle = MatchableArticle> {
  id: string;
  matchType: ArticleMatchType;
  confidence: number;
  lexicalSimilarity: number;
  narrativeSimilarity: number;
  peopleArticles: TArticle[];
  plaArticles: TArticle[];
  reasons: MatchReason[];
  sharedTerms: string[];
  peopleOnlyTerms: string[];
  plaOnlyTerms: string[];
}

export interface ArticlePairScore<TArticle extends MatchableArticle = MatchableArticle> {
  peopleArticle: TArticle;
  plaArticle: TArticle;
  matchType: ArticleMatchType;
  confidence: number;
  lexicalSimilarity: number;
  narrativeSimilarity: number;
  metadataScore: number;
  reasons: MatchReason[];
  sharedTerms: string[];
  peopleOnlyTerms: string[];
  plaOnlyTerms: string[];
}

export interface BuildMatchGroupsOptions {
  minPairConfidence?: number;
  uncertainPairConfidence?: number;
  aggregateUnmatched?: boolean;
}

export interface MatchReasonSummary {
  summary: string;
  shortReasons: string[];
  detailedReasons: MatchReason[];
  byBasis: Record<MatchReasonBasis, MatchReason[]>;
}

export interface SummarizeMatchReasonsOptions {
  maxReasons?: number;
  includeScores?: boolean;
}

interface ArticleSignals {
  explicitTerms: Set<string>;
  narrativeTerms: Set<string>;
  militaryTerms: Set<string>;
  policyTerms: Set<string>;
  sloganTerms: Set<string>;
  textShingles: Set<string>;
  titleShingles: Set<string>;
}

const DEFAULT_MIN_PAIR_CONFIDENCE = 0.48;
const DEFAULT_UNCERTAIN_PAIR_CONFIDENCE = 0.34;

const GENERIC_OFFICIAL_TERMS = new Set([
  "习近平",
  "党中央",
  "新时代",
  "新征程",
  "中国式现代化",
  "高质量发展",
  "贯彻落实",
  "人民",
  "群众",
  "发展",
  "工作",
  "建设",
  "重要",
  "推动",
]);

const MILITARY_CUES = [
  "军",
  "部队",
  "官兵",
  "战斗力",
  "备战",
  "打仗",
  "训练",
  "演训",
  "作战",
  "指挥",
  "军委",
  "强军",
  "战场",
  "任务场",
  "训练场",
  "政治建军",
];

const POLICY_CUES = [
  "政策",
  "部署",
  "战略",
  "治理",
  "改革",
  "制度",
  "体系",
  "标准",
  "条例",
  "考核",
  "现代化",
  "生产力",
  "民生",
  "公共服务",
  "高质量",
];

const SLOGAN_CUES = ["思想", "精神", "观", "路线", "方针", "中国式现代化", "高质量发展"];

export function buildArticleMatchGroups<TArticle extends MatchableArticle>(
  peopleArticles: readonly TArticle[],
  plaArticles: readonly TArticle[],
  options: BuildMatchGroupsOptions = {},
): ArticleMatchGroup<TArticle>[] {
  const minPairConfidence = options.minPairConfidence ?? DEFAULT_MIN_PAIR_CONFIDENCE;
  const uncertainPairConfidence =
    options.uncertainPairConfidence ?? DEFAULT_UNCERTAIN_PAIR_CONFIDENCE;
  const aggregateUnmatched = options.aggregateUnmatched ?? true;

  const pairScores = peopleArticles.flatMap((peopleArticle) =>
    plaArticles.map((plaArticle) => scoreArticlePair(peopleArticle, plaArticle)),
  );

  const sortedPairs = [...pairScores].sort((left, right) => right.confidence - left.confidence);
  const usedPeopleArticleIds = new Set<string>();
  const usedPlaArticleIds = new Set<string>();
  const groups: ArticleMatchGroup<TArticle>[] = [];

  for (const pair of sortedPairs) {
    const peopleId = articleKey(pair.peopleArticle);
    const plaId = articleKey(pair.plaArticle);

    if (usedPeopleArticleIds.has(peopleId) || usedPlaArticleIds.has(plaId)) {
      continue;
    }

    const isUsablePair =
      pair.confidence >= minPairConfidence ||
      (pair.matchType === "uncertain" && pair.confidence >= uncertainPairConfidence);

    if (!isUsablePair) {
      continue;
    }

    usedPeopleArticleIds.add(peopleId);
    usedPlaArticleIds.add(plaId);
    groups.push(pairToGroup(pair));
  }

  const unmatchedPeopleArticles = peopleArticles.filter(
    (peopleArticle) => !usedPeopleArticleIds.has(articleKey(peopleArticle)),
  );
  const unmatchedPlaArticles = plaArticles.filter(
    (plaArticle) => !usedPlaArticleIds.has(articleKey(plaArticle)),
  );

  groups.push(...buildUnmatchedGroups("people_only", unmatchedPeopleArticles, aggregateUnmatched));
  groups.push(...buildUnmatchedGroups("pla_only", unmatchedPlaArticles, aggregateUnmatched));

  return groups.sort(compareMatchGroupsForDisplay);
}

export function scoreArticlePair<TArticle extends MatchableArticle>(
  peopleArticle: TArticle,
  plaArticle: TArticle,
): ArticlePairScore<TArticle> {
  const peopleSignals = buildArticleSignals(peopleArticle);
  const plaSignals = buildArticleSignals(plaArticle);

  const titleSimilarity = titleScore(articleTitle(peopleArticle), articleTitle(plaArticle));
  const textOverlap = jaccard(peopleSignals.textShingles, plaSignals.textShingles);
  const lexicalSimilarity = clamp01(titleSimilarity * 0.55 + textOverlap * 0.45);

  const sharedExplicitTerms = intersection(peopleSignals.explicitTerms, plaSignals.explicitTerms);
  const sharedNarrativeTerms = intersection(peopleSignals.narrativeTerms, plaSignals.narrativeTerms);
  const sharedPolicyTerms = intersection(peopleSignals.policyTerms, plaSignals.policyTerms);
  const sharedSloganTerms = intersection(peopleSignals.sloganTerms, plaSignals.sloganTerms);
  const sharedMilitaryTerms = intersection(peopleSignals.militaryTerms, plaSignals.militaryTerms);
  const sharedTerms = weightedSharedTerms([
    ...sharedExplicitTerms,
    ...sharedNarrativeTerms,
    ...sharedPolicyTerms,
    ...sharedSloganTerms,
    ...sharedMilitaryTerms,
  ]);

  const namedTermScore = sharedTermScore(sharedExplicitTerms);
  const policyScore = sharedTermScore(sharedPolicyTerms);
  const sloganScore = sharedTermScore(sharedSloganTerms) * 0.72;
  const militaryBridgeScore = policyToMilitaryScore(peopleSignals, plaSignals);
  const narrativeSimilarity = clamp01(
    namedTermScore * 0.32 + policyScore * 0.22 + sloganScore * 0.16 + militaryBridgeScore * 0.3,
  );

  const metadataScore = metadataMatchScore(peopleArticle, plaArticle);
  const confidence = clamp01(
    lexicalSimilarity * 0.38 + narrativeSimilarity * 0.44 + metadataScore * 0.18,
  );
  const matchType = classifyMatchType({
    confidence,
    lexicalSimilarity,
    narrativeSimilarity,
    metadataScore,
    sharedTerms,
    sharedPolicyTerms,
    sharedSloganTerms,
    militaryBridgeScore,
    textOverlap,
    titleSimilarity,
  });

  const peopleOnlyTerms = difference(peopleSignals.explicitTerms, plaSignals.explicitTerms).slice(
    0,
    8,
  );
  const plaOnlyTerms = difference(plaSignals.explicitTerms, peopleSignals.explicitTerms).slice(0, 8);

  return {
    peopleArticle,
    plaArticle,
    matchType,
    confidence,
    lexicalSimilarity,
    narrativeSimilarity,
    metadataScore,
    reasons: buildReasons({
      titleSimilarity,
      textOverlap,
      namedTermScore,
      policyScore,
      sloganScore,
      militaryBridgeScore,
      metadataScore,
      sharedTerms,
      sharedPolicyTerms,
      sharedSloganTerms,
      sharedMilitaryTerms,
    }),
    sharedTerms,
    peopleOnlyTerms,
    plaOnlyTerms,
  };
}

export function summarizeMatchReasons(
  input: readonly MatchReason[] | Pick<ArticleMatchGroup, "reasons">,
  options: SummarizeMatchReasonsOptions = {},
): MatchReasonSummary {
  const reasons = "reasons" in input ? input.reasons : input;
  const maxReasons = options.maxReasons ?? 3;
  const sortedReasons = [...reasons].sort(
    (left, right) => reasonContribution(right) - reasonContribution(left),
  );
  const detailedReasons = sortedReasons.slice(0, maxReasons);
  const shortReasons = detailedReasons.map((reason) =>
    formatReasonSummary(reason, options.includeScores ?? false),
  );

  return {
    summary: shortReasons.join(" / "),
    shortReasons,
    detailedReasons,
    byBasis: {
      lexical: sortedReasons.filter((reason) => reason.basis === "lexical"),
      narrative: sortedReasons.filter((reason) => reason.basis === "narrative"),
      metadata: sortedReasons.filter((reason) => reason.basis === "metadata"),
    },
  };
}

export function compareMatchGroupsForDisplay<TArticle extends MatchableArticle>(
  left: ArticleMatchGroup<TArticle>,
  right: ArticleMatchGroup<TArticle>,
): number {
  return (
    groupDisplayRank(left) - groupDisplayRank(right) ||
    matchTypePriority(left.matchType) - matchTypePriority(right.matchType) ||
    right.confidence - left.confidence ||
    groupPageNumber(left) - groupPageNumber(right) ||
    left.id.localeCompare(right.id)
  );
}

function formatReasonSummary(reason: MatchReason, includeScore: boolean): string {
  const terms = reason.terms?.length ? `: ${reason.terms.slice(0, 4).join("、")}` : "";
  const score = includeScore ? ` (${Math.round(reason.score * 100)}%)` : "";

  return `${basisLabel(reason.basis)}・${signalLabel(reason.signal)}${terms}${score}`;
}

function basisLabel(basis: MatchReasonBasis): string {
  if (basis === "lexical") {
    return "語彙";
  }

  if (basis === "narrative") {
    return "ナラティブ";
  }

  return "メタデータ";
}

function signalLabel(signal: string): string {
  const labels: Record<string, string> = {
    date_and_page_prominence: "日付・版面",
    policy_to_military_bridge: "政策から軍事語彙への接続",
    shared_named_or_policy_terms: "共有固有名/政策語",
    slogan_overlap_discounted: "共有スローガン",
    text_overlap: "本文/抜粋の重なり",
    title_similarity: "タイトル一致",
    exact_title_match: "完全タイトル一致",
    strong_title_phrase_match: "強いタイトル/政策語一致",
    llm_adjudication: "LLM判定",
    llm_topic_component: "LLMトピック束",
    anchor_topic_component: "アンカートピック束",
    local_high_precision_match: "ローカル高精度判定",
    unmatched: "片側のみ",
    unmatched_after_llm: "MATCHED非採用",
  };

  return labels[signal] ?? signal;
}

function reasonContribution(reason: MatchReason): number {
  return reason.score * reason.weight;
}

function groupDisplayRank(group: ArticleMatchGroup): number {
  if (group.matchType === "people_only" || group.matchType === "pla_only") {
    return 3;
  }

  if (group.matchType === "uncertain") {
    return 2;
  }

  if (group.confidence < DEFAULT_MIN_PAIR_CONFIDENCE) {
    return 1;
  }

  return 0;
}

function matchTypePriority(matchType: ArticleMatchType): number {
  const priorities: Record<ArticleMatchType, number> = {
    same_event: 0,
    policy_to_military: 1,
    same_policy: 2,
    same_slogan_different_case: 3,
    uncertain: 4,
    people_only: 5,
    pla_only: 6,
  };

  return priorities[matchType];
}

function groupPageNumber(group: ArticleMatchGroup): number {
  const firstArticle = group.peopleArticles[0] ?? group.plaArticles[0];
  return firstArticle ? pageNumberOrFallback(firstArticle) : Number.MAX_SAFE_INTEGER;
}

function groupArticlesByPage<TArticle extends MatchableArticle>(
  articles: readonly TArticle[],
): Map<string, TArticle[]> {
  const groups = new Map<string, TArticle[]>();

  for (const article of articles) {
    const pageNumber = pageNumberOrFallback(article);
    const pageName = article.pageName ?? "";
    const key = `${pageNumber}:${pageName || "page"}`;
    const group = groups.get(key) ?? [];

    group.push(article);
    groups.set(key, group);
  }

  return groups;
}

function pairToGroup<TArticle extends MatchableArticle>(
  pair: ArticlePairScore<TArticle>,
): ArticleMatchGroup<TArticle> {
  return {
    id: `match:${articleKey(pair.peopleArticle)}:${articleKey(pair.plaArticle)}`,
    matchType: pair.matchType,
    confidence: pair.confidence,
    lexicalSimilarity: pair.lexicalSimilarity,
    narrativeSimilarity: pair.narrativeSimilarity,
    peopleArticles: [pair.peopleArticle],
    plaArticles: [pair.plaArticle],
    reasons: pair.reasons,
    sharedTerms: pair.sharedTerms,
    peopleOnlyTerms: pair.peopleOnlyTerms,
    plaOnlyTerms: pair.plaOnlyTerms,
  };
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
  const topTerms = weightedSharedTerms(
    articles.flatMap((article) => [...buildArticleSignals(article).explicitTerms]),
  ).slice(0, 8);
  const label = matchType === "people_only" ? "人民日報側" : "解放軍報側";

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
        signal: "unmatched",
        score: 1,
        weight: 1,
        detail: `${label}にのみ残った記事群。対応する候補が閾値を超えなかったため、面ごとに集約して表示する。`,
        terms: topTerms,
      },
    ],
    sharedTerms: [],
    peopleOnlyTerms: matchType === "people_only" ? topTerms : [],
    plaOnlyTerms: matchType === "pla_only" ? topTerms : [],
  };
}

function buildReasons(input: {
  titleSimilarity: number;
  textOverlap: number;
  namedTermScore: number;
  policyScore: number;
  sloganScore: number;
  militaryBridgeScore: number;
  metadataScore: number;
  sharedTerms: string[];
  sharedPolicyTerms: string[];
  sharedSloganTerms: string[];
  sharedMilitaryTerms: string[];
}): MatchReason[] {
  const reasons: MatchReason[] = [
    {
      basis: "lexical",
      signal: "title_similarity",
      score: input.titleSimilarity,
      weight: 0.55,
      detail: "完全/近似タイトル一致の寄与。短い公式語彙だけの一致は後段で弱める。",
    },
    {
      basis: "lexical",
      signal: "text_overlap",
      score: input.textOverlap,
      weight: 0.45,
      detail: "本文・抜粋の文字シングル重なり。全文転載判定ではなく候補生成用の軽量指標。",
      terms: input.sharedTerms.slice(0, 8),
    },
    {
      basis: "narrative",
      signal: "shared_named_or_policy_terms",
      score: clamp01(input.namedTermScore * 0.6 + input.policyScore * 0.4),
      weight: 0.54,
      detail: "共有固有名詞/政策語の寄与。汎用スローガンは低く重み付けする。",
      terms: input.sharedPolicyTerms.slice(0, 8),
    },
    {
      basis: "narrative",
      signal: "policy_to_military_bridge",
      score: input.militaryBridgeScore,
      weight: 0.3,
      detail: "人民日報側の政策・治理語彙が、解放軍報側の軍事・訓練語彙へ接続される度合い。",
      terms: input.sharedMilitaryTerms.slice(0, 8),
    },
    {
      basis: "narrative",
      signal: "slogan_overlap_discounted",
      score: input.sloganScore,
      weight: 0.16,
      detail: "共有スローガンの寄与。中国公式スローガンだけで同一トピックと見なさないため割引済み。",
      terms: input.sharedSloganTerms.slice(0, 8),
    },
    {
      basis: "metadata",
      signal: "date_and_page_prominence",
      score: input.metadataScore,
      weight: 0.18,
      detail: "発行日の近さと版面重要度。一面・要聞に近いほど候補として少し強く扱う。",
    },
  ];

  return reasons.filter((reason) => reason.score > 0);
}

function classifyMatchType(input: {
  confidence: number;
  lexicalSimilarity: number;
  narrativeSimilarity: number;
  metadataScore: number;
  sharedTerms: string[];
  sharedPolicyTerms: string[];
  sharedSloganTerms: string[];
  militaryBridgeScore: number;
  textOverlap: number;
  titleSimilarity: number;
}): ArticleMatchType {
  const hasMeaningfulSharedTerm = input.sharedTerms.some((term) => !isGenericOfficialTerm(term));
  const hasPolicyOverlap = input.sharedPolicyTerms.length > 0;
  const hasSloganOverlap = input.sharedSloganTerms.length > 0;
  const isCloseInTime = input.metadataScore >= 0.55;

  if (
    isCloseInTime &&
    (input.titleSimilarity >= 0.76 || input.textOverlap >= 0.34) &&
    hasMeaningfulSharedTerm
  ) {
    return "same_event";
  }

  if (input.militaryBridgeScore >= 0.46 && (hasPolicyOverlap || hasMeaningfulSharedTerm)) {
    return "policy_to_military";
  }

  if (
    hasSloganOverlap &&
    input.lexicalSimilarity < 0.42 &&
    input.narrativeSimilarity >= 0.18 &&
    input.textOverlap < 0.2
  ) {
    return "same_slogan_different_case";
  }

  if (hasPolicyOverlap && input.narrativeSimilarity >= 0.24) {
    return "same_policy";
  }

  return "uncertain";
}

function buildArticleSignals(article: MatchableArticle): ArticleSignals {
  const explicitTerms = new Set<string>();
  const narrativeTerms = new Set<string>();
  const militaryTerms = new Set<string>();
  const policyTerms = new Set<string>();
  const sloganTerms = new Set<string>();

  for (const term of [...(article.keywords ?? []), ...(article.extraction?.keywords ?? [])]) {
    addTerm(explicitTerms, term);
  }

  for (const entity of [...(article.entities ?? []), ...(article.extraction?.entities ?? [])]) {
    if ((entity.confidence ?? 1) >= 0.55) {
      addTerm(explicitTerms, entity.text);
    }
  }

  for (const term of extractLikelyTerms(article)) {
    addTerm(explicitTerms, term);
  }

  for (const narrativeProfile of [article.narrativeProfile, article.extraction?.narrativeProfile]) {
    if (!narrativeProfile) {
      continue;
    }

    for (const term of [
      narrativeProfile.coreFrame,
      ...(narrativeProfile.mainActors ?? []),
      ...(narrativeProfile.beneficiaries ?? []),
      ...(narrativeProfile.problemTerms ?? []),
      ...(narrativeProfile.solutionTerms ?? []),
      ...(narrativeProfile.authoritySources ?? []),
      ...(narrativeProfile.actionVerbs ?? []),
    ]) {
      addTerm(narrativeTerms, term);
    }
  }

  for (const term of [...explicitTerms, ...narrativeTerms]) {
    if (containsAny(term, MILITARY_CUES)) {
      militaryTerms.add(term);
    }

    if (containsAny(term, POLICY_CUES)) {
      policyTerms.add(term);
    }

    if (containsAny(term, SLOGAN_CUES) || isGenericOfficialTerm(term)) {
      sloganTerms.add(term);
    }
  }

  return {
    explicitTerms,
    narrativeTerms,
    militaryTerms,
    policyTerms,
    sloganTerms,
    textShingles: makeShingles(articleText(article), 3),
    titleShingles: makeShingles(articleTitle(article), 2),
  };
}

function extractLikelyTerms(article: MatchableArticle): string[] {
  const text = [
    articleTitle(article),
    article.subtitle,
    article.extraction?.subtitle,
    article.excerpt,
    article.extraction?.excerpt,
    article.summary,
    article.extraction?.summary,
    article.analysisText,
    article.extraction?.analysisText,
  ]
    .filter(isPresentString)
    .join(" ")
    .slice(0, 3_000);
  const anchorTerms = extractSpecificAnchorTerms(text);
  const matches = text.match(/[\u3400-\u9fffA-Za-z0-9]{2,18}/g) ?? [];

  return Array.from(
    new Set([
      ...anchorTerms,
      ...matches
        .map((term) => normalizeTerm(term))
        .filter((term) => term.length >= 2)
        .filter((term) => containsAny(term, [...MILITARY_CUES, ...POLICY_CUES, ...SLOGAN_CUES])),
    ]),
  ).slice(0, 36);
}

function extractSpecificAnchorTerms(text: string): string[] {
  const normalized = normalizeTerm(text.replace(/[—－]/g, "-"));
  const terms: string[] = [];
  const addIf = (term: string, pattern: RegExp) => {
    if (pattern.test(normalized)) {
      terms.push(term);
    }
  };

  addIf("粮食安全保障法", /粮食安全保障法/);
  addIf("粮食安全保障法执法检查", /粮食安全保障法.{0,18}执法检查|执法检查.{0,18}粮食安全保障法/);
  addIf("中美经贸磋商", /中美.{0,8}经贸磋商|美中.{0,8}经贸磋商/);
  addIf("中国-加州经贸论坛", /中国-加州经贸论坛|中国.{0,4}加州.{0,4}经贸论坛/);
  addIf("中美关系", /中美.{0,4}关系|美中.{0,4}关系/);
  addIf("中美经贸关系", /中美.{0,6}经贸关系|美中.{0,6}经贸关系/);
  addIf("中美民间交往", /中美.{0,10}民间交往|美中.{0,10}民间交往/);
  addIf("正确相处之道", /正确相处之道/);
  addIf("特朗普国事访问", /特朗普.{0,40}国事访问|国事访问.{0,40}特朗普/);
  addIf("树立和践行正确政绩观", /树立和践行正确政绩观|正确政绩观/);
  addIf("形式主义基层减负", /形式主义.{0,14}基层减负|基层减负.{0,14}形式主义/);

  const eventLikeMatches =
    normalized.match(
      /[\u3400-\u9fffA-Za-z0-9-]{2,24}(?:法|执法检查|经贸磋商|经贸论坛|论坛|会议|会晤|会见|国事访问|访问|发布会|行动计划|专项行动|研讨会|联谊赛|工程|清单|制度)/g,
    ) ?? [];

  return [...terms, ...eventLikeMatches]
    .map((term) => normalizeTerm(term))
    .filter((term) => term.length >= 4 && term.length <= 24)
    .filter((term) => !isGenericOfficialTerm(term));
}

function titleScore(leftTitle: string, rightTitle: string): number {
  const left = normalizeComparableText(leftTitle);
  const right = normalizeComparableText(rightTitle);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.84;
  }

  return jaccard(makeShingles(leftTitle, 2), makeShingles(rightTitle, 2));
}

function policyToMilitaryScore(peopleSignals: ArticleSignals, plaSignals: ArticleSignals): number {
  const peoplePolicyStrength = normalizedSetStrength(peopleSignals.policyTerms);
  const plaMilitaryStrength = normalizedSetStrength(plaSignals.militaryTerms);
  const sharedPolicyStrength = sharedTermScore(
    intersection(peopleSignals.policyTerms, plaSignals.policyTerms),
  );
  const sharedExplicitStrength = sharedTermScore(
    intersection(peopleSignals.explicitTerms, plaSignals.explicitTerms),
  );

  return clamp01(
    peoplePolicyStrength * 0.25 +
      plaMilitaryStrength * 0.28 +
      sharedPolicyStrength * 0.25 +
      sharedExplicitStrength * 0.22,
  );
}

function metadataMatchScore(left: MatchableArticle, right: MatchableArticle): number {
  const dateScore = dateProximityScore(articleDate(left), articleDate(right));
  const prominenceScore = (pageProminenceScore(left) + pageProminenceScore(right)) / 2;

  return clamp01(dateScore * 0.72 + prominenceScore * 0.28);
}

function dateProximityScore(leftDate?: string, rightDate?: string): number {
  if (!leftDate || !rightDate) {
    return 0.5;
  }

  const left = Date.parse(leftDate);
  const right = Date.parse(rightDate);

  if (Number.isNaN(left) || Number.isNaN(right)) {
    return 0.5;
  }

  const days = Math.abs(left - right) / 86_400_000;

  if (days <= 0.5) {
    return 1;
  }

  if (days <= 1) {
    return 0.9;
  }

  if (days <= 3) {
    return 0.75;
  }

  if (days <= 7) {
    return 0.52;
  }

  if (days <= 14) {
    return 0.26;
  }

  return 0.08;
}

function pageProminenceScore(article: MatchableArticle): number {
  const pageNumber = pageNumberOrFallback(article);

  if (pageNumber === Number.MAX_SAFE_INTEGER) {
    return 0.45;
  }

  if (pageNumber === 1) {
    return 1;
  }

  if (pageNumber <= 3) {
    return 0.8;
  }

  if (pageNumber <= 7) {
    return 0.56;
  }

  return 0.34;
}

function pageNumberOrFallback(article: MatchableArticle): number {
  return (
    article.pageNumber ??
    parsePageNumber(article.page) ??
    article.extraction?.pageNumber ??
    parsePageNumber(article.extraction?.page) ??
    Number.MAX_SAFE_INTEGER
  );
}

function articleDate(article: MatchableArticle): string | undefined {
  return (
    article.issueDate ??
    article.date ??
    article.publishedAt ??
    article.extraction?.issueDate ??
    article.extraction?.date ??
    article.extraction?.publishedAt
  );
}

function parsePageNumber(page?: number | string): number | undefined {
  if (typeof page === "number") {
    return page;
  }

  if (typeof page !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(page, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function articleText(article: MatchableArticle): string {
  return [
    articleTitle(article),
    article.subtitle,
    article.extraction?.subtitle,
    article.excerpt,
    article.extraction?.excerpt,
    article.summary,
    article.extraction?.summary,
    article.body,
    article.bodyText,
    article.analysisText,
    article.content,
    article.text,
    article.extraction?.body,
    article.extraction?.bodyText,
    article.extraction?.analysisText,
    article.extraction?.content,
    article.extraction?.text,
  ]
    .filter(isPresentString)
    .join(" ");
}

function articleKey(article: MatchableArticle): string {
  return (
    article.id ??
    article.sourceArticleId ??
    article.extraction?.sourceArticleId ??
    article.url ??
    `${articleTitle(article)}:${articleDate(article) ?? "unknown-date"}`
  );
}

function articleTitle(article: MatchableArticle): string {
  return article.title ?? article.headline ?? article.extraction?.title ?? article.extraction?.headline ?? "";
}

function addTerm(target: Set<string>, term: string | undefined): void {
  if (!term) {
    return;
  }

  const normalized = normalizeTerm(term);

  if (normalized.length >= 2 && normalized.length <= 24) {
    target.add(normalized);
  }
}

function normalizeTerm(term: string): string {
  return term.replace(/\s+/g, "").replace(/[，。、“”‘’《》（）()［］\[\]：:；;,.!?！？]/g, "");
}

function normalizeComparableText(text: string): string {
  return normalizeTerm(text).toLowerCase();
}

function makeShingles(text: string, size: number): Set<string> {
  const normalized = normalizeComparableText(text);
  const shingles = new Set<string>();

  if (normalized.length <= size) {
    if (normalized) {
      shingles.add(normalized);
    }

    return shingles;
  }

  for (let index = 0; index <= normalized.length - size; index += 1) {
    shingles.add(normalized.slice(index, index + size));
  }

  return shingles;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 0;
  }

  const shared = intersection(left, right).length;
  const unionSize = new Set([...left, ...right]).size;

  return unionSize === 0 ? 0 : shared / unionSize;
}

function intersection(left: Set<string>, right: Set<string>): string[] {
  const shared: string[] = [];

  for (const item of left) {
    if (right.has(item)) {
      shared.push(item);
    }
  }

  return shared;
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((item) => !right.has(item)).sort(sortTermsByUsefulness);
}

function weightedSharedTerms(terms: string[]): string[] {
  return Array.from(new Set(terms)).sort(sortTermsByUsefulness).slice(0, 12);
}

function sharedTermScore(terms: string[]): number {
  const weighted = terms.reduce((score, term) => score + termWeight(term), 0);
  return clamp01(weighted / 5);
}

function normalizedSetStrength(terms: Set<string>): number {
  const weighted = [...terms].reduce((score, term) => score + termWeight(term), 0);
  return clamp01(weighted / 6);
}

function termWeight(term: string): number {
  if (isGenericOfficialTerm(term)) {
    return 0.35;
  }

  if (containsAny(term, MILITARY_CUES) || containsAny(term, POLICY_CUES)) {
    return 1.2;
  }

  return Math.min(1, Math.max(0.45, term.length / 6));
}

function sortTermsByUsefulness(left: string, right: string): number {
  return termWeight(right) - termWeight(left) || right.length - left.length || left.localeCompare(right);
}

function containsAny(text: string, cues: readonly string[]): boolean {
  return cues.some((cue) => text.includes(cue));
}

function isGenericOfficialTerm(term: string): boolean {
  return GENERIC_OFFICIAL_TERMS.has(term);
}

function isPresentString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
