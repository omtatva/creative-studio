import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { decryptSecret, type EncryptedSecret } from "@/lib/server/secretCrypto";
import { generateNvidiaText, NvidiaApiError } from "@/lib/server/nvidiaClient";

export const runtime = "nodejs";

interface GenerateRequestBody {
  provider?: "gemini" | "nvidia" | "ollama";
  model?: string;
  temperature?: number;
  maxTokens?: number;
  prompt: string;
  /** Ciphertext blob for the calling workspace's own key for the selected provider, if one is configured — see aiConfigService.ts. Never plaintext. Not used for Ollama, which has no key. */
  workspaceKey?: EncryptedSecret;
  /** Ollama only — a local server URL, not a secret. */
  ollamaBaseUrl?: string;
}

const DEFAULT_MODEL_BY_PROVIDER = {
  gemini: "gemini-2.5-flash",
  nvidia: "meta/llama-3.1-8b-instruct",
  ollama: "llama3.2",
} as const;

/**
 * Server-side AI generation proxy — Gemini, NVIDIA (NIM), and Ollama.
 *
 * Gemini/NVIDIA key resolution priority:
 *   1. The calling workspace's own encrypted key (Settings > AI),
 *      decrypted here with the server-only SETTINGS_ENCRYPTION_KEY.
 *   2. The server's GEMINI_API_KEY / NVIDIA_API_KEY env var, as a
 *      shared fallback.
 * Either way, the actual key is read/decrypted ONLY here — it is
 * never sent by the client in plaintext, never stored in Firestore in
 * plaintext, and never appears in any React component or client
 * bundle.
 *
 * Ollama has no key at all — it's a free, local server (ollama.com)
 * this route calls directly at the workspace's configured URL
 * (default http://localhost:11434). Nothing about it is a secret.
 */
export async function POST(request: NextRequest) {
  let body: GenerateRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { model, temperature, maxTokens, prompt } = body;
  const provider = body.provider === "nvidia" ? "nvidia" : body.provider === "ollama" ? "ollama" : "gemini";

  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const resolvedModel = model || DEFAULT_MODEL_BY_PROVIDER[provider];

  if (provider === "ollama") {
    const baseUrl = (body.ollamaBaseUrl || "http://localhost:11434").replace(/\/+$/, "");
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: resolvedModel,
          prompt,
          stream: false,
          options: { temperature: typeof temperature === "number" ? temperature : 0.7 },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const message = errData?.error || `Ollama responded with ${response.status}.`;
        const status = /model .* not found/i.test(message) ? 404 : response.status;
        return NextResponse.json(
          {
            error:
              status === 404
                ? `Model "${resolvedModel}" isn't pulled yet. Run: ollama pull ${resolvedModel}`
                : `Ollama generation failed: ${message}`,
          },
          { status: 502 }
        );
      }

      const data = await response.json();
      const text = data?.response;
      if (typeof text !== "string" || !text) {
        return NextResponse.json({ error: "Ollama returned an empty response. Try rephrasing your prompt." }, { status: 502 });
      }
      return NextResponse.json({ text });
    } catch (err) {
      console.error("[ai-studio/generate] Ollama call failed:", err);
      return NextResponse.json(
        {
          error: `Couldn't reach Ollama at ${baseUrl}. Make sure "ollama serve" is running on this machine and try again.`,
        },
        { status: 503 }
      );
    }
  }

  let apiKey: string | null = null;
  let keySource: "workspace" | "env" | null = null;

  if (body.workspaceKey?.ciphertext) {
    try {
      apiKey = decryptSecret(body.workspaceKey);
      keySource = "workspace";
    } catch (err) {
      console.error("[ai-studio/generate] failed to decrypt workspace key:", err);
      return NextResponse.json(
        { error: "This workspace's AI API key couldn't be read. Ask an admin to re-enter it in Settings > AI." },
        { status: 500 }
      );
    }
  }

  if (!apiKey) {
    apiKey = (provider === "nvidia" ? process.env.NVIDIA_API_KEY : process.env.GEMINI_API_KEY) ?? null;
    keySource = apiKey ? "env" : null;
  }

  const providerLabel = provider === "nvidia" ? "an NVIDIA" : "a Gemini";

  if (!apiKey) {
    console.error(`[ai-studio/generate] no ${provider} key available (no workspace key, env var not set).`);
    return NextResponse.json(
      { error: `AI Studio isn't configured yet. Ask a workspace owner/admin to add ${providerLabel} API key in Settings > AI.` },
      { status: 503 }
    );
  }

  if (provider === "nvidia") {
    try {
      const text = await generateNvidiaText({ apiKey, model: resolvedModel, prompt, temperature, maxTokens });
      return NextResponse.json({ text });
    } catch (err) {
      const status = err instanceof NvidiaApiError ? err.status : 502;
      const message = err instanceof Error ? err.message : "Generation failed for an unknown reason.";
      console.error("[ai-studio/generate] NVIDIA call failed:", { status, message });

      // 401/403/404/429/408(timeout)/5xx all map to a distinct, useful
      // message — none of them leave the request hanging, since
      // generateNvidiaText's own AbortController guarantees this
      // catch is reached within REQUEST_TIMEOUT_MS no matter what.
      let friendlyMessage = `NVIDIA generation failed: ${message}`;
      let httpStatus = 502;
      if (status === 401) {
        httpStatus = 401;
        friendlyMessage =
          keySource === "workspace"
            ? "This workspace's NVIDIA API key was rejected. Ask an admin to update it in Settings > AI."
            : "The server's NVIDIA API key was rejected. Check NVIDIA_API_KEY in .env.local.";
      } else if (status === 403) {
        httpStatus = 403;
        friendlyMessage = "This NVIDIA API key doesn't have permission to use this model. Check its access at build.nvidia.com.";
      } else if (status === 404) {
        httpStatus = 404;
        friendlyMessage = `NVIDIA generation failed: model "${resolvedModel}" wasn't found. Check the model ID in Settings > AI.`;
      } else if (status === 429) {
        httpStatus = 429;
        friendlyMessage = "NVIDIA generation failed: rate limited. Try again in a moment.";
      } else if (status === 408) {
        httpStatus = 504;
        // Use the real thrown message here, not a generic one — it
        // already distinguishes "no headers arrived" from "headers
        // arrived but the body never finished", which is exactly the
        // diagnostic difference that matters for tracing this down.
        friendlyMessage = message;
      } else if (status >= 500) {
        httpStatus = 502;
        friendlyMessage = "NVIDIA's servers had an error generating a response. Try again in a moment.";
      }

      return NextResponse.json({ error: friendlyMessage }, { status: httpStatus });
    }
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
      model: resolvedModel,
      generationConfig: {
        temperature: typeof temperature === "number" ? temperature : 0.7,
        maxOutputTokens: typeof maxTokens === "number" ? maxTokens : 2048,
      },
    });

    const result = await genModel.generateContent(prompt);
    const text = result.response.text();

    if (!text) {
      return NextResponse.json({ error: "The model returned an empty response. Try rephrasing your prompt." }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed for an unknown reason.";
    console.error("[ai-studio/generate] Gemini call failed:", err);

    const status = message.includes("API key not valid") || message.includes("API_KEY_INVALID") ? 401 : 502;
    const friendlyMessage =
      status === 401
        ? keySource === "workspace"
          ? "This workspace's Gemini API key was rejected. Ask an admin to update it in Settings > AI."
          : "The server's Gemini API key was rejected. Check GEMINI_API_KEY in .env.local."
        : `Gemini generation failed: ${message}`;

    return NextResponse.json({ error: friendlyMessage }, { status });
  }
}
