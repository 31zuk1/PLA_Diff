import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "People's/81cn Diff",
  description: "人民日報と解放軍報の China-related topic narrative comparison MVP.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var r=document.documentElement;var s=function(v){r.classList.toggle('dark',v);r.style.colorScheme=v?'dark':'light';};var t=localStorage.getItem('theme');s(t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches);document.addEventListener('click',function(e){var n=e.target&&e.target.closest&&e.target.closest('[data-theme-toggle]');if(!n)return;var v=!r.classList.contains('dark');s(v);localStorage.setItem('theme',v?'dark':'light');});}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
