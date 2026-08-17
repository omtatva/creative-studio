import "server-only";

/**
 * Minimal client for NVIDIA's NIM API (build.nvidia.com) — an
 * OpenAI-compatible chat-completions endpoint, so no extra SDK
 * dependency is needed (matches the existing "server-only fetch, no
 * new package" approach — the Gemini path is the only place an SDK
 * was already a dependency before this). Server-only: never imported
 * by a client component, same guard as secretCrypto.ts.
 */

const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export class NvidiaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function generateNvidiaText(params: {
  apiKey: string;
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { apiKey, model, prompt, temperature, maxTokens } = params;

  const response = await fetch(NVIDIA_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: typeof temperature === "number" ? temperature : 0.7,
      max_tokens: typeof maxTokens === "number" ? maxTokens : 2048,
      stream: false,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || data?.detail || `NVIDIA API request failed (${response.status}).`;
    throw new NvidiaApiError(message, response.status);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) {
    throw new NvidiaApiError("The model returned an empty response.", 502);
  }
  return text;
}
