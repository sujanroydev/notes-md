import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          "cursor-pointer",
          variant === "default" &&
            "bg-primary text-primary-foreground shadow hover:bg-primary/90",
          variant === "outline" &&
            "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
          variant === "ghost" &&
            "hover:bg-accent hover:text-accent-foreground",
          variant === "destructive" &&
            "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
          size === "default" && "h-9 px-4",
          size === "sm" && "h-8 px-3 text-xs",
          size === "lg" && "h-10 px-4",
          size === "icon" && "h-9 w-9",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
