'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Don't show sidebar on auth pages
  const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/register');

  if (isAuthPage) {
    return <main className="min-h-screen bg-white dark:bg-[oklch(0.145_0_0)]">{children}</main>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-white dark:bg-[oklch(0.145_0_0)]">
        {children}
      </main>
    </div>
  );
}
