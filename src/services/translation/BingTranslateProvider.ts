import { preserveOuterWhitespace } from "../../utils/html";
import type { TranslateInput, TranslatorProvider } from "./TranslatorProvider";

interface BingTranslateProviderOptions {
  timeoutMs: number;
}

interface BingTranslateResponseItem {
  translations?: Array<{
    text?: string;
    to?: string;
  }>;
}

export class BingTranslateProvider implements TranslatorProvider {
  readonly name = "Bing Translator";

  private tokenPromise: Promise<string> | undefined;

  constructor(private readonly options: BingTranslateProviderOptions) {}

  async translate(input: TranslateInput): Promise<string> {
    const translated = await this.translateBatch([input]);
    return translated[0];
  }

  async translateBatch(inputs: TranslateInput[]): Promise<string[]> {
    if (inputs.length === 0) {
      return [];
    }

    const textInputs = inputs.map((input) => input.text.trim());
    if (textInputs.every((text) => !text)) {
      return inputs.map((input) => input.text);
    }

    const firstInput = inputs[0];
    assertSameLanguagePair(inputs);
    const token = await this.getToken();
    const url = new URL("https://api-edge.cognitive.microsofttranslator.com/translate");
    url.searchParams.set("api-version", "3.0");
    if (firstInput.source !== "auto") {
      url.searchParams.set("from", toBingLanguage(firstInput.source));
    }
    url.searchParams.set("to", toBingLanguage(firstInput.target));

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(inputs.map((input) => ({ Text: input.text.trim() }))),
      },
      this.options.timeoutMs,
    );
    const data = (await response.json()) as BingTranslateResponseItem[];

    if (!response.ok) {
      throw new Error(`Bing Translator request failed: ${response.status}`);
    }

    if (data.length !== inputs.length) {
      throw new Error(
        `Bing Translator returned ${data.length} translations for ${inputs.length} inputs.`,
      );
    }

    return data.map((item, index) => {
      const translatedText = item.translations?.[0]?.text;
      if (!translatedText) {
        throw new Error("Bing Translator returned an empty translation.");
      }

      return preserveOuterWhitespace(inputs[index].text, translatedText);
    });
  }

  private getToken(): Promise<string> {
    this.tokenPromise ??= fetchBingToken(this.options.timeoutMs);
    return this.tokenPromise;
  }
}

function assertSameLanguagePair(inputs: TranslateInput[]): void {
  const [firstInput] = inputs;
  const mismatchedInput = inputs.find(
    (input) => input.source !== firstInput.source || input.target !== firstInput.target,
  );

  if (mismatchedInput) {
    throw new Error("Bing Translator batch inputs must use the same language pair.");
  }
}

function toBingLanguage(language: TranslateInput["source"]): string {
  if (language === "zh") {
    return "zh-Hans";
  }

  return "en";
}

async function fetchBingToken(timeoutMs: number): Promise<string> {
  const response = await fetchWithTimeout(
    new URL("https://edge.microsoft.com/translate/auth"),
    {},
    timeoutMs,
  );
  const token = await response.text();

  if (!response.ok || !token.trim()) {
    throw new Error(`Failed to get Bing Translator token: ${response.status}`);
  }

  return token.trim();
}

async function fetchWithTimeout(
  url: URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Bing Translator request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
