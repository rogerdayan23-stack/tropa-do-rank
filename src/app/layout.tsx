import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Rank dos Cuiudos",
  description: "Acompanhe o ranking, as sessões de farm e os saldos da tropa.",
  icons: { icon: "/rank-cuiudos.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className="scroll-smooth dark">
      <body className={`${inter.variable} antialiased min-h-screen bg-background text-foreground`}>
        <Providers>
          <Sidebar />
          <main className="lg:ml-60 min-h-screen pb-12 px-4 sm:px-6 lg:px-8 pt-6">
            <div className="max-w-5xl mx-auto">{children}</div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
