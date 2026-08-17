import "server-only";

/**
 * Minimal client for NVIDIA's NIM API (build.nvidia.com) — an
 * OpenAI-compatible chat-completions endpoint, so no extra SDK
 * dependency is needed (matches the existing "server-only fetch, no
 * new package" approach — the Gemini path is the only place an SDK
 * was already a dependency before this). Server-only: never imported
 * by a client component, same guard as secretCrypto.ts.
 *
 * Endpoint verified reachable directly (curl, bypassing this app) —
 * https://integrate.api.nvidia.com/v1/chat/completions responds in
 * ~0.2s even to a bad key with a real 401, so it's not obsolete and
 * not the source of a hang for auth failures.
 *
 * IMPORTANT correctness fix: the AbortController's timeout must stay
 * armed until the response BODY is fully read, not just until
 * fetch() resolves. fetch() resolves as soon as headers arrive —
 * for a real generation call, NVIDIA can send headers quickly and
 * then take a long time to finish streaming/assembling the body
 * while the model is still computing. The previous version cleared
 * the timeout right after fetch() resolved, so response.text() had
 * ZERO timeout protection — exactly the gap that could make a slow
 * body read hang past the intended 30s ceiling with no error at all.
 */

const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;

export class NvidiaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface NvidiaChoice {
  message?: { content?: string };
  delta?: { content?: string };
}

/**
 * Defensive fallback: this request always sends `stream: false`, but
 * if NVIDIA ever streams anyway (a model-specific quirk, or a future
 * API change), naively calling response.json() on an SSE body would
 * throw a confusing parse error instead of a useful one. Parses the
 * standard OpenAI-compatible "data: {...}\n\ndata: [DONE]" format.
 */
function parseSseText(raw: string): string {
  let text = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const choice: NvidiaChoice | undefined = JSON.parse(payload)?.choices?.[0];
      text += choice?.delta?.content ?? choice?.message?.content ?? "";
    } catch {
      // Not a JSON data line — skip rather than fail the whole response over one bad chunk.
    }
  }
  return text;
}

export async function generateNvidiaText(params: {
  apiKey: string;
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { apiKey, model, prompt, temperature, maxTokens } = params;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  console.log("[nvidiaClient] request started", { provider: "nvidia", model, maxTokens: maxTokens ?? 2048 });

  try {
    let response: Response;
    try {
      response = await fetch(NVIDIA_CHAT_URL, {
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
        signal: controller.signal,
      });
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      console.error("[nvidiaClient] request failed before headers arrived", {
        provider: "nvidia",
        model,
        elapsedMs,
        errorType: isTimeout ? "timeout" : err instanceof Error ? err.name : "unknown",
      });
      if (isTimeout) {
        throw new NvidiaApiError(`NVIDIA didn't send a response within ${REQUEST_TIMEOUT_MS / 1000}s.`, 408);
      }
      throw new NvidiaApiError(err instanceof Error ? err.message : "Network error contacting NVIDIA.", 0);
    }

    const headersElapsedMs = Date.now() - startedAt;
    const contentType = response.headers.get("content-type") ?? "";
    const transferEncoding = response.headers.get("transfer-encoding") ?? "";
    const contentLength = response.headers.get("content-length") ?? "";
    console.log("[nvidiaClient] headers received", {
      provider: "nvidia",
      model,
      status: response.status,
      headersElapsedMs,
      contentType,
      transferEncoding,
      contentLength,
    });

    let rawBody: string;
    try {
      // Still under the SAME abort signal/timeout — a slow or stalled
      // body (the actual failure mode this was missing before) now
      // aborts and throws instead of hanging past REQUEST_TIMEOUT_MS.
      rawBody = await response.text();
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      console.error("[nvidiaClient] request failed while reading response body", {
        provider: "nvidia",
        model,
        status: response.status,
        elapsedMs,
        errorType: isTimeout ? "timeout" : err instanceof Error ? err.name : "unknown",
      });
      if (isTimeout) {
        throw new NvidiaApiError(
          `NVIDIA sent a response but the body never finished arriving within ${REQUEST_TIMEOUT_MS / 1000}s.`,
          408
        );
      }
      throw new NvidiaApiError(err instanceof Error ? err.message : "Network error reading NVIDIA's response.", 0);
    }

    const elapsedMs = Date.now() - startedAt;
    console.log("[nvidiaClient] request completed", { provider: "nvidia", model, status: response.status, elapsedMs, bodyLength: rawBody.length });

    if (!response.ok) {
      let message = `NVIDIA API request failed (${response.status}).`;
      try {
        const data = JSON.parse(rawBody);
        message = data?.error?.message || data?.detail || data?.title || message;
      } catch {
        // Non-JSON error body — keep the generic message.
      }
      console.error("[nvidiaClient] non-OK response", { provider: "nvidia", model, status: response.status, elapsedMs, errorType: "http_error", bodyPreview: rawBody.slice(0, 200) });
      throw new NvidiaApiError(message, response.status);
    }

    let text: string | undefined;
    if (contentType.includes("text/event-stream")) {
      console.warn("[nvidiaClient] received a streaming response despite stream:false — parsing as SSE", { provider: "nvidia", model });
      text = parseSseText(rawBody);
    } else {
      try {
        text = JSON.parse(rawBody)?.choices?.[0]?.message?.content;
      } catch {
        console.error("[nvidiaClient] failed to parse response body", {
          provider: "nvidia",
          model,
          elapsedMs,
          errorType: "parse_error",
          bodyPreview: rawBody.slice(0, 200),
        });
        throw new NvidiaApiError("Couldn't parse NVIDIA's response.", 502);
      }
    }

    if (typeof text !== "string" || !text) {
      console.error("[nvidiaClient] empty response text", { provider: "nvidia", model, elapsedMs, bodyPreview: rawBody.slice(0, 200) });
      throw new NvidiaApiError("The model returned an empty response.", 502);
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}
