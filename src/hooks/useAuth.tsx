'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profissional, Empresa, Unidade, UserRole } from '@/types';

interface AuthState {
  user: Profissional | null;
  empresas: Empresa[];
  unidades: Unidade[];
  selectedEmpresa: Empresa | null;
  selectedUnidade: Unidade | null;
  loading: boolean;
  setSelectedEmpresa: (e: Empresa) => void;
  setSelectedUnidade: (u: Unidade) => void;
  signOut: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profissional | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [selectedUnidade, setSelectedUnidade] = useState<Unidade | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => { loadUser(); }, []);

  async function loadUser() {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      const { data: prof } = await supabase
        .from('profissionais').select('*, empresa:empresas(*)')
        .eq('user_id', authUser.id).single();

      if (!prof) { setLoading(false); return; }
      setUser(prof);

      // Load empresas
      const { data: emps } = await supabase.from('empresas').select('*');
      setEmpresas(emps || []);

      // Load unidades based on role
      let allUnidades: Unidade[] = [];
      if (prof.role === 'admin' || prof.role === 'gestor') {
        const { data } = await supabase.from('unidades').select('*, municipio:municipios(*)').eq('ativo', true);
        allUnidades = data || [];
      } else {
        const { data: profUnidades } = await supabase
          .from('profissional_unidades').select('unidade:unidades(*, municipio:municipios(*))')
          .eq('profissional_id', prof.id);
        allUnidades = profUnidades?.map((pu: any) => pu.unidade).filter(Boolean) || [];
      }
      setUnidades(allUnidades);

      // Restore selections from localStorage (reuse loaded data, no duplicate query)
      const savedEmpresa = localStorage.getItem('selected_empresa');
      const savedUnidade = localStorage.getItem('selected_unidade');
      if (savedEmpresa && emps) {
        const emp = emps.find(e => e.id === savedEmpresa);
        if (emp) setSelectedEmpresa(emp);
      }
      if (savedUnidade && allUnidades.length) {
        const uni = allUnidades.find((u: Unidade) => u.id === savedUnidade);
        if (uni) setSelectedUnidade(uni);
      }
    } catch (err) {
      console.error('Error loading user:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSetEmpresa(e: Empresa) {
    setSelectedEmpresa(e);
    localStorage.setItem('selected_empresa', e.id);
  }

  function handleSetUnidade(u: Unidade) {
    setSelectedUnidade(u);
    localStorage.setItem('selected_unidade', u.id);
  }

  async function signOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('selected_empresa');
    localStorage.removeItem('selected_unidade');
    window.location.href = '/login';
  }

  function hasRole(...roles: UserRole[]) {
    if (!user) return false;
    return roles.includes(user.role);
  }

  return (
    <AuthContext.Provider value={{
      user, empresas, unidades, selectedEmpresa, selectedUnidade, loading,
      setSelectedEmpresa: handleSetEmpresa, setSelectedUnidade: handleSetUnidade,
      signOut, hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
