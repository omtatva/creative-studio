"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface MarketingNavLink {
  label: string;
  href: string;
}

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  links: MarketingNavLink[];
  onSignIn: () => void;
  onGetStarted: () => void;
  /** Called instead of scroll-to-anchor for links that are real routes (href starts with "/"), e.g. Pricing. */
  onNavigate?: (href: string) => void;
}

/**
 * Slide-in mobile nav panel — ARIA `dialog`, focus-trapped while
 * open, `Escape` closes, and focus returns to whatever triggered it
 * (the hamburger button in Navbar.tsx owns that via its `onClose`
 * callback re-focusing itself).
 */
export function MobileMenu({ isOpen, onClose, links, onSignIn, onGetStarted, onNavigate }: MobileMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button, a[href]');
    focusable?.[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  function scrollToSection(href: string) {
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col bg-surface p-6 shadow-soft-lg md:hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold tracking-[0.2em] text-foreground">OMTATVA</span>
              <button
                onClick={onClose}
                aria-label="Close menu"
                className="rounded-theme p-2 text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Primary">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    if (link.href.startsWith("/")) {
                      onNavigate?.(link.href);
                      onClose();
                    } else {
                      scrollToSection(link.href);
                    }
                  }}
                  className="rounded-theme px-3 py-3 text-base font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="flex flex-col gap-3 border-t border-border pt-6">
              <Button variant="outline" onClick={onSignIn}>
                Sign In
              </Button>
              <Button onClick={onGetStarted}>Get Started</Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
