const IGNORABLE_PARENTHETICAL_LABELS = new Set([
  "社论",
  "短评",
  "快评",
  "评论",
  "评论员文章",
  "本报评论员",
  "权威发布",
  "图片报道",
  "导读",
  "今日谈",
  "记者手记",
  "人民论坛",
  "钟声",
  "和音",
]);

const COMMON_PUBLISHER_PREFIXES: readonly RegExp[] = [
  /^中央宣传部\s*[、,，和与及]*\s*全国总工会\s*(?=联合发布|发布|表彰|授予)/,
];

const CHINESE_NUMERAL_VALUES: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

export interface CanonicalTitleInfo {
  title: string;
  leadingYear?: string;
}

export function canonicalTitleInfoForExactMatch(value: string): CanonicalTitleInfo {
  let normalized = value
    .normalize("NFKC")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  normalized = removeIgnorableParentheticalLabels(normalized);

  const leadingYear = normalized.match(/^((?:19|20)\d{2})年/)?.[1];

  for (const prefix of COMMON_PUBLISHER_PREFIXES) {
    normalized = normalized.replace(prefix, "");
  }

  normalized = normalized
    .replace(/^(?:19|20)\d{2}年/, "")
    .replace(/第([一二两三四五六七八九十零〇]{1,4})(?=个|届|次|批|轮|期)/g, (_, value: string) => {
      const parsed = parseChineseOrdinal(value);
      return parsed === undefined ? `第${value}` : `第${parsed}`;
    })
    .replace(/[\s\-—–·・:：,，.。"'“”‘’（）()《》【】［］\[\]、<>/]/g, "")
    .trim();

  return leadingYear ? { title: normalized, leadingYear } : { title: normalized };
}

export function canonicalTitleForExactMatch(value: string) {
  return canonicalTitleInfoForExactMatch(value).title;
}

function removeIgnorableParentheticalLabels(value: string) {
  return value.replace(/[（(]([^（）()]{1,12})[）)]/g, (match, label: string) => {
    const compactLabel = label.replace(/\s+/g, "");

    return IGNORABLE_PARENTHETICAL_LABELS.has(compactLabel) ? "" : match;
  });
}

function parseChineseOrdinal(value: string) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  if (value === "十") {
    return 10;
  }

  const tenIndex = value.indexOf("十");

  if (tenIndex >= 0) {
    const left = value.slice(0, tenIndex);
    const right = value.slice(tenIndex + 1);
    const tens = left ? CHINESE_NUMERAL_VALUES[left] : 1;
    const ones = right ? CHINESE_NUMERAL_VALUES[right] : 0;

    if (tens === undefined || ones === undefined) {
      return undefined;
    }

    return tens * 10 + ones;
  }

  return CHINESE_NUMERAL_VALUES[value];
}
