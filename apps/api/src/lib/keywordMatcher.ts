/**
 * Keyword matching for Instagram comment auto-reply rules.
 */

export function matchesKeyword(
  commentText: string,
  keyword: string,
  matchType: "partial" | "whole_word"
): boolean {
  if (!keyword.trim()) return false;
  const text = commentText.toLowerCase();
  const kw = keyword.trim().toLowerCase();

  if (matchType === "whole_word") {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, "u").test(text);
  }

  return text.includes(kw);
}
