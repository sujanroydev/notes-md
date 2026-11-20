"use client";

import { useState } from "react";
import {
  Plus,
  FileCode2,
  Globe,
  FolderOpen,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Edit,
  Loader2,
  CheckCircle,
  AlertCircle,
  Play,
  Eye,
  Split,
  LayoutGrid,
  List,
  Sun,
  Moon,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { showToast } from "@/components/ui/toast";
import { useTheme } from "@/app/providers";
import { WorkProject } from "@/lib/api";
import { cn } from "@/lib/utils";

interface WorkMainProps {
  initialProjects: WorkProject[];
}

export function WorkMain({ initialProjects }: WorkMainProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [projects, setProjects] = useState<WorkProject[]>(initialProjects);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");

  const handleCreateProject = async () => {
    const name = prompt("Project name:");
    if (!name) return;
    try {
      const res = await fetch("/api/work/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const project = await res.json();
        setProjects((prev) => [...prev, project]);
        setActiveProject(project.id);
        showToast({ title: "Project created", variant: "success" });
      } else {
        showToast({ title: "Failed to create project", variant: "error" });
      }
    } catch {
      showToast({ title: "Network error", variant: "error" });
    }
  };

  const sorted = [...projects].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button onClick={handleCreateProject} className="gap-2">
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </div>
      </header>

      {/* Projects */}
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2">
          <h2 className="text-sm font-semibold">Projects</h2>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" /> List
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" /> Grid
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sorted.map((project) => (
            <button
              key={project.id}
              onClick={() => setActiveProject(project.id)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors",
                activeProject === project.id
                  ? "bg-primary/5"
                  : "hover:bg-accent",
              )}
            >
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  Project
                </p>
              </div>
              {activeProject === project.id && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ))}
          {sorted.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">No projects yet</p>
              <p className="text-xs mt-1">Create one to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
