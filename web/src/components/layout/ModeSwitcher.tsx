"use client";

import { useState } from "react";
import { Folder, Globe, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";

interface ModeSwitcherProps {
  mode: "personal" | "work";
  user?: { name: string | null; email: string | null };
}

export function ModeSwitcher({ mode, user }: ModeSwitcherProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("The session could not be ended.");
      }
      navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PAGE_CACHE" });
      router.replace("/signin");
      router.refresh();
    } catch (error) {
      showToast({
        title: "Could not sign out",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
      setSigningOut(false);
    }
  };

  return (
    <nav className="flex items-center gap-1" aria-label="Mode selection">
      <Button
        type="button"
        size="sm"
        variant={mode === "personal" ? "default" : "ghost"}
        aria-current={mode === "personal" ? "page" : undefined}
        onClick={() => router.push("/personal")}
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline">Personal</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "work" ? "default" : "ghost"}
        aria-current={mode === "work" ? "page" : undefined}
        onClick={() => router.push("/")}
      >
        <Folder className="h-4 w-4" />
        <span className="hidden sm:inline">Work</span>
      </Button>
      {mode === "work" && user && (
        <>
          <span className="hidden max-w-40 truncate px-2 text-xs text-muted-foreground sm:inline">
            {user.name ?? user.email}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={signingOut}
            onClick={() => void signOut()}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </>
      )}
    </nav>
  );
}
