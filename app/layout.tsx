import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JOUD Admin",
  description: "Luxury French oud perfumes and premium bakhoor from Jordan",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
