import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DOTG — Dynamic Objective Test Generator",
  description: "AI-powered multimodal MCQ generation with adaptive learning",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ background: "#0B0E1A", minHeight: "100vh" }}>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
