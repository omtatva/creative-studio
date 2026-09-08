import { Timestamps } from "./common.types";

/**
 * Singleton doc at platform_settings/global — GLOBAL platform
 * configuration, distinct from a workspace's own `settings/{workspaceId}`
 * doc (branding, storage counters, etc.) and from `platform_config/plans`
 * (pricing/entitlements). A workspace owner/admin can never read or write
 * this collection — see firestore.rules' `platform_settings` block.
 *
 * Deliberately holds ONLY non-secret, display-safe fields. Nothing that
 * belongs here ever needs to be hidden from a Super Admin who's looking
 * right at this doc — actual secrets (Gemini/NVIDIA keys, Gmail refresh
 * tokens, the settings-encryption key) live in environment variables /
 * per-user encrypted docs and are surfaced to the UI only as derived
 * booleans via GET /api/platform-settings/status, never as this doc's
 * own fields.
 *
 * Read: any signed-in user (needed so the maintenance-mode flag can gate
 * the whole authenticated app for everyone, not just Super Admin — see
 * useMaintenanceMode.ts). Write: admin-SDK-only, via
 * POST /api/platform-settings/update (verifySuperAdminAuth) — never a
 * direct client Firestore write, so every change can be audit-logged in
 * the same server-side step that applies it.
 */
export interface PlatformSettings extends Timestamps {
  platformName: string;
  platformUrl: string;
  supportEmail: string;
  timezone: string;
  /** Soft, frontend-enforced gate (see useMaintenanceMode.ts) — not a security boundary, an availability one. Super Admin always retains access, checked against the trusted `platformRole` field, never a client-guessable flag. */
  maintenanceMode: boolean;
  updatedBy: string | null;
}

/** The values a brand-new deployment starts with, before any Super Admin has ever saved a change — mirrors the pattern in planConfig.ts's mergePlanConfig (seed/fallback until the first real save). */
export const DEFAULT_PLATFORM_SETTINGS: Omit<PlatformSettings, "createdAt" | "updatedAt"> = {
  platformName: "Creative Studio",
  platformUrl: "https://creative-studio-176c0.web.app",
  supportEmail: "itsupport@omtatvadigitals.com",
  timezone: "Asia/Kolkata",
  maintenanceMode: false,
  updatedBy: null,
};

/**
 * Non-secret, derived-at-request-time status for integrations that
 * platform_settings/global itself never stores — see
 * GET /api/platform-settings/status. Every field here is safe to render
 * directly: "configured"/"connected" booleans and non-sensitive model
 * names, never a key, token, or secret value itself.
 */
export interface PlatformIntegrationStatus {
  ai: {
    gemini: { configured: boolean; defaultModel: string };
    nvidia: { configured: boolean; defaultModel: string };
    ollama: { note: string };
  };
  security: {
    authProvider: string;
    sessionModel: string;
    securityHeaders: string[];
    rateLimiting: string;
  };
  billing: {
    paymentProvider: string | null;
  };
}
