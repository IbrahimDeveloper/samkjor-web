import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "SamKjør",
  description: "Shared taxi ride platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
