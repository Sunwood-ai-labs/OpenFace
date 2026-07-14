import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'OpenFace - AI community hub',
  description: 'A Forgejo-backed Hugging Face style platform for models, datasets, and Spaces.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <Navbar />
        <main className="mx-auto w-full max-w-[1544px] px-0 py-0">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
