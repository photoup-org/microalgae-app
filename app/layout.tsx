import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Monitorização de Microalgas",
    description: "Monitorização e controlo de fotobiorreatores de microalgas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="pt" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
            <body className="min-h-full flex flex-col">
                {children}
                <Toaster richColors position="bottom-right" />
            </body>
        </html>
    );
}
