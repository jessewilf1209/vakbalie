import type { LlmProvider, LlmStructuredRequest, LlmStructuredResult } from "./types";

/**
 * Responder die bepaalt wat de mock teruggeeft. Tests en lokale ontwikkeling
 * leveren hier een eigen (gescripte) implementatie aan.
 */
export type MockResponder = (request: LlmStructuredRequest) => unknown;

const defaultResponder: MockResponder = () => ({});

/**
 * Mock-provider voor lokale ontwikkeling en tests (mock-first).
 * Geen netwerkverkeer, geen key nodig. Token-usage wordt geschat (~4 tekens
 * per token) zodat budgetlogica ook met de mock testbaar is.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock";

  constructor(private readonly responder: MockResponder = defaultResponder) {}

  async completeStructured(request: LlmStructuredRequest): Promise<LlmStructuredResult> {
    const data = this.responder(request);

    const inputChars =
      request.system.length + request.messages.reduce((sum, m) => sum + m.content.length, 0);
    const outputChars = JSON.stringify(data)?.length ?? 0;

    return {
      data,
      usage: {
        inputTokens: Math.ceil(inputChars / 4),
        outputTokens: Math.min(Math.ceil(outputChars / 4), request.maxTokens),
      },
    };
  }
}
