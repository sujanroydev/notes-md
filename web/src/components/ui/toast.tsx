import * as React from "react";
import { toast, type Toast, type ToastOptions } from "react-hot-toast";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "error" | "loading" | "info";

interface ToastRendererProps {
  toast: Toast;
  options?: ToastOptions;
}

const ToastRenderer = ({ toast, options }: ToastRendererProps) => {
  const { icon: Icon, title, description, status, variant = "default", ...rest } =
    toast;
  const variantMap: Record<string, ToastVariant> = {
    success: "success",
    error: "error",
    loading: "loading",
    info: "info",
    default: "default",
  };

  const iconMap: Record<string, React.ReactNode> = {
    success: <svg className="h-5 w-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>,
    error: <svg className="h-5 w-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>,
    info: <svg className="h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="8" /></svg>,
    loading: <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />,
    default: <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>,
  };

  return (
    <div
      className="flex items-center gap-3 rounded-lg border p-3 shadow-sm"
      style={{
        background: variant === "success" ? "#16a34a" : variant === "error" ? "#dc2626" : variant === "loading" ? "#6b7280" : "#2563eb",
        color: variant === "success" ? "#dcfce7" : variant === "error" ? "#fecaca" : variant === "loading" ? "#e5e7eb" : "#ffffff",
      }}
      {...rest}
    >
      {iconMap[variant]}
      <div className="flex-1 text-sm font-medium leading-tight">{title}</div>
      {description && <div className="text-xs opacity-80">{description}</div>}
    </div>
  );
};

export function Toaster({ position = "top-center", ...props }: { position?: "top-right" | "bottom-right" | "top-center" | "bottom-center" }) {
  return <>{toast(undefined, { position, ...props, component: ToastRenderer })}</>;
}

export function showToast(params: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  variant?: ToastVariant;
  duration?: number;
}) {
  return toast.custom((t) => (
    <div
      className="flex items-center gap-3 rounded-lg border p-3 text-white shadow-sm"
      style={{
        background: params.variant === "success" ? "#16a34a" : params.variant === "error" ? "#dc2626" : "#2563eb",
      }}
      {...t}
    >
      {params.icon ?? (params.variant === "success" ? <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg> : undefined)}
      <div className="flex-1 text-sm font-medium leading-tight">{params.title}</div>
      {params.description && <div className="text-xs opacity-80">{params.description}</div>}
    </div>
  ), { duration: params.duration ?? 4000 });
}
