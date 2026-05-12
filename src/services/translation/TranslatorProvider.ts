import type { TranslationLanguage } from "../detectLanguageDirection";

export interface TranslateInput {
  text: string;
  source: TranslationLanguage | "auto";
  target: TranslationLanguage;
  format: "text" | "markdown";
}

export interface TranslatorProvider {
  readonly name: string;
  translate(input: TranslateInput): Promise<string>;
  translateBatch?(inputs: TranslateInput[]): Promise<string[]>;
}
