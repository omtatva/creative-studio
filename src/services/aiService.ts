import { doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { aiUsageLogsCol } from "@/lib/firebase/firestore";
import { logActivity } from "@/services/activityService";
import { getWorkspaceAIConfig } from "@/services/aiConfigService";
import { toDateSafe } from "@/lib/utils/date";
import { AIGeneration } from "@/types/ai.types";
import { AISettings } from "@/types/settings.types";
import { TaskActor } from "@/types/task.types";
import { Workspace } from "@/types/workspace.types";

interface RunGenerationArgs {
  workspaceId: string;
  projectId: string | null;
  requestedBy: TaskActor;
  aiSettings: AISettings;
  prompt: string;
  /** Needed to check the plan's monthly AI limit — see checkWorkspaceAIUsage. */
  workspace: Workspace;
}

interface RunGenerationResult {
  text: string;
}

/** Thrown with a message that's already safe to show the user directly (set by the API route). */
export class AIGenerationError extends Error {}

/**
 * How many generations this workspace has made so far this calendar
 * month, checked against its plan's maxAIRequestsPerMonth before any
 * expensive Gemini call is made. No billing exists yet — this is the
 * clean enforcement point a future upgrade/paywall flow hooks into;
 * for now it just stops usage past the plan's own stated limit
 * (Infinity for enterprise, so this is a no-op there).
 *
 * Scales by fetching every usage-log doc for the workspace and
 * filtering client-side rather than an indexed range query — fine at
 * current volumes; revisit (composite index, or an atomic monthly
 * counter field) once a workspace's generation history actually grows
 * large enough for that to matter.
 */
export async function checkWorkspaceAIUsage(workspace: Workspace): Promise<{ allowed: boolean; reason: string | null; used: number; limit: number }> {
  const limit = workspace.limits.maxAIRequestsPerMonth;
  if (!Number.isFinite(limit)) {
    return { allowed: true, reason: null, used: 0, limit };
  }

  const q = query(aiUsageLogsCol(), where("workspaceId", "==", workspace.id));
  const snapshot = await getDocs(q);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const used = snapshot.docs.filter((d) => toDateSafe(d.data().createdAt) >= startOfMonth).length;

  if (used >= limit) {
    return {
      allowed: false,
      reason: `This workspace has reached its plan's monthly AI generation limit (${limit}). Contact your workspace owner about upgrading.`,
      used,
      limit,
    };
  }
  return { allowed: true, reason: null, used, limit };
}

/**
 * Calls the server-side generation proxy (src/app/api/ai-studio/generate)
 * — the Gemini API key never leaves the server; this client only sends
 * generation parameters (and, if the workspace has configured its own
 * key, that key's ENCRYPTED ciphertext blob — never plaintext) to it.
 * Logs every attempt to ai_usage_logs regardless of outcome (the "AI
 * Activity" trail needs failed attempts too), and logs successes to
 * the workspace's general activity_logs too, so a completed generation
 * shows up in Recent Activity like any other real workspace event.
 */
export async function runGeneration({ workspaceId, projectId, requestedBy, aiSettings, prompt, workspace }: RunGenerationArgs): Promise<RunGenerationResult> {
  const usage = await checkWorkspaceAIUsage(workspace);
  if (!usage.allowed) {
    throw new AIGenerationError(usage.reason ?? "Monthly AI generation limit reached.");
  }

  const logRef = doc(aiUsageLogsCol());
  const baseLog: Omit<AIGeneration, "createdAt" | "updatedAt" | "status" | "resultText" | "errorMessage"> = {
    id: logRef.id,
    workspaceId,
    projectId,
    requestedBy,
    provider: aiSettings.provider,
    model: aiSettings.defaultModel,
    prompt,
  };

  try {
    // Ollama has no key at all — skip the ai_config lookup entirely for it.
    const workspaceConfig =
      aiSettings.provider === "ollama" ? null : await getWorkspaceAIConfig(workspaceId, aiSettings.provider).catch(() => null);

    // A client-side ceiling independent of the server's own per-provider
    // timeout (see nvidiaClient.ts) — belt and suspenders, so "Generate"
    // can never spin forever even if something upstream of that timeout
    // misbehaves (e.g. the response itself never completes streaming
    // back to the browser).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);
    let response: Response;
    try {
      response = await fetch("/api/ai-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiSettings.provider,
          model: aiSettings.defaultModel,
          temperature: aiSettings.temperature,
          maxTokens: aiSettings.maxTokens,
          prompt,
          ollamaBaseUrl: aiSettings.provider === "ollama" ? aiSettings.ollamaBaseUrl : undefined,
          workspaceKey: workspaceConfig
            ? { ciphertext: workspaceConfig.ciphertext, iv: workspaceConfig.iv, authTag: workspaceConfig.authTag }
            : undefined,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json();

    if (!response.ok) {
      const message = typeof data?.error === "string" ? data.error : "Generation failed.";
      await writeLog(logRef, baseLog, { status: "failed", resultText: null, errorMessage: message });
      throw new AIGenerationError(message);
    }

    await writeLog(logRef, baseLog, { status: "succeeded", resultText: data.text, errorMessage: null });
    await logActivity(workspaceId, {
      actorId: requestedBy.uid,
      actorName: requestedBy.displayName,
      action: "generated an AI response",
      targetType: "ai_generation",
      targetId: logRef.id,
    }).catch((err) => console.error("[aiService] logActivity failed (generation still succeeded):", err));

    return { text: data.text as string };
  } catch (err) {
    if (err instanceof AIGenerationError) throw err;
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const message = isTimeout
      ? "The request took too long and was cancelled. Try again."
      : err instanceof Error
        ? err.message
        : "Could not reach the generation service.";
    await writeLog(logRef, baseLog, { status: "failed", resultText: null, errorMessage: message });
    throw new AIGenerationError(message);
  }
}

async function writeLog(
  logRef: ReturnType<typeof doc>,
  base: Omit<AIGeneration, "createdAt" | "updatedAt" | "status" | "resultText" | "errorMessage">,
  outcome: Pick<AIGeneration, "status" | "resultText" | "errorMessage">
): Promise<void> {
  await setDoc(logRef, {
    ...base,
    ...outcome,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
