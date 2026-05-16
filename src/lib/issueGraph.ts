import type {
  ArticleMatchGroup,
  NewspaperIssue,
  ScrapedArticle,
} from "@/components/IssueComparisonTypes";
import type { DailyIssueSnapshot, SnapshotIndexEntry } from "./dailySnapshot";

export type IssueGraphSource = "people_daily" | "pla_daily";
export type IssueGraphNodeId = `${IssueGraphSource}:${string}`;
export type IssueGraphLinkId = `${IssueGraphNodeId}->${IssueGraphNodeId}`;

export interface IssueGraphInput {
  issueDate?: string;
  peopleIssue?: NewspaperIssue;
  plaIssue?: NewspaperIssue;
  matchGroups?: readonly ArticleMatchGroup[];
}

export interface IssueGraphNode {
  id: IssueGraphNodeId;
  articleId: string;
  source: IssueGraphSource;
  issueDate: string;
  pageNumber: number;
  pageName?: string;
  title: string;
  subtitle?: string;
  author?: string;
  excerpt: string;
  url?: string;
  groupIds: string[];
  matchedGroupIds: string[];
  degree: number;
  matchedDegree: number;
  linkWeight: number;
  isIsolated: boolean;
  isolated: boolean;
}

export interface IssueGraphLink {
  id: IssueGraphLinkId;
  source: IssueGraphNodeId;
  target: IssueGraphNodeId;
  peopleNodeId: IssueGraphNodeId;
  plaNodeId: IssueGraphNodeId;
  peopleArticleId: string;
  plaArticleId: string;
  issueDate: string;
  confidence: number;
  confidenceMin: number;
  confidenceMax: number;
  weight: number;
  groupIds: string[];
  reason: string;
  reasons: string[];
  sharedTerms: string[];
  relationScope: "group_expanded";
}

export interface IssueGraphCounts {
  nodes: number;
  links: number;
  peopleNodes: number;
  plaNodes: number;
  matchedNodes: number;
  isolatedNodes: number;
  matchedGroups: number;
}

export type IssueGraphMetrics = IssueGraphCounts;

export interface IssueGraph {
  issueDate: string;
  nodes: IssueGraphNode[];
  links: IssueGraphLink[];
  counts: IssueGraphCounts;
}

export type IssueGraphData = IssueGraph;

export type IssueGraphDateEntry = Pick<
  SnapshotIndexEntry,
  | "issueDate"
  | "matchedGroups"
  | "peopleArticles"
  | "plaArticles"
  | "judgeEnabled"
  | "judgeModel"
  | "status"
  | "graphMetrics"
>;

interface LinkDraft extends Omit<
  IssueGraphLink,
  "confidence" | "groupIds" | "reason" | "reasons" | "sharedTerms"
> {
  confidenceTotal: number;
  groupIds: Set<string>;
  reasons: Set<string>;
  sharedTerms: Set<string>;
}

