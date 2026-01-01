import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BillFlow - Smart Bill Tracking",
  description: "Never miss a payment. Track bills, get reminders, and visualize your spending with AI-powered categorization.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
