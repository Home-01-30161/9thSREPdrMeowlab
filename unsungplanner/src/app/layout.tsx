import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

// Kanit is a static (non-variable) Google font, so weight must be specified.
const kanit = Kanit({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-kanit",
});

export const metadata: Metadata = {
  title: "Unsung Planner",
  description: "Live flight and hotel prices, public holiday checks, and a budget calculated by code — for any city in the world.",
};

// Inline (before first paint) so the stored or system theme is applied with
// no light flash on load. The logic is mirrored by src/components/ThemeToggle.tsx.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${kanit.variable} h-full antialiased`}
      // The inline script mutates <html>'s class pre-hydration, so React must
      // keep the DOM instead of flagging a mismatch.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
