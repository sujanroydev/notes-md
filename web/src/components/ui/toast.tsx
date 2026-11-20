"use client";

import * as React from "react";

type ToastVariant = "default" | "success" | "error" | "loading" | "info";

interface ToastInput {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  variant?: ToastVariant;
  duration?: number;
}

const TOAST_EVENT = "notes-md-toast";

export function showToast(params: ToastInput): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: params }));
}

export function Toaster({
  position = "top-center",
}: {
  position?: "top-right" | "bottom-right" | "top-center" | "bottom-center";
}) {
  const [toast, setToast] = React.useState<ToastInput | null>(null);

  React.useEffect(() => {
    const listener = (event: Event) => {
      const params = (event as CustomEvent<ToastInput>).detail;
      setToast(params);
      window.setTimeout(() => setToast(null), params.duration ?? 4000);
    };
    window.addEventListener(TOAST_EVENT, listener);
    return () => window.removeEventListener(TOAST_EVENT, listener);
  }, []);

  if (!toast) {
    return null;
  }

  const positionClass =
    position === "top-right"
      ? "right-4 top-4"
      : position === "bottom-right"
        ? "bottom-4 right-4"
        : position === "bottom-center"
          ? "bottom-4 left-1/2 -translate-x-1/2"
          : "left-1/2 top-4 -translate-x-1/2";

  const background =
    toast.variant === "success"
      ? "bg-green-600"
      : toast.variant === "error"
        ? "bg-red-600"
        : "bg-primary";

  return (
    <div
      className={`fixed z-[100] flex min-w-72 items-start gap-3 rounded-lg px-4 py-3 text-white shadow-lg ${positionClass} ${background}`}
      role="status"
    >
      {toast.icon}
      <div>
        <div className="text-sm font-medium">{toast.title}</div>
        {toast.description && (
          <div className="mt-1 text-xs text-white/80">{toast.description}</div>
        )}
      </div>
    </div>
  );
}
