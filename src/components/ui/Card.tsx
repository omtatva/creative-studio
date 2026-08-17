import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Base surface container. Respects the `cardStyle` theme setting
 * (flat / soft / glass) via the `soft` / `glass` boolean flags so
 * the same component adapts once ThemeSettings.cardStyle is wired
 * into it from Settings > Theme.
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  noPadding?: boolean;
}

export function Card({ className, glass, noPadding, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-theme border border-border bg-cards",
        glass ? "backdrop-blur-glass bg-cards/70" : "shadow-soft",
        !noPadding && "p-5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-4 flex items-center justify-between", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold text-foreground", className)} {...props}>
      {children}
    </h3>
  );
}
