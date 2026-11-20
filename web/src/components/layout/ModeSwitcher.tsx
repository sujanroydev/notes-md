import { cn } from "@/lib/utils";
import { useTheme } from "@/app/providers";
import { useRouter } from "next/navigation";
import { Sun, Moon, Globe, Folder, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModeSwitcherProps {
  onModeChange: (mode: "personal" | "work") => void;
  user?: { name: string | null; email: string | null };
}

export function ModeSwitcher({ onModeChange, user }: ModeSwitcherProps) {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      {/* Mode buttons */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onModeChange("personal")}
        aria-label="Personal mode"
        className="h-8 w-8"
      >
        <Globe className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onModeChange("work")}
        aria-label="Work mode"
        className="h-8 w-8"
      >
        <Folder className="h-4 w-4" />
      </Button>

      {/* User menu (Work mode only) */}
      {user?.name && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/signin")}
          aria-label="Account"
          className="h-8 w-8"
        >
          <User className="h-4 w-4" />
        </Button>
      )}

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="h-8 w-8"
      >
        {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>
    </div>
  );
}