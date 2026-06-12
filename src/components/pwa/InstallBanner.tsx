/**
 * InstallBanner – shows a native-style "Add to Home Screen" prompt on Android
 * and a manual instructions banner on iOS (where the BeforeInstallPromptEvent
 * is not fired by the browser).
 *
 * On desktop Chrome/Edge the banner also surfaces the install prompt.
 *
 * Usage: render once inside a layout that is always visible, e.g. __root.tsx.
 * The banner auto-dismisses after install and remembers dismissal in
 * sessionStorage so it doesn't re-appear on every navigation.
 */

import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type BannerKind = "android" | "ios" | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

const DISMISSED_KEY = "medivoice.pwa.banner.dismissed";

// ── Component ─────────────────────────────────────────────────────────────────

export function InstallBanner() {
  const [kind, setKind] = useState<BannerKind>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Already installed or dismissed this session → stay hidden
    if (isInStandaloneMode()) return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    if (isIOS()) {
      // iOS Safari doesn't fire BeforeInstallPromptEvent; show manual tip
      setKind("ios");
      return;
    }

    // Android / desktop Chrome/Edge
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setKind("android");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setKind(null);
  }

  async function install() {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setInstalling(false);
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setKind(null);
    }
  }

  if (!kind) return null;

  return (
    <div
      role="banner"
      aria-live="polite"
      className="fixed bottom-0 inset-x-0 z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]
                 sm:bottom-4 sm:left-auto sm:right-4 sm:inset-x-auto sm:max-w-sm"
    >
      <div
        className="rounded-2xl border border-border/60 bg-card shadow-xl
                   backdrop-blur-sm flex items-start gap-3 p-4"
      >
        {/* App icon */}
        <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground
                        grid place-items-center shrink-0">
          <svg
            width="22"
            height="22"
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
          >
            <rect x="16" y="6"  width="8" height="28" rx="2" fill="currentColor" opacity=".9" />
            <rect x="6"  y="16" width="28" height="8"  rx="2" fill="currentColor" opacity=".9" />
            <circle cx="20" cy="33" r="2.5" fill="currentColor" opacity=".6" />
          </svg>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">
            Install MediVoice
          </p>
          {kind === "android" ? (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Add to your home screen for quick access — no app store needed.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Tap{" "}
              <Share className="inline w-3.5 h-3.5 align-text-bottom" />{" "}
              then <strong>"Add to Home Screen"</strong> to install.
            </p>
          )}

          {kind === "android" && (
            <button
              onClick={install}
              disabled={installing}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg
                         bg-primary px-3 py-1.5 text-xs font-medium
                         text-primary-foreground hover:opacity-90
                         disabled:opacity-60 transition-opacity"
            >
              <Download className="w-3.5 h-3.5" />
              {installing ? "Installing…" : "Install now"}
            </button>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="shrink-0 text-muted-foreground hover:text-foreground
                     transition-colors -mt-0.5 -mr-0.5 p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
