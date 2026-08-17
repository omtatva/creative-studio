import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { decryptSecret } from "@/lib/server/secretCrypto";
import { generateNvidiaText, NvidiaApiError } from "@/lib/server/nvidiaClient";

export const runtime = "nodejs";

interface TestRequestBody {
  provider?: "gemini" | "nvidia" | "ollama";
  ciphertext?: string;
  iv?: string;
  authTag?: string;
  /** Ollama only — a local server URL, not a secret, so no encryption is involved for this provider. */
  baseUrl?: string;
  model?: string;
}

/**
 * For Gemini/NVIDIA: decrypts the workspace's stored key server-side
 * and makes a REAL, minimal call to actually verify it works — this
 * never reports "Connected" just because a key is present. The
 * decrypted key exists only in this request's memory and is never
 * included in the response, success or failure.
 *
 * For Ollama: there is no key to decrypt — it checks that the given
 * local server URL actually responds, with no auth involved at all.
 */
export async function POST(request: NextRequest) {
  let body: TestRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.provider === "ollama") {
    const baseUrl = (body.baseUrl || "http://localhost:11434").replace(/\/+$/, "");
    try {
      const response = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
      if (!response.ok) {
        return NextResponse.json({ error: `Connection failed: Ollama responded with ${response.status}.` }, { status: 502 });
      }
      const data = await response.json().catch(() => ({}));
      const models: string[] = Array.isArray(data?.models) ? data.models.map((m: { name?: string }) => m.name) : [];

      if (body.model && models.length > 0 && !models.some((m) => m === body.model || m.startsWith(`${body.model}:`))) {
        return NextResponse.json(
          { error: `Connected to Ollama, but model "${body.model}" isn't pulled yet. Run: ollama pull ${body.model}` },
          { status: 502 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (err) {
      console.error("[settings/ai-key/test] Ollama call failed:", err);
      return NextResponse.json(
        { error: `Couldn't reach Ollama at ${baseUrl}. Make sure "ollama serve" is running on this machine.` },
        { status: 502 }
      );
    }
  }

  if (!body.ciphertext || !body.iv || !body.authTag) {
    return NextResponse.json({ error: "No API key configured for this workspace yet." }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret({ ciphertext: body.ciphertext, iv: body.iv, authTag: body.authTag });
  } catch (err) {
    console.error("[settings/ai-key/test] decryption failed:", err);
    return NextResponse.json({ error: "Couldn't read the stored key. It may need to be re-entered." }, { status: 500 });
  }

  const provider = body.provider === "nvidia" ? "nvidia" : "gemini";

  if (provider === "nvidia") {
    try {
      const text = await generateNvidiaText({
        apiKey,
        model: "meta/llama-3.1-8b-instruct",
        prompt: "Reply with the single word: OK",
        temperature: 0,
        maxTokens: 5,
      });
      if (!text) {
        return NextResponse.json({ error: "Connection failed: the model returned an empty response." }, { status: 502 });
      }
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error("[settings/ai-key/test] NVIDIA call failed:", err);
      const status = err instanceof NvidiaApiError ? err.status : 502;
      const message = err instanceof Error ? err.message : "Unknown error";

      let friendlyMessage = `Connection failed: ${message}`;
      if (status === 401 || status === 403) {
        friendlyMessage = "Connection failed: this API key was rejected by NVIDIA. Double-check it and try again.";
      } else if (status === 429) {
        friendlyMessage = "Connection failed: rate limited. Try again in a moment.";
      } else if (status === 404) {
        friendlyMessage = "Connection failed: the test model isn't available for this key.";
      }
      return NextResponse.json({ error: friendlyMessage }, { status: 502 });
    }
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
      generationConfig: { maxOutputTokens: 5, temperature: 0 },
    });
    const text = result.response.text();

    if (!text) {
      return NextResponse.json({ error: "Connection failed: the model returned an empty response." }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[settings/ai-key/test] Gemini call failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";

    let friendlyMessage = `Connection failed: ${message}`;
    if (message.includes("API key not valid") || message.includes("API_KEY_INVALID")) {
      friendlyMessage = "Connection failed: this API key was rejected by Google. Double-check it and try again.";
    } else if (message.includes("PERMISSION_DENIED")) {
      friendlyMessage = "Connection failed: this key doesn't have permission to use the Gemini API.";
    } else if (message.includes("RESOURCE_EXHAUSTED") || message.includes("quota")) {
      friendlyMessage = "Connection failed: this key's quota has been exceeded.";
    } else if (message.includes("429")) {
      friendlyMessage = "Connection failed: rate limited. Try again in a moment.";
    }

    return NextResponse.json({ error: friendlyMessage }, { status: 502 });
  }
}
