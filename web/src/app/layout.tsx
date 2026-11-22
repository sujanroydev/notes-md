import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toast";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOTES.md",
  description: "A unified Markdown note-taking platform — web + VS Code.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <div className="flex h-dvh min-h-0 w-full overflow-hidden">
            {children}
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
