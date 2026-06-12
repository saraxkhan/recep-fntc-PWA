import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { InstallBanner } from "../components/pwa/InstallBanner";

// ── PWA: register service worker once on the client ──────────────────────────
function usePWA() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[PWA] Service worker registered, scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("[PWA] Service worker registration failed:", err);
      });
  }, []);
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "F&TC HealthCare" },
      { name: "description", content: "F&TC Healthcare provides compassionate, quality medical care with modern facilities, expert professionals, and a patient-first approach for better health." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "F&TC HealthCare" },
      { property: "og:description", content: "F&TC Healthcare provides compassionate, quality medical care with modern facilities, expert professionals, and a patient-first approach for better health." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "F&TC HealthCare" },
      { name: "twitter:description", content: "F&TC Healthcare provides compassionate, quality medical care with modern facilities, expert professionals, and a patient-first approach for better health." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b487b832-2d38-4a57-9afb-13cb9d6ba0ed" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b487b832-2d38-4a57-9afb-13cb9d6ba0ed" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // ── PWA ──
      { rel: "manifest", href: "/manifest.json" },
      // Apple touch icon (iOS home screen / splash)
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      // Apple splash screens
      { rel: "apple-touch-startup-image", href: "/splash/splash-1242x2208.png", media: "(device-width:414px) and (device-height:736px) and (-webkit-device-pixel-ratio:3)" },
      { rel: "apple-touch-startup-image", href: "/splash/splash-1080x1920.png", media: "(device-width:360px) and (device-height:640px) and (-webkit-device-pixel-ratio:3)" },
      { rel: "apple-touch-startup-image", href: "/splash/splash-750x1334.png",  media: "(device-width:375px) and (device-height:667px) and (-webkit-device-pixel-ratio:2)" },
      { rel: "apple-touch-startup-image", href: "/splash/splash-640x1136.png",  media: "(device-width:320px) and (device-height:568px) and (-webkit-device-pixel-ratio:2)" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* PWA theme colour + iOS standalone behaviour */}
        <meta name="theme-color" content="#1e2a4a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MediVoice" />
        <meta name="application-name" content="MediVoice" />
        <meta name="msapplication-TileColor" content="#1e2a4a" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  usePWA();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <InstallBanner />
    </QueryClientProvider>
  );
}
