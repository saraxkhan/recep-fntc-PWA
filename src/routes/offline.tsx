import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/offline")({
  head: () => ({
    meta: [
      { title: "MediVoice – You're offline" },
      { name: "description", content: "No internet connection. Please reconnect to use MediVoice." },
    ],
  }),
  component: OfflinePage,
});

function OfflinePage() {
  // Auto-redirect when connection is restored
  useEffect(() => {
    function handleOnline() {
      window.location.href = "/";
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return (
    <div className="min-h-dvh bg-[#1e2a4a] text-[#f0f4ff] flex flex-col items-center justify-center px-5 py-12 text-center">
      {/* Icon */}
      <div className="w-20 h-20 rounded-2xl bg-white/5 ring-1 ring-white/10 grid place-items-center mb-7">
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="16" y="6"  width="8" height="28" rx="2" fill="#4a8eff" />
          <rect x="6"  y="16" width="28" height="8"  rx="2" fill="#4a8eff" />
          <circle cx="20" cy="34" r="2.5" fill="#f0f4ff" />
        </svg>
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-2">You're offline</h1>
      <p className="text-[#7b8ab8] text-sm max-w-xs leading-relaxed">
        MediVoice needs a connection to chat with Maya and manage appointments.
      </p>

      {/* Tips card */}
      <div className="mt-7 w-full max-w-sm rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 text-left">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#7b8ab8] mb-3">
          Try these steps
        </p>
        <ul className="space-y-2.5">
          {[
            "Check your Wi-Fi or mobile data",
            "Move to a better signal area",
            "Disable Airplane mode if enabled",
            "Restart your router or browser",
          ].map((tip) => (
            <li key={tip} className="flex items-center gap-2.5 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4a8eff] flex-shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-7 flex flex-wrap gap-3 justify-center">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4a8eff] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          Try again
        </button>
        <a
          href="/"
          className="inline-flex items-center px-5 py-2.5 rounded-lg ring-1 ring-white/15 text-[#7b8ab8] text-sm font-medium hover:text-[#f0f4ff] transition-colors"
        >
          Go home
        </a>
      </div>

      {/* Live connection status */}
      <ConnectionStatus />
    </div>
  );
}

function ConnectionStatus() {
  const isOnline =
    typeof navigator !== "undefined" ? navigator.onLine : true;

  return (
    <p className="mt-7 text-xs text-[#7b8ab8] flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{
          background: isOnline ? "#48bb78" : "#e53e3e",
          animation: isOnline ? "none" : "blink 1.4s ease-in-out infinite",
        }}
      />
      {isOnline ? "Connection restored — redirecting…" : "No internet connection"}
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </p>
  );
}
