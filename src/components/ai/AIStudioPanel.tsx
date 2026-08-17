"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { AIGenerationError, runGeneration } from "@/services/aiService";
import { DEFAULT_AI_SETTINGS } from "@/lib/constants/settingsDefaults";

const SUGGESTIONS = [
  "Draft a creative brief for a summer product launch",
  "Suggest 5 task breakdowns for a brand refresh project",
  "Write a client-facing summary of this week's progress",
];

const PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", nvidia: "NVIDIA", ollama: "Ollama" };

/**
 * Real generation via the workspace's selected provider — Gemini or
 * NVIDIA (see src/app/api/ai-studio/generate and
 * src/services/aiService.ts). The provider's key lives only in the
 * workspace's encrypted config or the server's env var — this panel
 * never reads, holds, or sends a key. If nothing is configured, the
 * API route returns a clear error that surfaces right here rather
 * than the panel pretending to know the server's config state in
 * advance.
 */
export function AIStudioPanel() {
  const { profile, firebaseUser } = useAuthContext();
  const { workspaceId, workspace } = useWorkspaceContext();
  const { settings } = useWorkspaceSettings();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const aiSettings = settings?.ai ?? DEFAULT_AI_SETTINGS;

  async function handleGenerate() {
    if (!workspaceId || !workspace || !firebaseUser || !prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const { text } = await runGeneration({
        workspaceId,
        workspace,
        projectId: null,
        requestedBy: {
          uid: firebaseUser.uid,
          displayName: profile?.displayName ?? firebaseUser.displayName ?? "Unknown",
          photoURL: profile?.photoURL ?? firebaseUser.photoURL ?? null,
          email: profile?.email ?? firebaseUser.email ?? "",
        },
        aiSettings,
        prompt,
      });
      setResult(text);
    } catch (err) {
      setError(err instanceof AIGenerationError ? err.message : "Generation failed for an unknown reason.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-gradient-to-br from-primary/10 via-surface to-secondary/10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-theme bg-primary text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">AI Studio</p>
            <p className="text-xs text-foreground-muted">
              Draft briefs, task breakdowns, and client updates with {PROVIDER_LABELS[aiSettings.provider] ?? aiSettings.provider}.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New generation</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-3">
          <Textarea
            rows={4}
            placeholder="Describe what you'd like to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setPrompt(s)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground-muted hover:bg-surface-muted"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button disabled={!prompt.trim()} isLoading={isGenerating} onClick={handleGenerate}>
              <Wand2 className="h-4 w-4" />
              Generate
            </Button>
          </div>

          {error && (
            <div className="flex items-start justify-between gap-3 rounded-theme border border-error/30 bg-error/5 px-3 py-2.5 text-sm text-error">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <Button size="sm" variant="outline" onClick={handleGenerate} isLoading={isGenerating} className="shrink-0">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}
        </div>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleGenerate} isLoading={isGenerating}>
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </div>
          </CardHeader>
          <p className="whitespace-pre-wrap text-sm text-foreground">{result}</p>
        </Card>
      )}
    </div>
  );
}
