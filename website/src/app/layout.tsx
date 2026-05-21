import { Chakra_Petch } from "next/font/google";
import { Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { RootProvider } from "fumadocs-ui/provider/next";

const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-chakra-petch",
  display: "swap",
  preload: true,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: true,
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="scroll-smooth dark"
    >
      <body
        className={`${chakraPetch.variable} ${spaceGrotesk.variable} antialiased min-h-screen flex flex-col`}
      >
        <RootProvider
          theme={{
            attribute: "data-theme",
            defaultTheme: "dark",
            disableTransitionOnChange: true,
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
