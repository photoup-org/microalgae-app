import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
    variable: "--font-plex-sans",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});
const plexMono = IBM_Plex_Mono({
    variable: "--font-plex-mono",
    subsets: ["latin"],
    weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
    title: "Monitorização de Microalgas",
    description: "Monitorização e controlo de fotobiorreatores de microalgas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="pt" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
            <body className="min-h-full flex flex-col">
                <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
                    <TooltipProvider>{children}</TooltipProvider>
                    <Toaster richColors position="bottom-right" />
                </ThemeProvider>
            </body>
        </html>
    );
}
