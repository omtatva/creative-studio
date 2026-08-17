import Image from "next/image";
import { cn } from "@/lib/utils/cn";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { box: "h-7 w-7", text: "text-xs" },
  md: { box: "h-9 w-9", text: "text-sm" },
  lg: { box: "h-14 w-14", text: "text-lg" },
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Falls back to initials-on-color when no photoURL is set — every
 * member/user in the foundation renders through this so we never
 * show a broken image icon.
 */
export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const { box, text } = sizeMap[size];

  if (src) {
    return (
      <div className={cn("relative overflow-hidden rounded-full", box, className)}>
        <Image src={src} alt={name} fill sizes="56px" className="object-cover" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-primary/15 font-semibold text-primary",
        box,
        text,
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
