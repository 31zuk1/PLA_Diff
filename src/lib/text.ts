const htmlEntityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }

    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }

    return htmlEntityMap[entity] ?? match;
  });
}

export function normalizeWhitespace(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(value: string) {
  return normalizeWhitespace(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

export function extractParagraphText(html: string) {
  const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => stripHtml(match[1] ?? ""))
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return normalizeWhitespace(paragraphs.join(" "));
  }

  return stripHtml(html);
}

export function createExcerpt(text: string, maxChars = 240) {
  const normalized = normalizeWhitespace(text);

  if (!normalized) {
    return "";
  }

  if (normalized.length < 72) {
    return "短文記事のため、全文相当の引用は表示しません。";
  }

  const snippetChars = Math.min(
    Math.max(1, maxChars - 1),
    Math.max(48, Math.floor(normalized.length * 0.72)),
  );

  return `${normalized.slice(0, snippetChars).trim()}…`;
}

export function extractBetween(value: string, start: string, end: string) {
  const startIndex = value.indexOf(start);

  if (startIndex === -1) {
    return undefined;
  }

  const contentStart = startIndex + start.length;
  const endIndex = value.indexOf(end, contentStart);

  if (endIndex === -1) {
    return undefined;
  }

  return value.slice(contentStart, endIndex);
}
