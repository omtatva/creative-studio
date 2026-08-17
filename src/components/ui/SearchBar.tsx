"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useDebounce } from "@/hooks/useDebounce";

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onSearch?: (query: string) => void;
  containerClassName?: string;
}

/**
 * Debounced search input used in the Navbar (global search) and
 * reusable anywhere a filter box is needed later (project lists,
 * user tables, etc.).
 */
export function SearchBar({ onSearch, containerClassName, className, ...props }: SearchBarProps) {
  const [value, setValue] = useState("");
  const debounced = useDebounce(value, 300);

  useEffect(() => {
    onSearch?.(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className={cn("relative flex-1 max-w-md", containerClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
      <input
        {...props}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch?.(e.target.value);
        }}
        placeholder={props.placeholder ?? "Search..."}
        className={cn(
          "h-9 w-full rounded-theme border border-border bg-surface-muted pl-9 pr-3 text-sm text-foreground",
          "placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50",
          className
        )}
      />
    </div>
  );
}
