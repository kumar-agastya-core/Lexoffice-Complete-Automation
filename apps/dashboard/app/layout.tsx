import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lexware Automation — Exception Tray',
  description: 'Review and resolve documents that need human input',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <nav className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <span className="text-lg font-semibold text-gray-900">Lexware Automation</span>
            <span className="text-gray-400">/</span>
            <a href="/exceptions" className="text-sm text-blue-600 hover:underline">
              Exception Tray
            </a>
            <span className="text-gray-400">/</span>
            <a href="/integrations" className="text-sm text-blue-600 hover:underline">
              Integrations
            </a>
          </div>
        </nav>
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
