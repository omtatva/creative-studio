"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";
import { MobileMenu, type MarketingNavLink } from "./MobileMenu";
import { cn } from "@/lib/utils/cn";

const NAV_LINKS: MarketingNavLink[] = [
  { label: "Product", href: "#what-we-create" },
  { label: "Solutions", href: "#digital-experiences" },
  { label: "AI", href: "#omtatva-ai" },
  { label: "Pricing", href: "/pricing" },
  { label: "Work", href: "#featured-work" },
];

/** Sticky/transparent nav — gains a translucent background once the visitor scrolls past the hero. Sign In / Get Started reuse the existing auth routes, nothing new. */
export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const isHomepage = pathname === "/";
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 24);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToSection(href: string) {
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  }

  function handleNavClick(href: string) {
    if (href.startsWith("/")) {
      router.push(href);
    } else if (isHomepage) {
      scrollToSection(href);
    } else {
      router.push(`/${href}`);
    }
  }

  function closeMobileMenu() {
    setIsMobileMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-colors duration-300",
          isScrolled ? "border-b border-border bg-background/80 backdrop-blur-glass" : "bg-transparent"
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <button
            onClick={() => (isHomepage ? scrollToSection("#hero") : router.push("/"))}
            className="rounded-theme text-sm font-bold tracking-[0.2em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            OMTATVA DIGITALS
          </button>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.href)}
                className="rounded-theme text-sm font-medium text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" size="sm" onClick={() => router.push(ROUTES.login)}>
              Sign In
            </Button>
            <Button size="sm" onClick={() => router.push(ROUTES.signup)}>
              Get Started
            </Button>
          </div>

          <button
            ref={menuButtonRef}
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-theme p-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={closeMobileMenu}
        links={NAV_LINKS}
        onNavigate={(href) => router.push(href)}
        onSignIn={() => {
          closeMobileMenu();
          router.push(ROUTES.login);
        }}
        onGetStarted={() => {
          closeMobileMenu();
          router.push(ROUTES.signup);
        }}
      />
    </>
  );
}
