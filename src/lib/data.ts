import { articles, topicClusters } from "@/data/mockData";
import type { Article, Source, TopicCluster } from "@/types";

export function getTopicById(id: string) {
  return topicClusters.find((topic) => topic.id === id);
}

export function getArticleById(id: string) {
  return articles.find((article) => article.id === id);
}

export function getArticlesByIds(ids: string[]) {
  return ids
    .map((id) => getArticleById(id))
    .filter((article): article is Article => Boolean(article));
}

export function getArticlesForTopic(topic: TopicCluster) {
  return {
    people: getArticlesByIds(topic.peopleArticleIds),
    pla: getArticlesByIds(topic.plaArticleIds),
  };
}

export function getTopicKeywords(topic: TopicCluster, source: Source) {
  const ids = source === "people_daily" ? topic.peopleArticleIds : topic.plaArticleIds;

  return unique(
    getArticlesByIds(ids).flatMap((article) => [
      ...article.keywords,
      ...article.narrativeProfile.problemTerms,
      ...article.narrativeProfile.solutionTerms,
    ]),
  ).slice(0, 7);
}

export function summarizeSide(articlesForSide: Article[]) {
  return {
    frames: unique(articlesForSide.map((article) => article.narrativeProfile.coreFrame)),
    actors: unique(articlesForSide.flatMap((article) => article.narrativeProfile.mainActors)),
    beneficiaries: unique(
      articlesForSide.flatMap((article) => article.narrativeProfile.beneficiaries),
    ),
    problems: unique(articlesForSide.flatMap((article) => article.narrativeProfile.problemTerms)),
    solutions: unique(articlesForSide.flatMap((article) => article.narrativeProfile.solutionTerms)),
    authorities: unique(
      articlesForSide.flatMap((article) => article.narrativeProfile.authoritySources),
    ),
  };
}

export function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}
