import type { Config } from "tailwindcss";

/**
 * Tailwind theme is intentionally driven by CSS variables (see
 * src/app/globals.css and src/lib/constants/theme.ts) rather than
 * hardcoded hex values, so the in-app Theme Settings can rewrite
 * colors, radius, and font at runtime without a rebuild.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-muted": "rgb(var(--color-surface-muted) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        "foreground-muted": "rgb(var(--color-foreground-muted) / <alpha-value>)",
        // Extended brand roles — see types/theme.types.ts ColorRoleKey.
        sidebar: "rgb(var(--color-sidebar) / <alpha-value>)",
        navbar: "rgb(var(--color-navbar) / <alpha-value>)",
        background: "rgb(var(--color-background) / <alpha-value>)",
        cards: "rgb(var(--color-cards) / <alpha-value>)",
        buttons: "rgb(var(--color-buttons) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        error: "rgb(var(--color-error) / <alpha-value>)",
        info: "rgb(var(--color-info) / <alpha-value>)",
      },
      borderRadius: {
        theme: "var(--radius)",
      },
      fontFamily: {
        theme: "var(--font-family)",
      },
      boxShadow: {
        soft: "0 2px 8px -2px rgb(0 0 0 / 0.06), 0 4px 16px -4px rgb(0 0 0 / 0.08)",
        "soft-lg": "0 8px 30px -8px rgb(0 0 0 / 0.12)",
      },
      backdropBlur: {
        glass: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
