import { ID, Timestamps } from "./common.types";
import { TaskActor } from "./task.types";
import { AIProvider } from "./settings.types";

export type AIGenerationStatus = "succeeded" | "failed";

/**
 * One AI Studio generation call — the "AI Activity" audit trail. Only
 * the prompt/metadata live here; large results aren't Firestore-sized,
 * so this stores the generated text directly (short-form) while any
 * future binary output (image/video) would go through Storage and be
 * referenced by URL here instead, same pattern as ProjectFile.url.
 */
export interface AIGeneration extends Timestamps {
  id: ID;
  workspaceId: ID;
  projectId: ID | null;
  requestedBy: TaskActor;
  provider: AIProvider;
  model: string;
  prompt: string;
  status: AIGenerationStatus;
  resultText: string | null;
  errorMessage: string | null;
}
