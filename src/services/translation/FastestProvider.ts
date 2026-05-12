import type { TranslateInput, TranslatorProvider } from "./TranslatorProvider";

interface FastestProviderOptions {
  providers: TranslatorProvider[];
}

export class FastestProvider implements TranslatorProvider {
  readonly name: string;

  constructor(private readonly options: FastestProviderOptions) {
    this.name = `Fastest (${options.providers.map((provider) => provider.name).join(" / ")})`;
  }

  async translate(input: TranslateInput): Promise<string> {
    const failures: string[] = [];
    const attempts = this.options.providers.map((provider) =>
      provider.translate(input).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${provider.name}: ${message}`);
        throw error;
      }),
    );

    try {
      return await Promise.any(attempts);
    } catch {
      throw new Error(`All fast providers failed. ${failures.join("; ")}`);
    }
  }

  async translateBatch(inputs: TranslateInput[]): Promise<string[]> {
    const batchProvider = this.options.providers.find((provider) => provider.translateBatch);
    if (batchProvider?.translateBatch) {
      return batchProvider.translateBatch(inputs);
    }

    return Promise.all(inputs.map((input) => this.translate(input)));
  }
}
