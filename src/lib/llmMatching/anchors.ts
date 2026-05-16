export type TopicFamily =
  | "china_us_relations"
  | "food_security_law"
  | "correct_political_achievement"
  | "youth_day_league_activity"
  | "ai_ethics_review"
  | "shipbuilding_industry_stats";

export interface AnchorPattern {
  canonical: string;
  pattern: RegExp;
  score: number;
  headlineOnly?: boolean;
}

export const GENERIC_JUDGE_TERMS: ReadonlySet<string> = new Set([
  "习近平",
  "中国",
  "人民",
  "国家",
  "发展",
  "工作",
  "建设",
  "重要",
  "推进",
  "推动",
  "坚持",
  "全面",
  "新时代",
  "高质量发展",
  "中国式现代化",
  "共同繁荣",
  "合作共赢",
  "和平共处",
  "相互尊重",
]);

export const HIGH_VALUE_ANCHOR_PATTERNS: readonly AnchorPattern[] = [
  { canonical: "粮食安全保障法", pattern: /粮食安全保障法/g, score: 0.96 },
  { canonical: "粮食安全保障法执法检查", pattern: /粮食安全保障法.{0,12}执法检查|执法检查.{0,12}粮食安全保障法/g, score: 1 },
  { canonical: "全国人大常委会执法检查", pattern: /全国人大常委会.{0,16}执法检查/g, score: 0.88 },
  { canonical: "中美经贸磋商", pattern: /中美.{0,8}经贸磋商|美中.{0,8}经贸磋商/g, score: 1 },
  { canonical: "中国-加州经贸论坛", pattern: /中国[\-—－]加州经贸论坛|中国.{0,4}加州.{0,4}经贸论坛/g, score: 1 },
  { canonical: "中美关系", pattern: /中美.{0,4}关系|美中.{0,4}关系/g, score: 0.42 },
  { canonical: "中美经贸关系", pattern: /中美.{0,6}经贸关系|美中.{0,6}经贸关系/g, score: 0.54 },
  { canonical: "中美地方经贸交流", pattern: /中美.{0,8}地方.{0,8}经贸交流|美中.{0,8}地方.{0,8}经贸交流/g, score: 0.58 },
  { canonical: "中美民间交往", pattern: /中美.{0,10}民间交往|美中.{0,10}民间交往/g, score: 0.54 },
  { canonical: "中美人文交流", pattern: /中美.{0,10}人文交流|美中.{0,10}人文交流/g, score: 0.54 },
  { canonical: "正确相处之道", pattern: /正确相处之道/g, score: 0.54 },
  { canonical: "特朗普国事访问", pattern: /特朗普.{0,40}国事访问|国事访问.{0,40}特朗普/g, score: 0.62 },
  { canonical: "中美元首会晤", pattern: /中美.{0,8}元首会晤|美中.{0,8}元首会晤|元首会晤/g, score: 0.62 },
  { canonical: "靖国神社", pattern: /靖国神社/g, score: 0.96 },
  { canonical: "莫桑比克查波会谈", pattern: /莫桑比克.{0,24}查波.{0,12}会谈|查波.{0,24}莫桑比克.{0,12}会谈/g, score: 1 },
  { canonical: "查波会谈", pattern: /查波.{0,12}会谈|会谈.{0,12}查波/g, score: 0.94 },
  { canonical: "老挝沙伦赛会见", pattern: /老挝.{0,24}沙伦赛.{0,12}会见|沙伦赛.{0,24}老挝.{0,12}会见/g, score: 1 },
  { canonical: "沙伦赛会见", pattern: /沙伦赛.{0,12}会见|会见.{0,12}沙伦赛/g, score: 0.94 },
  { canonical: "中莫命运共同体联合声明", pattern: /中莫命运共同体.{0,10}联合声明|莫桑比克共和国.{0,24}联合声明/g, score: 0.62 },
  { canonical: "联合声明", pattern: /联合声明/g, score: 0.58 },
  { canonical: "向新向好稳中有进", pattern: /向新向好.{0,4}稳中有进/g, score: 0.92 },
  { canonical: "向新向好", pattern: /向新向好/g, score: 0.76 },
  { canonical: "稳中有进", pattern: /稳中有进/g, score: 0.76 },
  { canonical: "树立和践行正确政绩观", pattern: /树立和践行正确政绩观|正确政绩观/g, score: 0.86, headlineOnly: true },
  { canonical: "形式主义基层减负", pattern: /形式主义.{0,14}基层减负|基层减负.{0,14}形式主义/g, score: 0.8, headlineOnly: true },
  { canonical: "干事创业", pattern: /干事创业/g, score: 0.64, headlineOnly: true },
  { canonical: "五四主题团日活动", pattern: /五四主题团日活动/g, score: 0.9 },
  {
    canonical: "人工智能科技伦理审查与服务先导计划",
    pattern: /人工智能科技伦理审查与服务先导计划/g,
    score: 0.96,
  },
  {
    canonical: "造船统计发布",
    pattern: /造船.{0,16}(完工量|新接订单量|手持订单量|三大指标|同比增|全面增长)/g,
    score: 0.92,
  },
];

export const CLUSTERABLE_ANCHOR_TERMS: ReadonlySet<string> = new Set([
  "粮食安全保障法执法检查",
  "全国人大常委会执法检查",
  "中美经贸磋商",
  "中国-加州经贸论坛",
  "靖国神社",
  "莫桑比克查波会谈",
  "查波会谈",
  "老挝沙伦赛会见",
  "沙伦赛会见",
  "向新向好稳中有进",
  "五四主题团日活动",
  "人工智能科技伦理审查与服务先导计划",
  "造船统计发布",
]);

export const TOPIC_FAMILY_LABELS: Record<TopicFamily, string> = {
  china_us_relations: "中美关系议题",
  food_security_law: "粮食安全保障法议题",
  correct_political_achievement: "正确政绩观议题",
  youth_day_league_activity: "五四主题团日活动",
  ai_ethics_review: "人工智能科技伦理审查先导计划",
  shipbuilding_industry_stats: "造船统计发布",
};

export function anchorTermScore(term: string) {
  const configured = HIGH_VALUE_ANCHOR_PATTERNS.find((anchor) => anchor.canonical === term);

  if (configured) {
    return configured.score;
  }

  if (/法|执法检查|经贸磋商|经贸论坛|论坛|专项行动|正确政绩观|主题团日|科技伦理|造船统计/.test(term)) {
    return 0.78;
  }

  if (/中美|美中|特朗普|经贸|民间|人文/.test(term)) {
    return 0.48;
  }

  return 0.34;
}

export function isHighValueAnchorTerm(term: string) {
  return anchorTermScore(term) >= 0.64 && !GENERIC_JUDGE_TERMS.has(term);
}

export function isStrongShortAnchorTerm(term: string) {
  return term.length >= 4 && anchorTermScore(term) >= 0.9 && !GENERIC_JUDGE_TERMS.has(term);
}
