export type TranslationLanguage = "zh" | "en";

export interface LanguageDirection {
  source: TranslationLanguage;
  target: TranslationLanguage;
}

export function detectLanguageDirection(text: string): LanguageDirection {
  const chineseCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinCount = (text.match(/[a-z]/gi) ?? []).length;

  if (chineseCount === 0 && latinCount === 0) {
    return { source: "en", target: "zh" };
  }

  const chineseRatio = chineseCount / Math.max(chineseCount + latinCount, 1);
  if (chineseRatio >= 0.15) {
    return { source: "zh", target: "en" };
  }

  return { source: "en", target: "zh" };
}

export function hasTranslatableText(text: string): boolean {
  return /[\u3400-\u9fffA-Za-z]/.test(text);
}
