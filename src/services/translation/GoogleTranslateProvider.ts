import { decodeHtmlEntities, preserveOuterWhitespace } from "../../utils/html";
import type { TranslateInput, TranslatorProvider } from "./TranslatorProvider";

interface GoogleTranslateProviderOptions {
  timeoutMs: number;
}

type GoogleTranslateResponse = [
  Array<[string | null | undefined, ...unknown[]]>,
  ...unknown[],
];

export class GoogleTranslateProvider implements TranslatorProvider {
  readonly name = "Google Translate";

  constructor(private readonly options: GoogleTranslateProviderOptions) {}

  async translate(input: TranslateInput): Promise<string> {
    const text = input.text.trim();
    if (!text) {
      return input.text;
    }

    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", toGoogleLanguage(input.source));
    url.searchParams.set("tl", toGoogleLanguage(input.target));
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text);

    const response = await fetchWithTimeout(url, this.options.timeoutMs);
    const data = (await response.json()) as GoogleTranslateResponse;

    if (!response.ok) {
      throw new Error(`Google Translate request failed: ${response.status}`);
    }

    const translatedText = Array.isArray(data[0])
      ? data[0].map((segment) => segment[0] ?? "").join("")
      : "";

    if (!translatedText) {
      throw new Error("Google Translate returned an empty translation.");
    }

    return preserveOuterWhitespace(input.text, decodeHtmlEntities(translatedText));
  }
}

function toGoogleLanguage(language: TranslateInput["source"]): string {
  if (language === "zh") {
    return "zh-CN";
  }

  if (language === "auto") {
    return "auto";
  }

  return "en";
}

async function fetchWithTimeout(url: URL, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Google Translate request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
