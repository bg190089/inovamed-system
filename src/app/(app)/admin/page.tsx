'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { profissionalSchema, unidadeSchema, municipioSchema } from '@/lib/validations/schemas';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ConfirmDialog, PageHeader, EmptyState } from '@/components/ui';
import type { Profissional, Unidade, Municipio, UserRole } from '@/types';

type AdminTab = 'profissionais' | 'unidades' | 'municipios';

export default function AdminPage() {
  const { user, hasRole } = useAuth();
  const supabase = useSupabase();
  const { state: confirmState, confirm, close: closeConfirm } = useConfirmDialog();

  const [tab, setTab] = useState<AdminTab>('profissionais');
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [profForm, setProfForm] = useState({ email: '', password: '', nome_completo: '', cns: '', cpf: '', cbo: '225203', crm: '', role: 'medico' as UserRole });
  const [unidadeForm, setUnidadeForm] = useState({ municipio_id: '', nome: '', cnes: '', endereco: '' });
  const [munForm, setMunForm] = useState({ nome: '', codigo_ibge: '', uf: 'BA' });

  // Role guard - redirect if not admin
  if (user && !hasRole('admin')) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <EmptyState icon="🔒" title="Acesso Restrito" description="Voce nao tem permissao para acessar esta pagina." />
      </div>
    );
  }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [{ data: profs }, { data: unis }, { data: muns }] = await Promise.all([
      supabase.from('profissionais').select('*, empresa:empresas(*)'),
      supabase.from('unidades').select('*, municipio:municipios(*)'),
      supabase.from('municipios').select('*').order('nome'),
    ]);
    setProfissionais(profs || []);
    setUnidades(unis || []);
    setMunicipios(muns || []);
  }

  async function createProfissional() {
    const result = profissionalSchema.safeParse(profForm);
    if (!result.success) { toast.error(result.error.errors[0]?.message || 'Dados invalidos'); return; }
    setLoading(true);
    try {
      // Use server-side API route instead of client-side signUp
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar profissional');

      toast.success('Profissional criado com sucesso');
      setProfForm({ email: '', password: '', nome_completo: '', cns: '', cpf: '', cbo: '225203', crm: '', role: 'medico' });
      setShowForm(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar profissional');
    } finally { setLoading(false); }
  }

  async function createUnidade() {
    const result = unidadeSchema.safeParse(unidadeForm);
    if (!result.success) { toast.error(result.error.errors[0]?.message || 'Dados invalidos'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from('unidades').insert(result.data);
      if (error) throw error;
      toast.success('Unidade criada');
      setUnidadeForm({ municipio_id: '', nome: '', cnes: '', endereco: '' });
      setShowForm(false); loadData();
    } catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  }

  async function createMunicipio() {
    const result = municipioSchema.safeParse(munForm);
    if (!result.success) { toast.error(result.error.errors[0]?.message || 'Dados invalidos'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from('municipios').insert(result.data);
      if (error) throw error;
      toast.success('Municipio criado');
      setMunForm({ nome: '', codigo_ibge: '', uf: 'BA' });
      setShowForm(false); loadData();
    } catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  }

  function toggleProfissional(prof: Profissional) {
    confirm({
      title: prof.ativo ? 'Desativar Profissional' : 'Ativar Profissional',
      description: `Confirma ${prof.ativo ? 'desativacao' : 'ativacao'} de ${prof.nome_completo}?`,
      variant: prof.ativo ? 'warning' : 'default',
      confirmLabel: prof.ativo ? 'Desativar' : 'Ativar',
      onConfirm: async () => {
        await supabase.from('profissionais').update({ ativo: !prof.ativo }).eq('id', prof.id);
        toast.success(`Profissional ${prof.ativo ? 'desativado' : 'ativado'}`);
        loadData(); closeConfirm();
      },
    });
  }

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'profissionais', label: 'Profissionais' },
    { key: 'unidades', label: 'Unidades/CNES' },
    { key: 'municipios', label: 'Municipios' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Administracao" subtitle="Gestao de profissionais, unidades e municipios"
        action={<button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Novo Cadastro</button>} />

      <div className="flex gap-1 p-1 bg-surface-100 rounded-xl mb-6 max-w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); }}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all', tab === t.key ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500 hover:text-surface-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          {tab === 'profissionais' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-surface-800">Novo Profissional</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label className="input-label">E-mail (login)</label><input type="email" value={profForm.email} onChange={(e) => setProfForm({ ...profForm, email: e.target.value })} className="input-field" placeholder="email@exemplo.com" /></div>
                <div><label className="input-label">Senha</label><input type="password" value={profForm.password} onChange={(e) => setProfForm({ ...profForm, password: e.target.value })} className="input-field" placeholder="Minimo 6 caracteres" /></div>
                <div className="md:col-span-2"><label className="input-label">Nome Completo</label><input type="text" value={profForm.nome_completo} onChange={(e) => setProfForm({ ...profForm, nome_completo: e.target.value })} className="input-field" /></div>
                <div><label className="input-label">CNS</label><input type="text" value={profForm.cns} onChange={(e) => setProfForm({ ...profForm, cns: e.target.value })} className="input-field" /></div>
                <div><label className="input-label">CRM</label><input type="text" value={profForm.crm} onChange={(e) => setProfForm({ ...profForm, crm: e.target.value })} className="input-field" placeholder="CRM-BA 00000" /></div>
                <div><label className="input-label">CBO</label><input type="text" value={profForm.cbo} onChange={(e) => setProfForm({ ...profForm, cbo: e.target.value })} className="input-field" placeholder="225203" /></div>
                <div><label className="input-label">Perfil de Acesso</label>
                  <select value={profForm.role} onChange={(e) => setProfForm({ ...profForm, role: e.target.value as UserRole })} className="input-field">
                    <option value="admin">Administrador</option><option value="gestor">Gestor</option><option value="medico">Medico</option><option value="recepcionista">Recepcionista</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={createProfissional} disabled={loading} className="btn-primary">{loading ? 'Criando...' : 'Criar Profissional'}</button>
              </div>
            </div>
          )}
          {tab === 'unidades' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-surface-800">Nova Unidade</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label className="input-label">Municipio</label>
                  <select value={unidadeForm.municipio_id} onChange={(e) => setUnidadeForm({ ...unidadeForm, municipio_id: e.target.value })} className="input-field">
                    <option value="">Selecione...</option>
                    {municipios.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
                <div><label className="input-label">CNES</label><input type="text" value={unidadeForm.cnes} onChange={(e) => setUnidadeForm({ ...unidadeForm, cnes: e.target.value })} className="input-field" maxLength={7} /></div>
                <div className="md:col-span-2"><label className="input-label">Nome da Unidade</label><input type="text" value={unidadeForm.nome} onChange={(e) => setUnidadeForm({ ...unidadeForm, nome: e.target.value })} className="input-field" /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={createUnidade} disabled={loading} className="btn-primary">{loading ? 'Criando...' : 'Criar Unidade'}</button>
              </div>
            </div>
          )}
          {tab === 'municipios' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-surface-800">Novo Municipio</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label className="input-label">Nome</label><input type="text" value={munForm.nome} onChange={(e) => setMunForm({ ...munForm, nome: e.target.value })} className="input-field" /></div>
                <div><label className="input-label">Codigo IBGE</label><input type="text" value={munForm.codigo_ibge} onChange={(e) => setMunForm({ ...munForm, codigo_ibge: e.target.value })} className="input-field" maxLength={7} /></div>
                <div><label className="input-label">UF</label><input type="text" value={munForm.uf} onChange={(e) => setMunForm({ ...munForm, uf: e.target.value })} className="input-field" maxLength={2} /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={createMunicipio} disabled={loading} className="btn-primary">{loading ? 'Criando...' : 'Criar Municipio'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        {tab === 'profissionais' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="table-header">
                <th className="px-5 py-3 text-left">Nome</th><th className="px-5 py-3 text-left">CRM</th>
                <th className="px-5 py-3 text-left">CNS</th><th className="px-5 py-3 text-left">CBO</th>
                <th className="px-5 py-3 text-left">Perfil</th><th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Acoes</th>
              </tr></thead>
              <tbody>
                {profissionais.map(p => (
                  <tr key={p.id} className="table-row">
                    <td className="px-5 py-3 font-medium text-surface-800">{p.nome_completo}</td>
                    <td className="px-5 py-3 text-surface-500">{p.crm || '—'}</td>
                    <td className="px-5 py-3 text-surface-500 font-mono text-xs">{p.cns || '—'}</td>
                    <td className="px-5 py-3 text-surface-500">{p.cbo}</td>
                    <td className="px-5 py-3"><span className="badge bg-brand-100 text-brand-700 capitalize">{p.role}</span></td>
                    <td className="px-5 py-3 text-center">
                      <span className={`badge ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => toggleProfissional(p)} className="text-xs text-surface-500 hover:text-surface-700">{p.ativo ? 'Desativar' : 'Ativar'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'unidades' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="table-header">
                <th className="px-5 py-3 text-left">Municipio</th><th className="px-5 py-3 text-left">Unidade</th>
                <th className="px-5 py-3 text-left">CNES</th><th className="px-5 py-3 text-center">Status</th>
              </tr></thead>
              <tbody>
                {unidades.map(u => (
                  <tr key={u.id} className="table-row">
                    <td className="px-5 py-3 font-medium text-surface-800">{(u as any).municipio?.nome}</td>
                    <td className="px-5 py-3 text-surface-600">{u.nome}</td>
                    <td className="px-5 py-3 font-mono text-surface-500">{u.cnes}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`badge ${u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'municipios' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="table-header">
                <th className="px-5 py-3 text-left">Nome</th><th className="px-5 py-3 text-left">Codigo IBGE</th><th className="px-5 py-3 text-left">UF</th>
              </tr></thead>
              <tbody>
                {municipios.map(m => (
                  <tr key={m.id} className="table-row">
                    <td className="px-5 py-3 font-medium text-surface-800">{m.nome}</td>
                    <td className="px-5 py-3 font-mono text-surface-500">{m.codigo_ibge}</td>
                    <td className="px-5 py-3 text-surface-500">{m.uf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description}
        variant={confirmState.variant} confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm} onCancel={closeConfirm} />
    </div>
  );
}
