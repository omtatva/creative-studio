import { ID, Timestamps } from "./common.types";
import { ThemeSettings } from "./theme.types";

/**
 * One settings document per workspace (settings/{workspaceId}).
 * Grouped by domain so each Settings sub-page (branding, security,
 * notifications, etc.) can read/write only its own slice without
 * clobbering the rest. All sub-objects are optional placeholders —
 * the foundation only defines shape, not behavior.
 */
export interface WorkspaceSettings extends Timestamps {
  workspaceId: ID;
  theme: ThemeSettings;
  branding: BrandingSettings;
  notifications: NotificationSettings;
  security: SecuritySettings;
  storage: StorageSettings;
  projectDefaults: ProjectDefaultSettings;
  taskDefaults: TaskDefaultSettings;
  reviewDefaults: ReviewDefaultSettings;
  projectOptions: ProjectOptionsSettings;
  taskOptions: TaskOptionsSettings;
  assetOptions: AssetOptionsSettings;
  sidebarConfig: SidebarConfigSettings;
  fieldSecurity: FieldSecuritySettings;
  ai: AISettings;
  whiteLabel: WhiteLabelSettings;
}

/**
 * The configurable vocabulary every project in the workspace draws
 * from — statuses, priorities, the color palette, and icon set.
 * Projects store only an id/key referencing these; nothing about a
 * status's label or color is ever hardcoded in project components
 * (see components/projects/ProjectStatusBadge.tsx).
 */
export interface ProjectStatusOption {
  id: string;
  label: string;
  color: string; // "R G B"
}

export interface ProjectPriorityOption {
  id: string;
  label: string;
  color: string; // "R G B"
  order: number; // for sort-by-priority
}

export interface ProjectOptionsSettings {
  statuses: ProjectStatusOption[];
  priorities: ProjectPriorityOption[];
  colors: string[]; // palette of "R G B" strings selectable as a project's color
  icons: string[]; // lucide icon keys selectable as a project's icon
}

/**
 * Same pattern as ProjectOptionsSettings, one level down: every
 * task's status/priority/label is an id referencing this list, never
 * a hardcoded enum. TaskLabelOption is distinct from a task's free-
 * form `tags` — labels are a curated, colored taxonomy defined here;
 * tags are ad-hoc strings the assignee types in.
 */
export interface TaskStatusOption {
  id: string;
  label: string;
  color: string; // "R G B"
  icon: string; // lucide icon key — single source of truth for a status/column's icon
  isCompletedStatus: boolean; // drives subtask/checklist progress rollups
}

export interface TaskPriorityOption {
  id: string;
  label: string;
  color: string; // "R G B"
  order: number;
}

export interface TaskLabelOption {
  id: string;
  label: string;
  color: string; // "R G B"
}

export interface TaskOptionsSettings {
  statuses: TaskStatusOption[];
  priorities: TaskPriorityOption[];
  labels: TaskLabelOption[];
}

/**
 * Same configurable-vocabulary pattern as ProjectOptionsSettings/
 * TaskOptionsSettings, one level down again: a creative asset's
 * workflow status (shown in the Creative Review Workspace's header
 * Status dropdown) is an id referencing this list, never a hardcoded
 * enum — see components/creative/review/StatusDropdown.tsx. This is
 * deliberately separate from `ProjectFile.reviewStatus` (the
 * approve/changes-requested outcome driven by the Reviews module and
 * what Downloads filters on) — `statusId` is a broader, team-editable
 * workflow label ("In Progress", "Reviewing", ...) the team sets by
 * hand, and doesn't change what Downloads/Reviews already do.
 * `isEnabled` lets a workspace retire a status without breaking any
 * file still referencing it (it just stops appearing as a pickable
 * option going forward); `order` drives the dropdown's display order.
 */
export interface AssetStatusOption {
  id: string;
  label: string;
  color: string; // "R G B"
  isEnabled: boolean;
  order: number;
}

export interface AssetOptionsSettings {
  statuses: AssetStatusOption[];
}

export interface BrandingSettings {
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
  dashboardBackgroundUrl: string | null;
}

