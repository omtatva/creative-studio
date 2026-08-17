export interface StageTemplate {
  key: string;
  name: string;
  description: string;
}

/**
 * "Create from Template" presets — pick one to prefill a new Stage's
 * name/description (still a real Stage doc via the normal
 * createStage() path, nothing fake or mocked). Purely a naming/
 * organization starting point; no placeholder assets are created.
 */
export const STAGE_TEMPLATES: StageTemplate[] = [
  { key: "video_production", name: "Video Production", description: "Raw footage, cuts, and final exports for a video deliverable." },
  { key: "social_campaign", name: "Social Campaign", description: "Creative assets for a multi-platform social campaign." },
  { key: "brand_assets", name: "Brand Assets", description: "Logos, brand marks, and identity files for this project." },
  { key: "print_deliverable", name: "Print Deliverable", description: "Print-ready PDFs and supporting artwork." },
];
