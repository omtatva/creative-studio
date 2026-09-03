"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Pencil, ShieldCheck } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getCurrentUser } from "@/lib/firebase/auth";
import { useToast } from "@/hooks/useToast";
import { getWorkspaceAIConfig, saveWorkspaceAIKey, testWorkspaceAIConnection } from "@/services/aiConfigService";
import { checkWorkspaceLimit } from "@/services/planService";
import { updateWorkspaceLimit } from "@/services/workspaceService";
import { DEFAULT_AI_SETTINGS } from "@/lib/constants/settingsDefaults";
import { AISettings, AIProvider } from "@/types/settings.types";
import { WorkspaceAIConfig } from "@/types/aiConfig.types";

/** The three providers AI Studio actually knows how to call — see /api/ai-studio/generate/route.ts. */
const SUPPORTED_PROVIDERS: { id: AIProvider; label: string; requiresKey: boolean; keyPlaceholder?: string; keyHint?: string; modelHint: string }[] = [
  { id: "gemini", label: "Google Gemini", requiresKey: true, keyPlaceholder: "AIza...", keyHint: "From Google AI Studio (aistudio.google.com).", modelHint: "e.g. gemini-2.5-flash" },
  { id: "nvidia", label: "NVIDIA", requiresKey: true, keyPlaceholder: "nvapi-...", keyHint: "From build.nvidia.com — an NVIDIA NIM API key.", modelHint: "e.g. meta/llama-3.1-8b-instruct" },
  { id: "ollama", label: "Ollama (Free, local)", requiresKey: false, modelHint: "e.g. llama3.2 — must be pulled first: ollama pull llama3.2" },
];

/**
 * Each provider's key is encrypted server-side (AES-256-GCM, key never
 * leaves the server — see src/lib/server/secretCrypto.ts) before it's
 * ever written to Firestore, and this page only ever displays a masked
 * suffix, never the real value. A workspace can configure a key for
 * BOTH providers at once; `draft.provider` (below) picks which one
 * AI Studio actually calls. If the selected provider has no workspace
 * key configured, generation falls back to the matching server env var
 * (GEMINI_API_KEY / NVIDIA_API_KEY — see /api/ai-studio/generate).
 */
