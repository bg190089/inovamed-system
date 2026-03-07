'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    roles: ['admin', 'recepcionista', 'medico'],
  },
  {
    name: 'Recepção',
    href: '/recepcao',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    roles: ['admin', 'recepcionista'],
  },
  {
    name: 'Triagem',
    href: '/triagem',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    roles: ['admin', 'recepcionista'],
  },
  {
    name: 'Consultório',
    href: '/consultorio',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    roles: ['admin', 'medico'],
  },
  {
    name: 'Agendamento',
    href: '/agendamento',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    roles: ['admin', 'recepcionista'],
  },
  {
    name: 'Pacientes',
    href: '/pacientes',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    roles: ['admin', 'medico'],
  },
  {
    name: 'Assinatura',
    href: '/assinatura-medico',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
    roles: ['medico'],
  },
  {
    name: 'Relatórios',
    href: '/relatorios',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    roles: ['admin'],
  },
  {
    name: 'Administração',
    href: '/admin',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    roles: ['admin'],
  },
];

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, selectedEmpresa, selectedUnidade, signOut, hasRole } = useAuth();

  const filteredNav = navigation.filter(item =>
    item.roles.some(role => hasRole(role as any))
  );

  const handleNavClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  const handleSignOut = () => {
    signOut();
    if (onNavigate) {
      onNavigate();
    }
  };

  return (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-surface-100">
        <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-display font-bold text-surface-900 text-sm truncate">Inovamed</h1>
            <p className="text-[10px] text-surface-400 truncate">Escleroterapia</p>
          </div>
        )}
      </div>

      {/* Context selector - clickable to change */}
      {!collapsed && selectedEmpresa && (
        <div className="px-3 py-3 border-b border-surface-100">
          <button
            onClick={() => window.dispatchEvent(new Event('openContextSelector'))}
            className="w-full text-left bg-surface-50 hover:bg-brand-50 rounded-lg px-3 py-2 transition-colors group cursor-pointer"
            title={user?.role === 'recepcionista' ? 'Clique para trocar empresa' : 'Clique para trocar empresa ou unidade'}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-surface-400 font-semibold">Empresa</p>
              <svg className="w-3.5 h-3.5 text-surface-300 group-hover:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            </div>
            <p className="text-xs font-medium text-surface-700 truncate">
              {selectedEmpresa.tipo === 'inovamed' ? 'Inovamed' : 'M&J Saúde'}
            </p>
            {selectedUnidade && (
              <>
                <p className="text-[10px] uppercase tracking-wider text-surface-400 font-semibold mt-2">Unidade</p>
                <p className="text-xs font-medium text-surface-700 truncate">
                  {(selectedUnidade as any).municipio?.nome || 'Selecionar'}
                </p>
              </>
            )}
            <p className="text-[9px] text-brand-400 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {user?.role === 'recepcionista' ? 'Clique para trocar empresa' : 'Clique para alterar'}
            </p>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-surface-500 hover:bg-surface-50 hover:text-surface-700'
              )}
              title={item.name}
            >
              <span className={cn(
                'flex-shrink-0',
                isActive ? 'text-brand-600' : 'text-surface-400 group-hover:text-surface-600'
              )}>
                {item.icon}
              </span>
              {!collapsed && (
                <span className="text-sm font-medium">{item.name}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-surface-100 p-3">
        {!collapsed && user && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-brand-700">
                {user.nome_completo.charAt(0)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-surface-800 truncate">{user.nome_completo}</p>
              <p className="text-[10px] text-surface-400 capitalize">{user.role}</p>
            </div>
          </div>
        )}
        <div className="flex gap-1">
          <button
            onClick={() => {
              // Collapse toggle - only visible on desktop
            }}
            className="hidden lg:flex flex-1 p-2 rounded-lg text-surface-400 hover:bg-surface-50 hover:text-surface-600 transition-colors"
            title={collapsed ? 'Expandir' : 'Recolher'}
          >
            <svg className={cn('w-4 h-4 mx-auto transition-transform', collapsed && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleSignOut}
            className="flex-1 p-2 rounded-lg text-surface-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            title="Sair"
          >
            <svg className="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const handleToggleMobileSidebar = () => {
      setMobileDrawerOpen(prev => !prev);
    };

    window.addEventListener('toggleMobileSidebar', handleToggleMobileSidebar);
    return () => {
      window.removeEventListener('toggleMobileSidebar', handleToggleMobileSidebar);
    };
  }, []);

  const closeMobileDrawer = () => {
    setMobileDrawerOpen(false);
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn(
        'hidden lg:flex h-screen bg-white border-r border-surface-100 flex-col transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-64'
      )}>
        <SidebarContent collapsed={collapsed} />

        {/* Collapse toggle button - desktop only */}
        <div className="border-t border-surface-100 p-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full p-2 rounded-lg text-surface-400 hover:bg-surface-50 hover:text-surface-600 transition-colors"
            title={collapsed ? 'Expandir' : 'Recolher'}
          >
            <svg className={cn('w-4 h-4 mx-auto transition-transform', collapsed && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setMobileDrawerOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white border border-surface-200 text-surface-600 hover:bg-surface-50 transition-colors shadow-md"
        title="Abrir menu"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div
          onClick={closeMobileDrawer}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 bg-white transform transition-transform duration-300 lg:hidden flex flex-col',
          mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Close button for mobile drawer */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={closeMobileDrawer}
            className="p-2 rounded-lg text-surface-400 hover:bg-surface-50 hover:text-surface-600 transition-colors"
            title="Fechar menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <SidebarContent collapsed={false} onNavigate={closeMobileDrawer} />
      </div>
    </>
  );
}