export function buildIssueGraph(snapshot: DailyIssueSnapshot): IssueGraphData;
export function buildIssueGraph(input: IssueGraphInput): IssueGraphData;
export function buildIssueGraph(input: DailyIssueSnapshot | IssueGraphInput): IssueGraphData {
  const nodeMap = new Map<IssueGraphNodeId, IssueGraphNode>();
  const linkMap = new Map<IssueGraphLinkId, LinkDraft>();
  const weightedDegrees = new Map<IssueGraphNodeId, number>();
  const matchedNeighbors = new Map<IssueGraphNodeId, Set<IssueGraphNodeId>>();
  const issueDate = resolveIssueDate(input);
  const matchGroups = input.matchGroups ?? [];

  for (const article of issueArticles(input.peopleIssue)) {
    addNode(nodeMap, article);
  }

  for (const article of issueArticles(input.plaIssue)) {
    addNode(nodeMap, article);
  }

  for (const group of matchGroups) {
    const groupPeopleArticles = groupArticlesBySource(group, "people_daily", nodeMap);
    const groupPlaArticles = groupArticlesBySource(group, "pla_daily", nodeMap);
    const peopleNodes = uniqueNodes(
      groupPeopleArticles.map((article) => addNode(nodeMap, article)),
    );
    const plaNodes = uniqueNodes(groupPlaArticles.map((article) => addNode(nodeMap, article)));
    const isMatchedGroup = isGraphMatchedGroup(group);

    for (const node of [...peopleNodes, ...plaNodes]) {
      addUnique(node.groupIds, group.id);

      if (isMatchedGroup) {
        addUnique(node.matchedGroupIds, group.id);
      }
    }

    if (!isMatchedGroup) {
      continue;
    }

    for (const peopleNode of peopleNodes) {
      for (const plaNode of plaNodes) {
        addMatchedLink(linkMap, peopleNode, plaNode, group);
      }
    }
  }

  const links = [...linkMap.values()].map((link) => {
    const reasons = [...link.reasons];

    return {
      id: link.id,
      source: link.source,
      target: link.target,
      peopleNodeId: link.peopleNodeId,
      plaNodeId: link.plaNodeId,
      peopleArticleId: link.peopleArticleId,
      plaArticleId: link.plaArticleId,
      issueDate: link.issueDate,
      confidence: link.weight > 0 ? link.confidenceTotal / link.weight : 0,
      confidenceMin: link.confidenceMin,
      confidenceMax: link.confidenceMax,
      weight: link.weight,
      groupIds: [...link.groupIds],
      reason: reasons.join(" / "),
      reasons,
      sharedTerms: [...link.sharedTerms],
      relationScope: link.relationScope,
    };
  });

  for (const link of links) {
    incrementDegree(weightedDegrees, link.peopleNodeId, link.weight);
    incrementDegree(weightedDegrees, link.plaNodeId, link.weight);
    addNeighbor(matchedNeighbors, link.peopleNodeId, link.plaNodeId);
    addNeighbor(matchedNeighbors, link.plaNodeId, link.peopleNodeId);
  }

  const nodes = [...nodeMap.values()]
    .map((node) => {
      const degree = weightedDegrees.get(node.id) ?? 0;
      const matchedDegree = matchedNeighbors.get(node.id)?.size ?? 0;
      const isIsolated = matchedDegree === 0;

      return {
        ...node,
        degree,
        matchedDegree,
        linkWeight: degree,
        isIsolated,
        isolated: isIsolated,
      };
    })
    .sort(compareGraphNodes);

  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const sortedLinks = links.sort((left, right) => compareGraphLinks(left, right, nodeOrder));

  return {
    issueDate,
    nodes,
    links: sortedLinks,
    counts: {
      nodes: nodes.length,
      links: sortedLinks.length,
      peopleNodes: nodes.filter((node) => node.source === "people_daily").length,
      plaNodes: nodes.filter((node) => node.source === "pla_daily").length,
      matchedNodes: nodes.filter((node) => !node.isIsolated).length,
      isolatedNodes: nodes.filter((node) => node.isIsolated).length,
      matchedGroups: matchGroups.filter(isGraphMatchedGroup).length,
    },
  };
}

export function buildIssueGraphMetrics(
  input: DailyIssueSnapshot | IssueGraphInput,
): IssueGraphMetrics {
  return buildIssueGraph(input).counts;
}

export function isIssueGraphMetrics(value: unknown): value is IssueGraphMetrics {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Record<keyof IssueGraphMetrics, unknown>>;
  return [
    candidate.nodes,
    candidate.links,
    candidate.peopleNodes,
    candidate.plaNodes,
    candidate.matchedNodes,
    candidate.isolatedNodes,
    candidate.matchedGroups,
  ].every((metric) => typeof metric === "number" && Number.isFinite(metric));
}

export function issueGraphNodeId(
  source: IssueGraphSource,
  articleId: string,
): IssueGraphNodeId {
  return `${source}:${articleId}` as IssueGraphNodeId;
}

export function issueGraphLinkId(
  peopleNodeId: IssueGraphNodeId,
  plaNodeId: IssueGraphNodeId,
): IssueGraphLinkId {
  return `${peopleNodeId}->${plaNodeId}` as IssueGraphLinkId;
}

function issueArticles(issue: NewspaperIssue | undefined): ScrapedArticle[] {
  return issue?.pages.flatMap((page) => page.articles) ?? [];
}

function addNode(
  nodeMap: Map<IssueGraphNodeId, IssueGraphNode>,
  article: ScrapedArticle,
): IssueGraphNode {
  const id = issueGraphNodeId(article.source, article.id);
  const existing = nodeMap.get(id);

  if (existing) {
    return existing;
  }

  const node: IssueGraphNode = {
    id,
    articleId: article.id,
    source: article.source,
    issueDate: article.issueDate,
    pageNumber: article.pageNumber,
    pageName: article.pageName,
    title: article.title,
    subtitle: article.subtitle,
    author: article.author,
    excerpt: article.excerpt,
    url: article.url,
    groupIds: [],
    matchedGroupIds: [],
    degree: 0,
    matchedDegree: 0,
    linkWeight: 0,
    isIsolated: true,
    isolated: true,
  };

  nodeMap.set(id, node);
  return node;
}

function uniqueNodes(nodes: IssueGraphNode[]): IssueGraphNode[] {
  const seen = new Set<IssueGraphNodeId>();
  const unique: IssueGraphNode[] = [];

  for (const node of nodes) {
    if (seen.has(node.id)) {
      continue;
    }

    seen.add(node.id);
    unique.push(node);
  }

  return unique;
}

