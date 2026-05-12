import { preserveOuterWhitespace } from "../../utils/html";
import type { TranslateInput, TranslatorProvider } from "./TranslatorProvider";

interface DeepLFreeProviderOptions {
  timeoutMs: number;
}

interface DeepLFreeResponse {
  result?: {
    texts?: Array<{
      text?: string;
    }>;
  };
  error?: {
    message?: string;
  };
}

export class DeepLFreeProvider implements TranslatorProvider {
  readonly name = "DeepL Free";

  constructor(private readonly options: DeepLFreeProviderOptions) {}

  async translate(input: TranslateInput): Promise<string> {
    const text = input.text.trim();
    if (!text) {
      return input.text;
    }

    const randomId = getRandomNumber();
    const body = {
      jsonrpc: "2.0",
      method: "LMT_handle_texts",
      params: {
        splitting: "newlines",
        lang: {
          source_lang_user_selected: toDeepLSourceLanguage(input.source),
          target_lang: toDeepLLanguage(input.target),
        },
        texts: [{ text, requestAlternatives: 3 }],
        timestamp: getTimestamp(getICount(text)),
      },
      id: randomId,
    };

    let bodyText = JSON.stringify(body);
    if ((randomId + 5) % 29 === 0 || (randomId + 3) % 13 === 0) {
      bodyText = bodyText.replace('"method":"', '"method" : "');
    } else {
      bodyText = bodyText.replace('"method":"', '"method": "');
    }

    const response = await fetchWithTimeout(
      new URL("https://www2.deepl.com/jsonrpc"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: bodyText,
      },
      this.options.timeoutMs,
    );
    const data = (await response.json()) as DeepLFreeResponse;

    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `DeepL Free request failed: ${response.status}`);
    }

    const translatedText = data.result?.texts?.[0]?.text;
    if (!translatedText) {
      throw new Error("DeepL Free returned an empty translation.");
    }

    return preserveOuterWhitespace(input.text, translatedText);
  }
}

function toDeepLSourceLanguage(language: TranslateInput["source"]): string {
  if (language === "auto") {
    return "auto";
  }

  return toDeepLLanguage(language);
}

function toDeepLLanguage(language: TranslateInput["target"]): string {
  if (language === "zh") {
    return "ZH";
  }

  return "EN";
}

function getTimestamp(iCount: number): number {
  const timestamp = Date.now();
  if (iCount === 0) {
    return timestamp;
  }

  const adjustedCount = iCount + 1;
  return timestamp - (timestamp % adjustedCount) + adjustedCount;
}

function getICount(text: string): number {
  return text.split("i").length - 1;
}

function getRandomNumber(): number {
  const random = Math.floor(Math.random() * 99999) + 100000;
  return random * 1000;
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
      throw new Error(`DeepL Free request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