export interface NotificationChannelPreferences {
  taskAssigned: boolean;
  reviewUpdates: boolean;
  comments: boolean;
  mentions: boolean;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  slackEnabled: boolean;
  slackWebhookUrl: string | null;
  digestFrequency: "off" | "daily" | "weekly";
  preferences: NotificationChannelPreferences;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export interface SecuritySettings {
  twoFactorRequired: boolean;
  allowedEmailDomains: string[];
  sessionTimeoutMinutes: number;
  passwordPolicy: PasswordPolicy;
}

export interface StorageSettings {
  usedBytes: number;
  limitBytes: number;
  maxUploadSizeMb: number;
  allowedFileTypes: string[]; // extensions, e.g. "png", "pdf"
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
}

export interface ProjectDefaultSettings {
  defaultView: "board" | "list" | "timeline";
  requireApprovalToClose: boolean;
  templates: ProjectTemplate[];
  defaultFolderStructure: string[]; // ordered folder names created under a new project
}

export interface TaskTemplate {
  id: string;
  name: string;
  defaultTitle: string;
  defaultDescription: string;
}

export interface TaskDefaultSettings {
  defaultPriority: "low" | "medium" | "high" | "urgent";
  autoAssignToCreator: boolean;
  defaultAssigneeUid: string | null;
  templates: TaskTemplate[];
}

export type ApprovalWorkflow = "single_approver" | "multi_stage";

export interface ReviewDefaultSettings {
  requireClientApproval: boolean;
  roundsIncluded: number;
  approvalWorkflow: ApprovalWorkflow;
  allowComments: boolean;
  requireCommentOnChangesRequested: boolean;
  defaultStages: string[]; // ordered stage names, e.g. ["Internal review", "Client review"]
}

/**
 * Page Access: which sidebar items are visible/enabled, their
 * display order, and any renamed label — read by Sidebar.tsx so
 * "users should never see modules they don't have permission to
 * access" is real enforcement, not just a settings-page toggle that
 * does nothing. Keyed by the nav item's route key (see
 * lib/constants/routes.ts ROUTES).
 */
export interface SidebarItemConfig {
  key: string; // matches a ROUTES key, e.g. "dashboard", "projects"
  label: string | null; // null = use the default label
  isHidden: boolean;
  isDisabled: boolean;
  order: number;
}

export interface DashboardWidgetConfig {
  key: string; // matches a dashboard widget id, e.g. "recentProjects"
  isHidden: boolean;
}

export interface SidebarConfigSettings {
  items: SidebarItemConfig[];
  widgets: DashboardWidgetConfig[];
}

/**
 * Field-level visibility toggles. `storage`/`reviews`/`ai` map to
 * real nav items and are actually enforced (see Sidebar.tsx).
 * `salary`/`cost`/`billing` have no corresponding field anywhere in
 * this app — there's no payroll or billing module — so those two
 * toggles are stored for forward-compatibility but are currently a
 * no-op; see the Access Control page's note.
 */
export interface FieldSecuritySettings {
  hideSalary: boolean;
  hideCost: boolean;
  hideStorage: boolean;
  hideReviews: boolean;
  hideAI: boolean;
  hideBilling: boolean;
}

/**
 * AI Settings — provider indicator + generation defaults + reusable
 * prompt templates. Deliberately NO api key field: the Gemini key
 * lives only in the server's GEMINI_API_KEY env var (see
 * src/app/api/ai-studio/generate/route.ts), never in Firestore,
 * never readable by any workspace member regardless of role. Usage
 * logs live in their own `ai_usage_logs` collection, not here, since
 * they grow unboundedly.
 */
export type AIProvider = "openai" | "gemini" | "nvidia" | "claude" | "openrouter" | "ollama";

export interface AIPromptTemplate {
  id: string;
  name: string;
  prompt: string;
}

export interface AISettings {
  provider: AIProvider;
  defaultModel: string;
  temperature: number; // 0-2
  maxTokens: number;
  streamingEnabled: boolean;
  rateLimitPerMinute: number;
  promptTemplates: AIPromptTemplate[];
  /** Only used when provider is "ollama" — a local server URL, not a secret, so it's plain text here rather than going through ai_config's encrypted-key flow. */
  ollamaBaseUrl: string;
}

/**
 * White Label — the pieces NOT already covered by Branding (logo/
 * favicon/colors/backgrounds live in `branding` + `theme.colors`;
 * see the White Label settings page, which links to Branding for
 * those instead of duplicating the color picker).
 */
export interface WhiteLabelSettings {
  customCss: string;
  customFooterText: string;
  customDomain: string | null;
}