export default function AISettingsPage() {
  const { settings, isLoading, isSaving, save } = useWorkspaceSettings();
  const { workspace, workspaceId } = useWorkspaceContext();
  const { canManageWorkspace } = useCurrentMemberRole();
  const toast = useToast();
  const [draft, setDraft] = useState<AISettings>(DEFAULT_AI_SETTINGS);

  // Real per-workspace plan limit (see planService.ts / PlanUsageSection) —
  // the monthly cap actually enforced before AI Studio lets a generation
  // through, distinct from the generation DEFAULTS (model/temperature/
  // tokens) configured further down this page.
  const [planLimit, setPlanLimit] = useState<{ used: number; limit: number } | null>(null);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [limitUnlimited, setLimitUnlimited] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    checkWorkspaceLimit(workspace, "aiGenerations")
      .then((r) => setPlanLimit({ used: r.used, limit: r.limit }))
      .catch((err) => console.error("[settings/ai] failed to load plan limit:", err));
  }, [workspace]);

  function startEditingLimit() {
    if (!planLimit) return;
    const unlimited = !Number.isFinite(planLimit.limit);
    setLimitUnlimited(unlimited);
    setLimitDraft(unlimited ? "" : String(planLimit.limit));
    setIsEditingLimit(true);
  }

  async function saveLimit() {
    if (!workspace) return;
    const nextLimit = limitUnlimited ? Infinity : Number(limitDraft);
    if (!limitUnlimited && (!Number.isFinite(nextLimit) || nextLimit < 1)) {
      toast.error("Enter a number of 1 or more, or choose Unlimited.");
      return;
    }
    setIsSavingLimit(true);
    try {
      await updateWorkspaceLimit(workspace.id, "maxAIRequestsPerMonth", nextLimit);
      setPlanLimit((prev) => (prev ? { ...prev, limit: nextLimit } : prev));
      toast.success("AI generations limit updated");
      setIsEditingLimit(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the limit");
    } finally {
      setIsSavingLimit(false);
    }
  }
  // Tracks which workspace `draft` was last seeded from Firestore for.
  // Without this guard, the sync effect below re-runs on EVERY
  // `settings` snapshot — including ones triggered by a totally
  // unrelated field saving elsewhere (another Settings tab, another
  // teammate) — which would silently overwrite an unsaved provider
  // click back to whatever's still persisted, making the buttons look
  // broken. Seeding once per workspace (then only re-seeding if the
  // workspace itself changes) is what makes local clicks stick.
  const seededForWorkspaceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!settings || !workspaceId) return;
    if (seededForWorkspaceRef.current === workspaceId) return;
    // Spread defaults first: workspaces whose `settings.ai` doc predates a
    // newly-added field (e.g. ollamaBaseUrl) would otherwise carry that
    // field as undefined into the form instead of its real default.
    setDraft({ ...DEFAULT_AI_SETTINGS, ...settings.ai });
    seededForWorkspaceRef.current = workspaceId;
  }, [settings, workspaceId]);

  async function handleSave() {
    try {
      await save({ ai: draft });
      toast.success("AI settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    }
  }

  const activeProviderMeta = SUPPORTED_PROVIDERS.find((p) => p.id === draft.provider) ?? SUPPORTED_PROVIDERS[0]!;

  if (isLoading) return <Loader label="Loading AI settings..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">AI Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">Generation preferences for AI Studio.</p>
      </div>

      <SettingsSection
        title="Usage limit"
        description="The real monthly cap enforced before a generation is allowed — see Settings > Workspace for every other plan limit."
      >
        {!planLimit ? (
          <p className="text-xs text-foreground-muted">Loading...</p>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-foreground-muted">
                AI generations this month
                {canManageWorkspace && !isEditingLimit && (
                  <button
                    onClick={startEditingLimit}
                    className="rounded-theme p-0.5 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                    aria-label="Edit AI generations limit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </span>
              <span className="text-foreground-muted">
                {planLimit.used} / {Number.isFinite(planLimit.limit) ? planLimit.limit : "Unlimited"}
              </span>
            </div>

            {isEditingLimit && (
              <div className="mt-2 flex flex-col gap-2 rounded-theme border border-border bg-surface-muted/60 p-2.5">
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <input type="checkbox" checked={limitUnlimited} onChange={(e) => setLimitUnlimited(e.target.checked)} className="accent-primary" />
                  Unlimited generations
                </label>
                {!limitUnlimited && (
                  <input
                    type="number"
                    min={1}
                    value={limitDraft}
                    onChange={(e) => setLimitDraft(e.target.value)}
                    placeholder="Max generations per month"
                    className="h-8 w-full rounded-theme border border-border bg-surface px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                )}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsEditingLimit(false)} disabled={isSavingLimit}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveLimit} isLoading={isSavingLimit}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Provider" description="Which provider AI Studio calls when a member generates something.">
        <div className="flex flex-col gap-2 sm:flex-row">
          {SUPPORTED_PROVIDERS.map((p) => {
            const isActive = draft.provider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!canManageWorkspace}
                onClick={() => canManageWorkspace && setDraft({ ...draft, provider: p.id })}
                className={
                  "flex flex-1 items-center justify-between gap-2 rounded-theme border px-3 py-2.5 text-left transition-colors " +
                  (isActive ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-muted") +
                  (!canManageWorkspace ? " cursor-default" : "")
                }
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {isActive && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
        {canManageWorkspace && draft.provider !== (settings?.ai?.provider ?? DEFAULT_AI_SETTINGS.provider) && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-theme border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs text-foreground-muted">Provider changed — save to apply it to AI Studio.</span>
            <Button size="sm" onClick={handleSave} isLoading={isSaving}>Save</Button>
          </div>
        )}
      </SettingsSection>

      {/* Only the SELECTED provider's config renders — switching providers visibly swaps this whole section, not just a small pill highlight. A workspace's key for a provider it's not currently using stays saved in Firestore either way (see aiConfigService.ts), it's just not shown here until that provider is selected again. */}
      {activeProviderMeta.requiresKey ? (
        <ProviderApiKeySection
          key={activeProviderMeta.id}
          provider={activeProviderMeta.id}
          label={activeProviderMeta.label}
          keyPlaceholder={activeProviderMeta.keyPlaceholder!}
          keyHint={activeProviderMeta.keyHint!}
          workspaceId={workspaceId}
          canManageWorkspace={canManageWorkspace}
        />
      ) : (
        <OllamaConfigSection key={activeProviderMeta.id} draft={draft} setDraft={setDraft} canManageWorkspace={canManageWorkspace} />
      )}

      <SettingsSection
        title="Generation defaults"
        action={<Button size="sm" onClick={handleSave} isLoading={isSaving}>Save changes</Button>}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Default model"
            value={draft.defaultModel}
            onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
            hint={activeProviderMeta.modelHint}
          />
          <Input
            label="Temperature"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={draft.temperature}
            onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
          />
          <Input
            label="Max output tokens"
            type="number"
            min={1}
            value={draft.maxTokens}
            onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })}
          />
        </div>
      </SettingsSection>
    </div>
  );
}

interface ProviderApiKeySectionProps {
  provider: AIProvider;
  label: string;
  keyPlaceholder: string;
  keyHint: string;
  workspaceId: string | null;
  canManageWorkspace: boolean;
}

/** One provider's key config card — reused for Gemini and NVIDIA. Only ever mounted for whichever provider is currently selected — see the "Provider" section above. */
function ProviderApiKeySection({ provider, label, keyPlaceholder, keyHint, workspaceId, canManageWorkspace }: ProviderApiKeySectionProps) {
  const { firebaseUser, profile } = useAuthContext();
  const toast = useToast();
  const [keyConfig, setKeyConfig] = useState<WorkspaceAIConfig | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setKeyConfig(null);
      setIsLoadingKey(false);
      return;
    }
    setIsLoadingKey(true);
    getWorkspaceAIConfig(workspaceId, provider)
      .then(setKeyConfig)
      .catch((err) => console.error(`[settings/ai] failed to load ${provider} key config:`, err))
      .finally(() => setIsLoadingKey(false));
  }, [workspaceId, provider]);

  async function handleSaveKey() {
    if (!workspaceId || !firebaseUser) return;
    setIsSavingKey(true);
    setTestResult(null);
    try {
      const actor = {
        uid: firebaseUser.uid,
        displayName: profile?.displayName ?? firebaseUser.displayName ?? "Unknown",
        photoURL: profile?.photoURL ?? firebaseUser.photoURL ?? null,
        email: profile?.email ?? firebaseUser.email ?? "",
      };
      await saveWorkspaceAIKey(workspaceId, provider, keyInput, actor);
      const refreshed = await getWorkspaceAIConfig(workspaceId, provider);
      setKeyConfig(refreshed);
      setKeyInput("");
      toast.success(`${label} API key saved securely`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the API key");
    } finally {
      setIsSavingKey(false);
    }
  }

  async function handleTestConnection() {
    if (!workspaceId) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const { ok, error } = await testWorkspaceAIConnection(workspaceId, provider);
      setTestResult(ok ? { ok: true, message: "Connected successfully" } : { ok: false, message: error ?? "Connection failed" });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <SettingsSection title={`${label} API key`} description="Used by AI Studio while this provider is selected above.">
      {isLoadingKey ? (
        <Loader label="Loading..." />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 rounded-theme border border-border bg-surface px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <KeyRound className="h-4 w-4 text-foreground-muted" />
              {keyConfig ? `Workspace key •••••••• ${keyConfig.keySuffix}` : "No workspace key configured"}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                (keyConfig ? "bg-success/10 text-success" : "bg-surface-muted text-foreground-muted")
              }
            >
              {keyConfig ? "Connected" : "Not Connected"}
            </span>
          </div>

          {keyConfig && <p className="text-xs text-foreground-muted">Last updated by {keyConfig.updatedByName}.</p>}

          {canManageWorkspace ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Input
                  label={keyConfig ? "Replace API key" : "API key"}
                  type="password"
                  placeholder={keyPlaceholder}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  hint={keyHint}
                  className="flex-1"
                />
                <div className="flex gap-2">
                  <Button onClick={handleSaveKey} isLoading={isSavingKey} disabled={!keyInput.trim()}>
                    {keyConfig ? "Update API Key" : "Save API Key"}
                  </Button>
                  <Button variant="outline" onClick={handleTestConnection} isLoading={isTesting} disabled={!keyConfig}>
                    Test Connection
                  </Button>
                </div>
              </div>

              {testResult && (
                <div
                  className={
                    "flex items-start gap-2 rounded-theme border px-3 py-2.5 text-sm " +
                    (testResult.ok ? "border-success/30 bg-success/5 text-success" : "border-error/30 bg-error/5 text-error")
                  }
                >
                  {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="flex items-start gap-2 text-xs text-foreground-muted">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Encrypted before it&apos;s stored and never displayed again after saving. If no workspace key is set, generation
                  falls back to the server&apos;s own configuration for this provider.
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2 text-xs text-foreground-muted">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Only workspace owners and admins can view or change this key.</span>
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

interface OllamaConfigSectionProps {
  draft: AISettings;
  setDraft: (next: AISettings) => void;
  canManageWorkspace: boolean;
}

/**
 * Ollama has no API key at all — it's a server you run yourself
 * (ollama.com), free, with no account or cloud key. This card is just
 * the server URL (not a secret, so it's saved in plain settings/{id}
 * rather than going through the encrypted ai_config flow the other
 * providers use) plus a real "Test Connection" that hits that server.
 * Only ever mounted while Ollama is the selected provider.
 */
function OllamaConfigSection({ draft, setDraft, canManageWorkspace }: OllamaConfigSectionProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    try {
      // Server now requires sign-in (see the route's SECURITY doc
      // comment — it previously had none at all).
      const idToken = await getCurrentUser()?.getIdToken();
      const response = await fetch("/api/settings/ai-key/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ provider: "ollama", baseUrl: draft.ollamaBaseUrl, model: draft.defaultModel }),
      });
      const data = await response.json().catch(() => ({}));
      setTestResult(
        response.ok
          ? { ok: true, message: "Connected — Ollama is running and reachable." }
          : { ok: false, message: typeof data?.error === "string" ? data.error : "Connection failed." }
      );
    } catch {
      setTestResult({ ok: false, message: "Couldn't reach the test endpoint." });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <SettingsSection title="Ollama" action={<Badge variant="success">Free — no API key</Badge>}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 text-xs text-foreground-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Ollama runs entirely on your own machine — nothing is sent to any external API or stored in Firestore.
            Install it from <span className="font-medium text-foreground">ollama.com</span>, run{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 text-foreground">ollama pull llama3.2</code> (or any
            model you want), then make sure <code className="rounded bg-surface-muted px-1 py-0.5 text-foreground">ollama serve</code> is
            running before generating.
          </span>
        </div>

        {canManageWorkspace ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                label="Server URL"
                placeholder="http://localhost:11434"
                value={draft.ollamaBaseUrl}
                onChange={(e) => setDraft({ ...draft, ollamaBaseUrl: e.target.value })}
                hint="Default when running Ollama locally on this machine."
                className="flex-1"
              />
              <Button variant="outline" onClick={handleTestConnection} isLoading={isTesting}>
                Test Connection
              </Button>
            </div>

            {testResult && (
              <div
                className={
                  "flex items-start gap-2 rounded-theme border px-3 py-2.5 text-sm " +
                  (testResult.ok ? "border-success/30 bg-success/5 text-success" : "border-error/30 bg-error/5 text-error")
                }
              >
                {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-foreground-muted">Only workspace owners and admins can change the server URL.</p>
        )}
      </div>
    </SettingsSection>
  );
}
