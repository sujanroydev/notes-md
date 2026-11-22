"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
let serviceWorkerRegistration: Promise<void> | null = null;

function PwaLifecycle() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (!serviceWorkerRegistration) {
      serviceWorkerRegistration = navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => undefined)
        .catch((error: unknown) => {
          serviceWorkerRegistration = null;
          console.error("Could not register the NOTES.md service worker:", error);
        });
    }
    void serviceWorkerRegistration;
  }, []);

  return null;
}

function OfflineNotice() {
  const [online, setOnline] = useState(true);

  const checkConnectivity = useCallback(async () => {
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }

    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        credentials: "omit",
      });
      setOnline(response.ok);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    const updateStatus = () => {
      if (!navigator.onLine) {
        setOnline(false);
      } else {
        void checkConnectivity();
      }
    };
    updateStatus();
    const interval = window.setInterval(updateStatus, 15000);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, [checkConnectivity]);

  if (online) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
    >
      Offline. Notes are available locally. Work changes are queued and will sync when the connection returns.
    </div>
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) {
      return;
    }
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("theme", theme);
  }, [initialized, theme]);

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PwaLifecycle />
      <OfflineNotice />
      {children}
    </ThemeProvider>
  );
}
