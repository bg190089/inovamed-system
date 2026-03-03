'use client';

import { AuthProvider, useAuth } from '@/hooks/useAuth';
import Sidebar from '@/components/layout/Sidebar';
import ContextSelector from '@/components/layout/ContextSelector';

function AppContent({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="text-center">
          <div className="flex justify-center gap-1.5 mb-4">
            <div className="w-3 h-3 bg-brand-500 rounded-full loading-dot" />
            <div className="w-3 h-3 bg-brand-500 rounded-full loading-dot" />
            <div className="w-3 h-3 bg-brand-500 rounded-full loading-dot" />
          </div>
          <p className="text-surface-500 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-surface-50 pt-14 lg:pt-0">
        {children}
      </main>
      <ContextSelector />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppContent>{children}</AppContent>
    </AuthProvider>
  );
}