function addMatchedLink(
  linkMap: Map<IssueGraphLinkId, LinkDraft>,
  peopleNode: IssueGraphNode,
  plaNode: IssueGraphNode,
  group: ArticleMatchGroup,
) {
  const id = issueGraphLinkId(peopleNode.id, plaNode.id);
  const confidence = finiteNumber(group.confidence);
  const existing = linkMap.get(id);

  if (existing) {
    existing.weight += 1;
    existing.confidenceTotal += confidence;
    existing.confidenceMin = Math.min(existing.confidenceMin, confidence);
    existing.confidenceMax = Math.max(existing.confidenceMax, confidence);
    addGroupEvidence(existing, group);
    return;
  }

  const link: LinkDraft = {
    id,
    source: peopleNode.id,
    target: plaNode.id,
    peopleNodeId: peopleNode.id,
    plaNodeId: plaNode.id,
    peopleArticleId: peopleNode.articleId,
    plaArticleId: plaNode.articleId,
    issueDate: group.issueDate,
    confidenceMin: confidence,
    confidenceMax: confidence,
    confidenceTotal: confidence,
    weight: 1,
    groupIds: new Set<string>(),
    reasons: new Set<string>(),
    sharedTerms: new Set<string>(),
    relationScope: "group_expanded",
  };

  addGroupEvidence(link, group);
  linkMap.set(id, link);
}

function addGroupEvidence(link: LinkDraft, group: ArticleMatchGroup) {
  link.groupIds.add(group.id);

  if (typeof group.reason === "string" && group.reason.trim()) {
    link.reasons.add(group.reason);
  }

  for (const term of group.lexicalContrast?.sharedTerms ?? []) {
    link.sharedTerms.add(term);
  }
}

function groupArticlesBySource(
  group: ArticleMatchGroup,
  source: IssueGraphSource,
  nodeMap: Map<IssueGraphNodeId, IssueGraphNode>,
): ScrapedArticle[] {
  const articles =
    source === "people_daily" ? group.peopleArticles : group.plaArticles;

  if (Array.isArray(articles)) {
    return articles;
  }

  const legacyGroup = group as unknown as {
    peopleArticleIds?: string[];
    plaArticleIds?: string[];
  };
  const legacyIds =
    source === "people_daily" ? legacyGroup.peopleArticleIds : legacyGroup.plaArticleIds;

  if (!Array.isArray(legacyIds)) {
    return [];
  }

  return legacyIds
    .map((articleId) => nodeMap.get(issueGraphNodeId(source, articleId)))
    .filter((node): node is IssueGraphNode => Boolean(node))
    .map(nodeToArticle);
}

function isGraphMatchedGroup(group: ArticleMatchGroup): boolean {
  return [
    "matched",
    "same_event",
    "same_policy",
    "policy_to_military",
    "same_slogan_different_case",
    "syndicated_or_reprint",
  ].includes(group.matchType);
}

function nodeToArticle(node: IssueGraphNode): ScrapedArticle {
  return {
    id: node.articleId,
    source: node.source,
    issueDate: node.issueDate,
    pageNumber: node.pageNumber,
    pageName: node.pageName,
    title: node.title,
    subtitle: node.subtitle,
    author: node.author,
    excerpt: node.excerpt,
    url: node.url,
  };
}

function incrementDegree(
  degrees: Map<IssueGraphNodeId, number>,
  nodeId: IssueGraphNodeId,
  weight: number,
) {
  degrees.set(nodeId, (degrees.get(nodeId) ?? 0) + weight);
}

function addNeighbor(
  neighbors: Map<IssueGraphNodeId, Set<IssueGraphNodeId>>,
  nodeId: IssueGraphNodeId,
  neighborId: IssueGraphNodeId,
) {
  const current = neighbors.get(nodeId);

  if (current) {
    current.add(neighborId);
    return;
  }

  neighbors.set(nodeId, new Set([neighborId]));
}

function addUnique(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function resolveIssueDate(input: DailyIssueSnapshot | IssueGraphInput): string {
  return (
    input.issueDate ??
    input.peopleIssue?.issueDate ??
    input.plaIssue?.issueDate ??
    input.matchGroups?.[0]?.issueDate ??
    "unknown-date"
  );
}

function compareGraphNodes(left: IssueGraphNode, right: IssueGraphNode): number {
  return (
    sourceRank(left.source) - sourceRank(right.source) ||
    left.pageNumber - right.pageNumber ||
    left.title.localeCompare(right.title, "zh-Hans") ||
    left.articleId.localeCompare(right.articleId)
  );
}

function compareGraphLinks(
  left: IssueGraphLink,
  right: IssueGraphLink,
  nodeOrder: Map<IssueGraphNodeId, number>,
): number {
  return (
    (nodeOrder.get(left.peopleNodeId) ?? 0) - (nodeOrder.get(right.peopleNodeId) ?? 0) ||
    (nodeOrder.get(left.plaNodeId) ?? 0) - (nodeOrder.get(right.plaNodeId) ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

function sourceRank(source: IssueGraphSource): number {
  return source === "people_daily" ? 0 : 1;
}
