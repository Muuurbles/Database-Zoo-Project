'use client';

import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import Header from "@/components/Header";
import CartSidebar from "@/components/CartSidebar";
import NotificationBanner from "@/components/NotificationBanner";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  // Create QueryClient instance (only once per app lifecycle)
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // Data is fresh for 1 minute
        gcTime: 5 * 60 * 1000, // Cache persists for 5 minutes (formerly cacheTime)
        refetchOnWindowFocus: false, // Don't refetch on window focus
        retry: 1, // Retry failed requests once
      },
    },
  }));

  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <CartProvider>
              {!isAdminRoute && <Header />}
              <CartSidebar />
              <NotificationBanner />
              <main className={isAdminRoute ? '' : "mx-auto max-w-[90rem] 2xl:max-w-[120rem] px-6 sm:px-8 lg:px-12 xl:px-16"}>
                {children}
              </main>
            </CartProvider>
          </AuthProvider>
          {/* DevTools only in development */}
          {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
      </body>
    </html>
  );
}
