'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { Profissional, Empresa, Unidade } from '@/types';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface AuthContextType {
  user: Profissional | null;
  empresas: Empresa[];
  unidades: Unidade[];
  selectedEmpresa: Empresa | null;
  selectedUnidade: Unidade | null;
  setSelectedEmpresa: (e: Empresa) => void;
  setSelectedUnidade: (u: Unidade) => void;
  hasRole: (role: string) => boolean;
  needsPasswordChange: boolean;
  signOut: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Profissional | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [selectedUnidade, setSelectedUnidade] = useState<Unidade | null>(null);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        router.push('/login');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadUser() {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/login'); return; }

      const { data: prof } = await supabase
        .from('profissionais')
        .select('*, empresa:empresas(*)')
        .eq('user_id', authUser.id)
        .single();

      if (!prof) { router.push('/login'); return; }

      const profissional = { ...prof, email: authUser.email };
      setUser(profissional);

      // Check if user needs to change password on first login
      if (prof.deve_trocar_senha) {
        setNeedsPasswordChange(true);
      }

      // Load empresas
      const { data: emps } = await supabase.from('empresas').select('*');
      setEmpresas(emps || []);

      // Load unidades based on role
      let unis: Unidade[] = [];
      if (prof.role === 'admin' || prof.role === 'gestor') {
        const { data } = await supabase
          .from('unidades')
          .select('*, municipio:municipios(*)')
          .eq('ativo', true)
          .order('nome');
        unis = data || [];
      } else {
        const { data: links } = await supabase
          .from('profissional_unidades')
          .select('unidade:unidades(*, municipio:municipios(*))')
          .eq('profissional_id', prof.id);
        unis = links?.map((l: any) => l.unidade).filter(Boolean) || [];
      }
      setUnidades(unis);

      // Restore selections from localStorage
      const savedEmpresa = localStorage.getItem('selectedEmpresa');
      const savedUnidade = localStorage.getItem('selectedUnidade');

      if (emps?.length) {
        const emp = savedEmpresa ? emps.find(e => e.id === savedEmpresa) : emps[0];
        setSelectedEmpresa(emp || emps[0]);
      }
      if (unis.length) {
        const uni = savedUnidade ? unis.find(u => u.id === savedUnidade) : unis[0];
        setSelectedUnidade(uni || unis[0]);
      }
    } catch (err) {
      console.error('Auth error:', err);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  function handleSetEmpresa(e: Empresa) {
    setSelectedEmpresa(e);
    localStorage.setItem('selectedEmpresa', e.id);
  }

  function handleSetUnidade(u: Unidade) {
    setSelectedUnidade(u);
    localStorage.setItem('selectedUnidade', u.id);
  }

  const hasRole = (role: string) => {
    if (!user) return false;
    return user.role === role;
  };

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <AuthContext.Provider value={{
      user, empresas, unidades,
      selectedEmpresa, selectedUnidade,
      setSelectedEmpresa: handleSetEmpresa,
      setSelectedUnidade: handleSetUnidade,
      hasRole, needsPasswordChange, signOut, loading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
