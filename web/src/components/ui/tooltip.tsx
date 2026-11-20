import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipProviderProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}
const TooltipProvider = ({ className, children, ...props }: TooltipProviderProps) => (
  <div className={cn("relative", className)} {...props}>
    {children}
  </div>
);
TooltipProvider.displayName = "TooltipProvider";

interface TooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}
const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  ({ className, side = "top", align = "center", children, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const tooltipRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (!open) return;
      const timer = setTimeout(() => {
        const el = tooltipRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const tip = el.querySelector(".tooltip-text") as HTMLElement;
        if (!tip) return;
        const tipRect = tip.getBoundingClientRect();
        tip.style.left = "0";
        tip.style.top = "0";
        const container = el.querySelector(".tooltip") as HTMLElement;
        container.style.left = `${rect.left + (rect.width - tipRect.width) / 2}px`;
        container.style.top = `${rect.top - tipRect.height - 8}px`;
      }, 10);
      return () => clearTimeout(timer);
    }, [open]);

    return (
      <TooltipProvider>{children}</TooltipProvider>
    );
  },
);
Tooltip.displayName = "Tooltip";

const TooltipTrigger = ({ children }: { children: React.ReactNode }) => (
  <div
    onMouseEnter={() => {}}
    onMouseLeave={() => {}}
  >
    {children}
  </div>
);

export { Tooltip, TooltipProvider, TooltipTrigger };
