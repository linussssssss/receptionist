'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Phone,
  Calendar,
  Settings,
  BarChart3,
} from 'lucide-react';
import { ThemeToggle } from './theme-toggle';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Calls', href: '/calls', icon: Phone },
  { name: 'Appointments', href: '/appointments', icon: Calendar },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-gray-50 dark:bg-[oklch(0.205_0_0)] dark:border-gray-800">
      {/* Logo */}
      <div className="flex h-16 items-center border-b dark:border-gray-800 px-6">
        <h1 className="text-xl font-bold dark:text-white">AI Receptionist</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div className="border-t dark:border-gray-800 px-3 py-2">
        <ThemeToggle />
      </div>

      {/* Footer */}
      <div className="border-t dark:border-gray-800 p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Zahnarztpraxis Dr. Müller
        </p>
      </div>
    </div>
  );
}
