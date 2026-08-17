import {
  BrandingSettings,
  NotificationSettings,
  SecuritySettings,
  StorageSettings,
  ProjectDefaultSettings,
  TaskDefaultSettings,
  ReviewDefaultSettings,
  SidebarConfigSettings,
  FieldSecuritySettings,
  AISettings,
  WhiteLabelSettings,
} from "@/types/settings.types";

/**
 * Named defaults for every settings slice beyond theme/project/task
 * options (which already have their own DEFAULT_* constants). Used
 * two ways: (1) seeded into a new workspace's settings doc at
 * creation time (see workspaceService.createWorkspace), and (2) as
 * a defensive fallback on each Settings page for workspaces created
 * before a given slice existed — `settings.storage ?? DEFAULT_STORAGE_SETTINGS`
 * — so older documents never crash a page, they just show defaults
 * until saved once.
 */
export const DEFAULT_BRANDING_SETTINGS: BrandingSettings = {
  logoUrl: null,
  faviconUrl: null,
  loginBackgroundUrl: null,
  dashboardBackgroundUrl: null,
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailEnabled: true,
  inAppEnabled: true,
  slackEnabled: false,
  slackWebhookUrl: null,
  digestFrequency: "daily",
  preferences: { taskAssigned: true, reviewUpdates: true, comments: true, mentions: true },
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  twoFactorRequired: false,
  allowedEmailDomains: [],
  sessionTimeoutMinutes: 60,
  passwordPolicy: { minLength: 8, requireUppercase: true, requireNumber: true, requireSymbol: false },
};

export const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  usedBytes: 0,
  limitBytes: 5 * 1024 * 1024 * 1024,
  maxUploadSizeMb: 100,
  allowedFileTypes: ["png", "jpg", "jpeg", "gif", "svg", "pdf", "doc", "docx", "zip", "mp4", "mov"],
};

export const DEFAULT_PROJECT_DEFAULT_SETTINGS: ProjectDefaultSettings = {
  defaultView: "board",
  requireApprovalToClose: false,
  templates: [],
  defaultFolderStructure: ["Assets", "Deliverables", "Feedback"],
};

export const DEFAULT_TASK_DEFAULT_SETTINGS: TaskDefaultSettings = {
  defaultPriority: "medium",
  autoAssignToCreator: true,
  defaultAssigneeUid: null,
  templates: [],
};

export const DEFAULT_REVIEW_DEFAULT_SETTINGS: ReviewDefaultSettings = {
  requireClientApproval: false,
  roundsIncluded: 2,
  approvalWorkflow: "single_approver",
  allowComments: true,
  requireCommentOnChangesRequested: true,
  defaultStages: ["Internal review", "Client review"],
};

/** One entry per Sidebar.tsx nav item, in default display order — see Sidebar.tsx NAV_ITEM_KEYS for the matching keys. */
export const DEFAULT_SIDEBAR_CONFIG: SidebarConfigSettings = {
  items: [
    "dashboard", "projects", "tasks", "board", "files", "reviews", "downloads",
    "team", "calendar", "activity", "notifications", "aiStudio", "settings",
  ].map((key, order) => ({ key, label: null, isHidden: false, isDisabled: false, order })),
  widgets: [
    "welcomeBanner", "analyticsCards", "recentProjects", "pendingReviews", "myTasks", "recentActivity", "aiActivity", "quickActions", "storageUsage",
  ].map((key) => ({ key, isHidden: false })),
};

export const DEFAULT_FIELD_SECURITY_SETTINGS: FieldSecuritySettings = {
  hideSalary: false,
  hideCost: false,
  hideStorage: false,
  hideReviews: false,
  hideAI: false,
  hideBilling: false,
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "gemini",
  defaultModel: "gemini-2.5-flash",
  temperature: 0.7,
  maxTokens: 2048,
  streamingEnabled: true,
  rateLimitPerMinute: 20,
  promptTemplates: [],
  ollamaBaseUrl: "http://localhost:11434",
};

export const DEFAULT_WHITE_LABEL_SETTINGS: WhiteLabelSettings = {
  customCss: "",
  customFooterText: "",
  customDomain: null,
};
