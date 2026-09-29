"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-buttons text-white hover:opacity-90 shadow-soft",
  secondary: "bg-secondary text-white hover:opacity-90 shadow-soft",
  // Secondary CTA: transparent background (works against any backdrop
  // in either theme scope — a dark cinematic hero or a light card),
  // --sand border, Slate/secondary text. Callers needing a specific
  // "glass" treatment (e.g. the marketing hero) pass their own
  // className, which cn()/tailwind-merge correctly overrides this with.
  outline: "border border-sand bg-transparent text-secondary hover:bg-surface-muted",
  ghost: "bg-transparent text-foreground hover:bg-surface-muted",
  // Semantic muted red (--color-error), not Tailwind's default bright
  // red — destructive actions stay clearly distinguishable without
  // breaking from the rest of the app's muted status-color language.
  danger: "bg-error text-white hover:opacity-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10",
};

/**
 * Base button used everywhere. Variants/sizes are closed unions so
 * every button in the app stays visually consistent; add new looks
 * here rather than one-off className overrides.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-theme font-medium transition-all duration-200",
          "disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
