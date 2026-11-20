"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  List,
  Sun,
  Moon,
  Github,
  Settings,
  LogOut,
  LogIn,
  User,
  PanelLeft,
  Globe,
  FolderOpen,
  FileCode2,
  Star,
  Clock,
  Plus,
  ChevronRight,
  Edit,
  Trash2,
  Loader2,
  LogOut as LogOutIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/app/providers";

interface User {
  id: string;
  google_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

export function SideNav({ user }: { user: User }) {
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [activeMode, setActiveMode] = useState<"personal" | "work">("personal");

  const navItems: { id: "personal" | "work"; label: string; icon: React.ReactNode }[] = [
    { id: "personal", label: "Personal", icon: <Globe className="h-4 w-4" /> },
    { id: "work", label: "Work", icon: <FolderOpen className="h-4 w-4" /> },
  ];

  return (
    <Sheet open={false}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex flex-col justify-between">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileCode2 className="h-4 w-4" />
            </span>
            <span className="font-semibold">NOTES.md</span>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 pr-4">
          <div className="flex flex-col gap-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Mode
                </p>
                <p className="text-sm font-medium">Switch workspace data source</p>
              </div>
              <div className="flex gap-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveMode(item.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      activeMode === item.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {item.icon}
                    {item.label}
                    {item.id === "work" && user && (
                      <span className="text-xs text-muted-foreground">• {user.name}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Settings
                </p>
                <p className="text-sm font-medium">Display & behavior</p>
              </div>
              <button
                onClick={toggleTheme}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Toggle theme"
              >
                {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <User className="h-4 w-4" />
                  {user?.name ?? "Account"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuItem>
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  <LogOutIcon className="h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ScrollArea>
        <div className="mt-auto p-4 text-xs text-muted-foreground">
          WP 0.1.0 · MVP
        </div>
      </SheetContent>
    </Sheet>
  );
}
