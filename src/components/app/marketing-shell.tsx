import { Brand } from "@/components/brand";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import landingLogo from "@/assets/landing-logo.png";
import { openCookiePreferences } from "@/lib/compliance/cookie-consent";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container-marketing flex items-center justify-between gap-3 h-header">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <img src={landingLogo} alt="logo" className="w-8 h-8 shrink-0 object-contain" />
            <span className="font-display text-2xl font-bold truncate"><Brand /></span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <Link
              to="/features"
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground"
            >
              Features
            </Link>
            <Link
              to="/pricing"
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              to="/about"
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground"
            >
              About
            </Link>
            <Link
              to="/contact"
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground"
            >
              Contact
            </Link>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/auth"
              className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground px-3 py-1.5"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-white/10 bg-black py-10">
        <div className="container-marketing flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/60">
          <span>© 2026 <Brand /></span>
          <div className="flex items-center gap-4 flex-wrap justify-center text-white/80">
            <Link to="/legal/privacy-policy" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link to="/legal/terms-of-service" className="hover:text-white">
              Terms of Service
            </Link>
            <Link to="/legal/cookie-policy" className="hover:text-white">
              Cookies
            </Link>
            <Link to="/legal/dpa" className="hover:text-white">
              DPA
            </Link>
            <button
              type="button"
              onClick={() => openCookiePreferences()}
              className="hover:text-white"
            >
              Cookie preferences
            </button>

            <Link to="/contact" className="hover:text-white">
              Contact
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
