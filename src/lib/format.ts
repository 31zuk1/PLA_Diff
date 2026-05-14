import type { EvidenceClaimType, MatchType, Source } from "@/types";

export const sourceLabels: Record<Source, string> = {
  people_daily: "人民日報",
  pla_daily: "解放軍報",
};

export const sourceShortLabels: Record<Source, string> = {
  people_daily: "人民",
  pla_daily: "軍報",
};

export const matchTypeLabels: Record<MatchType, string> = {
  same_event: "同一事件",
  same_policy: "同一政策",
  policy_to_military: "政策から軍事実装",
  same_slogan_different_case: "同一スローガン・別事例",
  one_sided: "片側のみ",
  syndicated_or_reprint: "転載・同文",
};

export const evidenceClaimLabels: Record<EvidenceClaimType, string> = {
  common_ground: "Common ground / 共通基盤",
  frame_shift: "Frame shift / フレーム",
  actor_shift: "Actor shift / 主役",
  goal_shift: "Goal shift / 目標",
  threat_shift: "Threat shift / 問題設定",
  solution_shift: "Solution shift / 解決策",
  authority_shift: "Authority shift / 権威源",
  lexical_contrast: "Lexical contrast / 語彙",
  silence_map: "Silence map / 沈黙",
};

export function formatDate(date: string) {
  return date.replaceAll("-", ".");
}

export function formatDateRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} - ${formatDate(end)}`;
}

export function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

export function confidenceTone(confidence: number) {
  if (confidence >= 0.85) {
    return "高";
  }

  if (confidence >= 0.7) {
    return "中";
  }

  return "低";
}

export function pageProminence(pageNumber: number) {
  if (pageNumber === 1) {
    return { label: "一面", level: 4 };
  }

  if (pageNumber <= 3) {
    return { label: "高", level: 3 };
  }

  if (pageNumber <= 7) {
    return { label: "中", level: 2 };
  }

  return { label: "低", level: 1 };
}
