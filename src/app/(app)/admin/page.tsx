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
  const [editingProf, setEditingProf] = useState<Profissional | null>(null);
  const [editingUnidade, setEditingUnidade] = useState<Unidade | null>(null);
  const [editingMunicipio, setEditingMunicipio] = useState<Municipio | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<Profissional | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [profForm, setProfForm] = useState({
    email: '',
    password: '',
    nome_completo: '',
    cns: '',
    cpf: '',
    cbo: '225203',
    crm: '',
    role: 'medico' as UserRole,
    municipio_id: '',
  });
  const [unidadeForm, setUnidadeForm] = useState({ municipio_id: '', nome: '', cnes: '', endereco: '' });
  const [unidadeEditForm, setUnidadeEditForm] = useState({ municipio_id: '', nome: '', cnes: '', endereco: '' });
  const [munForm, setMunForm] = useState({ nome: '', codigo_ibge: '', uf: 'BA' });

  // Role guard - redirect if not admin
  if (user && !hasRole('admin')) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <EmptyState icon="ð" title="Acesso Restrito" description="Voce nao tem permissao para acessar esta pagina." />
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
    if (!result.success) {
      toast.error(result.error.errors[0]?.message || 'Dados invalidos');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({...result.data, municipio_id: profForm.role === 'recepcionista' ? profForm.municipio_id : undefined}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar usuÃ¡rio');

      toast.success('UsuÃ¡rio criado com sucesso');
      setProfForm({
        email: '',
        password: '',
        nome_completo: '',
        cns: '',
        cpf: '',
        cbo: '225203',
        crm: '',
        role: 'medico',
        municipio_id: '',
      });
      setShowForm(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar usuÃ¡rio');
    } finally {
      setLoading(false);
    }
  }

  async function editProfissional() {
    if (!editingProf) return;

    const updateData: any = {
      nome_completo: profForm.nome_completo,
      crm: profForm.crm,
      cbo: profForm.cbo,
      role: profForm.role,
      cpf: profForm.cpf || null,
      cns: profForm.cns || null,
      municipio_id: profForm.role === 'recepcionista' ? (profForm.municipio_id || null) : null,
    };

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profissionais')
        .update(updateData)
        .eq('id', editingProf.id);

      if (error) throw error;

      // If recepcionista with municipio, relink to unidades
      if (profForm.role === 'recepcionista' && profForm.municipio_id && editingProf) {
        await supabase.from('profissional_unidades').delete().eq('profissional_id', editingProf.id);
        const { data: unis } = await supabase.from('unidades').select('id').eq('municipio_id', profForm.municipio_id).eq('ativo', true);
        if (unis && unis.length > 0) {
          await supabase.from('profissional_unidades').insert(unis.map(u => ({ profissional_id: editingProf.id, unidade_id: u.id })));
        }
      }
      toast.success('UsuÃ¡rio atualizado com sucesso');
      setEditingProf(null);
      setProfForm({
        email: '',
        password: '',
        nome_completo: '',
        cns: '',
        cpf: '',
        cbo: '225203',
        crm: '',
        role: 'medico',
        municipio_id: '',
      });
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar usuÃ¡rio');
    } finally {
      setLoading(false);
    }
  }

  function startEditingProf(prof: Profissional) {
    setEditingProf(prof);
    setProfForm({
      email: prof.email || '',
      password: '',
      nome_completo: prof.nome_completo || '',
      cns: prof.cns || '',
      cpf: prof.cpf || '',
      cbo: prof.cbo || '225203',
      crm: prof.crm || '',
      role: prof.role || 'medico',
      municipio_id: prof.municipio_id || '',
    });
    setTab('profissionais');
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingProf(null);
    setProfForm({
      email: '',
      password: '',
      nome_completo: '',
      cns: '',
      cpf: '',
      cbo: '225203',
      crm: '',
      role: 'medico',
      municipio_id: '',
    });
  }

  function openPasswordModal(prof: Profissional) {
    setShowPasswordModal(prof);
    setGeneratedPassword('');
  }

  function generatePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  async function resetPassword() {
    if (!showPasswordModal || !generatedPassword) {
      toast.error('Gere uma senha primeiro');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: showPasswordModal.user_id,
          password: generatedPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao resetar senha');

      toast.success('Senha resetada com sucesso! Compartilhe com o usuario.');
      setShowPasswordModal(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao resetar senha');
    } finally {
      setLoading(false);
    }
  }

  async function createUnidade() {
    const result = unidadeSchema.safeParse(unidadeForm);
    if (!result.success) {
      toast.error(result.error.errors[0]?.message || 'Dados invalidos');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('unidades').insert(result.data);
      if (error) throw error;
      toast.success('Unidade criada');
      setUnidadeForm({ municipio_id: '', nome: '', cnes: '', endereco: '' });
      setShowForm(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createMunicipio() {
    const result = municipioSchema.safeParse(munForm);
    if (!result.success) {
      toast.error(result.error.errors[0]?.message || 'Dados invalidos');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('municipios').insert(result.data);
      if (error) throw error;
      toast.success('Municipio criado');
      setMunForm({ nome: '', codigo_ibge: '', uf: 'BA' });
      setShowForm(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startEditingUnidade(u: Unidade) {
    setEditingUnidade(u);
    setUnidadeEditForm({
      municipio_id: u.municipio_id || '',
      nome: u.nome || '',
      cnes: u.cnes || '',
      endereco: u.endereco || '',
    });
    setTab('unidades');
    setShowForm(false);
  }

  async function editUnidade() {
    if (!editingUnidade) return;

    const updateData = {
      municipio_id: unidadeEditForm.municipio_id,
      nome: unidadeEditForm.nome,
      cnes: unidadeEditForm.cnes,
      endereco: unidadeEditForm.endereco,
    };

    setLoading(true);
    try {
      const { error } = await supabase
        .from('unidades')
        .update(updateData)
        .eq('id', editingUnidade.id);

      if (error) throw error;

      toast.success('Unidade atualizada com sucesso');
      setEditingUnidade(null);
      setUnidadeEditForm({ municipio_id: '', nome: '', cnes: '', endereco: '' });
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar unidade');
    } finally {
      setLoading(false);
    }
  }

  
  function deleteUnidade(u: Unidade) {
    const senha = window.prompt('Digite a senha de confirma\u00e7\u00e3o para excluir:');
    if (senha !== 'Margotti') { if (senha !== null) toast.error('Senha de confirma\u00e7\u00e3o incorreta.'); return; }
    confirm({
      title: 'Excluir Unidade',
      description: `Tem certeza que deseja excluir permanentemente a unidade "${u.nome}" (CNES: ${u.cnes})? Esta aÃ§Ã£o nÃ£o pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Excluir Permanentemente',
      onConfirm: async () => {
        try {
          // Check if unidade has profissionais linked
          const { count } = await supabase
            .from('profissional_unidades')
            .select('id', { count: 'exact', head: true })
            .eq('unidade_id', u.id);
          if (count && count > 0) {
            // Delete profissional_unidades links first
            await supabase.from('profissional_unidades').delete().eq('unidade_id', u.id);
          }
          // Check for atendimentos
          const { count: atendCount } = await supabase
            .from('atendimentos')
            .select('id', { count: 'exact', head: true })
            .eq('unidade_id', u.id);
          if (atendCount && atendCount > 0) {
            toast.error(`Esta unidade possui ${atendCount} atendimento(s). NÃ£o Ã© possÃ­vel excluir.`);
            return;
          }
          const { error } = await supabase.from('unidades').delete().eq('id', u.id);
          if (error) throw error;
          setUnidades(prev => prev.filter(x => x.id !== u.id));
          toast.success('Unidade excluÃ­da com sucesso!');
        } catch (err: any) {
          toast.error(err.message || 'Erro ao excluir unidade');
        }
      }
    });
  }

  function deleteMunicipio(m: Municipio) {
    const senha = window.prompt('Digite a senha de confirma\u00e7\u00e3o para excluir:');
    if (senha !== 'Margotti') { if (senha !== null) toast.error('Senha de confirma\u00e7\u00e3o incorreta.'); return; }
    confirm({
      title: 'Excluir MunicÃ­pio',
      description: `Tem certeza que deseja excluir permanentemente o municÃ­pio "${m.nome}"? Esta aÃ§Ã£o nÃ£o pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Excluir Permanentemente',
      onConfirm: async () => {
        try {
          // Check if municipio has unidades linked
          const { count } = await supabase
            .from('unidades')
            .select('id', { count: 'exact', head: true })
            .eq('municipio_id', m.id);
          if (count && count > 0) {
            toast.error(`Este municÃ­pio possui ${count} unidade(s) vinculada(s). Exclua as unidades primeiro.`);
            return;
          }
          const { error } = await supabase.from('municipios').delete().eq('id', m.id);
          if (error) throw error;
          setMunicipios(prev => prev.filter(x => x.id !== m.id));
          toast.success('MunicÃ­pio excluÃ­do com sucesso!');
        } catch (err: any) {
          toast.error(err.message || 'Erro ao excluir municÃ­pio');
        }
      }
    });
  }

  function cancelEditUnidade() {
    setEditingUnidade(null);
    setUnidadeEditForm({ municipio_id: '', nome: '', cnes: '', endereco: '' });
  }

  function startEditingMunicipio(m: Municipio) {
    setEditingMunicipio(m);
    setMunForm({
      nome: m.nome || '',
      codigo_ibge: m.codigo_ibge || '',
      uf: m.uf || 'BA',
    });
    setTab('municipios');
    setShowForm(false);
  }

  async function editMunicipio() {
    if (!editingMunicipio) return;

    const updateData = {
      nome: munForm.nome,
      codigo_ibge: munForm.codigo_ibge,
      uf: munForm.uf,
    };

    setLoading(true);
    try {
      const { error } = await supabase
        .from('municipios')
        .update(updateData)
        .eq('id', editingMunicipio.id);

      if (error) throw error;

      toast.success('Municipio atualizado com sucesso');
      setEditingMunicipio(null);
      setMunForm({ nome: '', codigo_ibge: '', uf: 'BA' });
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar municipio');
    } finally {
      setLoading(false);
    }
  }

  function cancelEditMunicipio() {
    setEditingMunicipio(null);
    setMunForm({ nome: '', codigo_ibge: '', uf: 'BA' });
  }

  function toggleProfissional(prof: Profissional) {
    confirm({
      title: prof.ativo ? 'Desativar UsuÃ¡rio' : 'Ativar UsuÃ¡rio',
      description: `Confirma ${prof.ativo ? 'desativacao' : 'ativacao'} de ${prof.nome_completo}?`,
      variant: prof.ativo ? 'warning' : 'default',
      confirmLabel: prof.ativo ? 'Desativar' : 'Ativar',
      onConfirm: async () => {
        await supabase.from('profissionais').update({ ativo: !prof.ativo }).eq('id', prof.id);
        toast.success(`Profissional ${prof.ativo ? 'desativado' : 'ativado'}`);
        loadData();
        closeConfirm();
      },
    });
  }

  function deleteProfissional(prof: Profissional) {
    const senha = window.prompt('Digite a senha de confirma\u00e7\u00e3o para excluir:');
    if (senha !== 'Margotti') { if (senha !== null) toast.error('Senha de confirma\u00e7\u00e3o incorreta.'); return; }
    confirm({
      title: 'Excluir UsuÃ¡rio',
      description: `Tem certeza que deseja excluir permanentemente o cadastro de ${prof.nome_completo}? Esta acao nao pode ser desfeita. Se o profissional possui atendimentos, prefira desativa-lo.`,
      variant: 'danger',
      confirmLabel: 'Excluir Permanentemente',
      onConfirm: async () => {
        try {
          const res = await fetch('/api/admin/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profissional_id: prof.id,
              user_id: prof.user_id,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Erro ao excluir usuÃ¡rio');

          if (data.warning) {
            toast.warning(data.warning);
          } else {
            toast.success('UsuÃ¡rio excluÃ­do com sucesso');
          }
          loadData();
          closeConfirm();
        } catch (err: any) {
          toast.error(err.message || 'Erro ao excluir usuÃ¡rio');
          closeConfirm();
        }
      },
    });
  }

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'profissionais', label: 'UsuÃ¡rios' },
    { key: 'unidades', label: 'Unidades/CNES' },
    { key: 'municipios', label: 'Municipios' },
  ];

  return (
    <div className="pt-16 lg:pt-0 p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Administracao"
        subtitle="Gestao de profissionais, unidades e municipios"
        action={
          editingProf || editingUnidade || editingMunicipio ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  cancelEdit();
                  cancelEditUnidade();
                  cancelEditMunicipio();
                }}
                className="btn-secondary text-sm"
              >
                Cancelar Edicao
              </button>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Novo Cadastro</button>
          )
        }
      />

      <div className="flex gap-1 p-1 bg-surface-100 rounded-xl mb-6 max-w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setShowForm(false);
              if (editingProf) cancelEdit();
              if (editingUnidade) cancelEditUnidade();
              if (editingMunicipio) cancelEditMunicipio();
            }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.key
                ? 'bg-white text-surface-800 shadow-sm'
                : 'text-surface-500 hover:text-surface-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* CREATE/EDIT FORM */}
      {(showForm || editingProf || editingUnidade || editingMunicipio) && (
        <div className="card p-6 mb-6">
          {editingProf && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-surface-800">Editar UsuÃ¡rio</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="input-label">E-mail</label>
                  <input
                    type="email"
                    value={profForm.email}
                    disabled
                    className="input-field opacity-50 cursor-not-allowed"
                  />
                  <p className="text-xs text-surface-500 mt-1">Email nao pode ser alterado</p>
                </div>
                <div className="md:col-span-2">
                  <label className="input-label">Nome Completo</label>
                  <input
                    type="text"
                    value={profForm.nome_completo}
                    onChange={(e) => setProfForm({ ...profForm, nome_completo: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="input-label">CPF</label>
                  <input
                    type="text"
                    value={profForm.cpf}
                    onChange={(e) => setProfForm({ ...profForm, cpf: e.target.value })}
                    className="input-field"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="input-label">CNS</label>
                  <input
                    type="text"
                    value={profForm.cns}
                    onChange={(e) => setProfForm({ ...profForm, cns: e.target.value })}
                    className="input-field"
                  />
                </div>
                {(profForm.role === 'medico') && (<>
                <div>
                  <label className="input-label">CRM</label>
                  <input
                    type="text"
                    value={profForm.crm}
                    onChange={(e) => setProfForm({ ...profForm, crm: e.target.value })}
                    className="input-field"
                    placeholder="CRM-BA 00000"
                  />
                </div>
                <div>
                  <label className="input-label">CBO</label>
                  <input
                    type="text"
                    value={profForm.cbo}
                    onChange={(e) => setProfForm({ ...profForm, cbo: e.target.value })}
                    className="input-field"
                    placeholder="225203"
                  />
                </div>
                </>)}
                <div>
                  <label className="input-label">Perfil de Acesso</label>
                  <select
                    value={profForm.role}
                    onChange={(e) => setProfForm({ ...profForm, role: e.target.value as UserRole })}
                    className="input-field"
                  >
                    <option value="admin">Administrador</option>
                    <option value="medico">Medico</option>
                    <option value="recepcionista">Recepcionista</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={cancelEdit} className="btn-secondary">Cancelar</button>
                <button onClick={editProfissional} disabled={loading} className="btn-primary">
                  {loading ? 'Atualizando...' : 'Atualizar UsuÃ¡rio'}
                </button>
              </div>
            </div>
          )}

          {editingUnidade && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-surface-800">Editar Unidade</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Municipio</label>
                  <select
                    value={unidadeEditForm.municipio_id}
                    onChange={(e) => setUnidadeEditForm({ ...unidadeEditForm, municipio_id: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Selecione...</option>
                    {municipios.map(m => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="input-label">CNES</label>
                  <input
                    type="text"
                    value={unidadeEditForm.cnes}
                    onChange={(e) => setUnidadeEditForm({ ...unidadeEditForm, cnes: e.target.value })}
                    className="input-field"
                    maxLength={7}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="input-label">Nome da Unidade</label>
                  <input
                    type="text"
                    value={unidadeEditForm.nome}
                    onChange={(e) => setUnidadeEditForm({ ...unidadeEditForm, nome: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="input-label">Endereco</label>
                  <input
                    type="text"
                    value={unidadeEditForm.endereco}
                    onChange={(e) => setUnidadeEditForm({ ...unidadeEditForm, endereco: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={cancelEditUnidade} className="btn-secondary">Cancelar</button>
                <button onClick={editUnidade} disabled={loading} className="btn-primary">
                  {loading ? 'Atualizando...' : 'Atualizar Unidade'}
                </button>
              </div>
            </div>
          )}

          {editingMunicipio && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-surface-800">Editar Municipio</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="input-label">Nome</label>
                  <input
                    type="text"
                    value={munForm.nome}
                    onChange={(e) => setMunForm({ ...munForm, nome: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="input-label">Codigo IBGE</label>
                  <input
                    type="text"
                    value={munForm.codigo_ibge}
                    onChange={(e) => setMunForm({ ...munForm, codigo_ibge: e.target.value })}
                    className="input-field"
                    maxLength={7}
                  />
                </div>
                <div>
                  <label className="input-label">UF</label>
                  <input
                    type="text"
                    value={munForm.uf}
                    onChange={(e) => setMunForm({ ...munForm, uf: e.target.value })}
                    className="input-field"
                    maxLength={2}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={cancelEditMunicipio} className="btn-secondary">Cancelar</button>
                <button onClick={editMunicipio} disabled={loading} className="btn-primary">
                  {loading ? 'Atualizando...' : 'Atualizar Municipio'}
                </button>
              </div>
            </div>
          )}

          {tab === 'profissionais' && !editingProf && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-surface-800">Novo UsuÃ¡rio</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="input-label">E-mail (login)</label>
                  <input
                    type="email"
                    value={profForm.email}
                    onChange={(e) => setProfForm({ ...profForm, email: e.target.value })}
                    className="input-field"
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className="input-label">Senha</label>
                  <input
                    type="password"
                    value={profForm.password}
                    onChange={(e) => setProfForm({ ...profForm, password: e.target.value })}
                    className="input-field"
                    placeholder="Minimo 6 caracteres"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="input-label">Nome Completo</label>
                  <input
                    type="text"
                    value={profForm.nome_completo}
                    onChange={(e) => setProfForm({ ...profForm, nome_completo: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="input-label">CPF</label>
                  <input
                    type="text"
                    value={profForm.cpf}
                    onChange={(e) => setProfForm({ ...profForm, cpf: e.target.value })}
                    className="input-field"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="input-label">CNS</label>
                  <input
                    type="text"
                    value={profForm.cns}
                    onChange={(e) => setProfForm({ ...profForm, cns: e.target.value })}
                    className="input-field"
                  />
                </div>
                {(profForm.role === 'medico') && (<>
                <div>
                  <label className="input-label">CRM</label>
                  <input
                    type="text"
                    value={profForm.crm}
                    onChange={(e) => setProfForm({ ...profForm, crm: e.target.value })}
                    className="input-field"
                    placeholder="CRM-BA 00000"
                  />
                </div>
                <div>
                  <label className="input-label">CBO</label>
                  <input
                    type="text"
                    value={profForm.cbo}
                    onChange={(e) => setProfForm({ ...profForm, cbo: e.target.value })}
                    className="input-field"
                    placeholder="225203"
                  />
                </div>
                </>)}
                <div>
                  <label className="input-label">Perfil de Acesso</label>
                  <select
                    value={profForm.role}
                    onChange={(e) => setProfForm({ ...profForm, role: e.target.value as UserRole })}
                    className="input-field"
                  >
                    <option value="admin">Administrador</option>
                                        <option value="medico">Medico</option>
                    <option value="gestor">Gestor</option>
                    <option value="recepcionista">Recepcionista</option>
                  </select>
                </div>
                {profForm.role === 'recepcionista' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Municipio</label>
                    <select
                      value={profForm.municipio_id}
                      onChange={(e) => setProfForm({ ...profForm, municipio_id: e.target.value })}
                      className="input-field"
                    >
                      <option value="">Selecione um municipio</option>
                      {municipios.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} - {m.uf}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={createProfissional} disabled={loading} className="btn-primary">
                  {loading ? 'Criando...' : 'Criar Profissional'}
                </button>
              </div>
            </div>
          )}

          {tab === 'unidades' && !editingProf && !editingUnidade && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-surface-800">Nova Unidade</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Municipio</label>
                  <select
                    value={unidadeForm.municipio_id}
                    onChange={(e) => setUnidadeForm({ ...unidadeForm, municipio_id: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Selecione...</option>
                    {municipios.map(m => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="input-label">CNES</label>
                  <input
                    type="text"
                    value={unidadeForm.cnes}
                    onChange={(e) => setUnidadeForm({ ...unidadeForm, cnes: e.target.value })}
                    className="input-field"
                    maxLength={7}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="input-label">Nome da Unidade</label>
                  <input
                    type="text"
                    value={unidadeForm.nome}
                    onChange={(e) => setUnidadeForm({ ...unidadeForm, nome: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={createUnidade} disabled={loading} className="btn-primary">
                  {loading ? 'Criando...' : 'Criar Unidade'}
                </button>
              </div>
            </div>
          )}

          {tab === 'municipios' && !editingProf && !editingMunicipio && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-surface-800">Novo Municipio</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="input-label">Nome</label>
                  <input
                    type="text"
                    value={munForm.nome}
                    onChange={(e) => setMunForm({ ...munForm, nome: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="input-label">Codigo IBGE</label>
                  <input
                    type="text"
                    value={munForm.codigo_ibge}
                    onChange={(e) => setMunForm({ ...munForm, codigo_ibge: e.target.value })}
                    className="input-field"
                    maxLength={7}
                  />
                </div>
                <div>
                  <label className="input-label">UF</label>
                  <input
                    type="text"
                    value={munForm.uf}
                    onChange={(e) => setMunForm({ ...munForm, uf: e.target.value })}
                    className="input-field"
                    maxLength={2}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
                <button onClick={createMunicipio} disabled={loading} className="btn-primary">
                  {loading ? 'Criando...' : 'Criar Municipio'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DATA TABLES & CARDS */}
      <div className="card">
        {tab === 'profissionais' && (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="px-5 py-3 text-left">Nome</th>
                    <th className="px-5 py-3 text-left">CPF</th>
                    <th className="px-5 py-3 text-left">CRM</th>
                    <th className="px-5 py-3 text-left">CBO</th>
                    <th className="px-5 py-3 text-left">Perfil</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-center">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {profissionais.map(p => (
                    <tr key={p.id} className="table-row">
                      <td className="px-5 py-3 font-medium text-surface-800">{p.nome_completo}</td>
                      <td className="px-5 py-3 text-surface-500 font-mono text-xs">{p.cpf || 'â'}</td>
                      <td className="px-5 py-3 text-surface-500">{p.crm || 'â'}</td>
                      <td className="px-5 py-3 text-surface-500">{p.cbo}</td>
                      <td className="px-5 py-3">
                        <span className="badge bg-brand-100 text-brand-700 capitalize">{p.role}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`badge ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-center flex-wrap text-xs">
                          <button
                            onClick={() => startEditingProf(p)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => openPasswordModal(p)}
                            className="text-orange-600 hover:text-orange-800 font-medium"
                          >
                            Senha
                          </button>
                          <button
                            onClick={() => toggleProfissional(p)}
                            className="text-surface-500 hover:text-surface-700"
                          >
                            {p.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            onClick={() => deleteProfissional(p)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS */}
            <div className="md:hidden space-y-3 p-4">
              {profissionais.map(p => (
                <div key={p.id} className="border border-surface-200 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <p className="font-semibold text-surface-800">{p.nome_completo}</p>
                      <p className="text-xs text-surface-500 font-mono">{p.cpf || 'CPF nao informado'}</p>
                    </div>
                    <span className={`badge text-xs ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-surface-600 text-xs">CRM</p>
                      <p className="font-medium text-surface-800">{p.crm || 'â'}</p>
                    </div>
                    <div>
                      <p className="text-surface-600 text-xs">CBO</p>
                      <p className="font-medium text-surface-800">{p.cbo}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-surface-600 text-xs">Perfil</p>
                    <span className="badge bg-brand-100 text-brand-700 capitalize text-xs inline-block">{p.role}</span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => startEditingProf(p)}
                      className="flex-1 btn-sm bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => openPasswordModal(p)}
                      className="flex-1 btn-sm bg-orange-50 text-orange-700 hover:bg-orange-100 text-xs"
                    >
                      Senha
                    </button>
                    <button
                      onClick={() => toggleProfissional(p)}
                      className="flex-1 btn-sm bg-surface-100 text-surface-700 hover:bg-surface-200 text-xs"
                    >
                      {p.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => deleteProfissional(p)}
                      className="flex-1 btn-sm bg-red-50 text-red-700 hover:bg-red-100 text-xs"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {profissionais.length === 0 && (
                <div className="text-center py-8 text-surface-500">
                  Nenhum profissional cadastrado
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'unidades' && (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="px-5 py-3 text-left">Municipio</th>
                    <th className="px-5 py-3 text-left">Unidade</th>
                    <th className="px-5 py-3 text-left">CNES</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-center">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {unidades.map(u => (
                    <tr key={u.id} className="table-row">
                      <td className="px-5 py-3 font-medium text-surface-800">{(u as any).municipio?.nome}</td>
                      <td className="px-5 py-3 text-surface-600">{u.nome}</td>
                      <td className="px-5 py-3 font-mono text-surface-500">{u.cnes}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`badge ${u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-center text-xs">
                          <button
                            onClick={() => startEditingUnidade(u)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteUnidade(u)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS */}
            <div className="md:hidden space-y-3 p-4">
              {unidades.map(u => (
                <div key={u.id} className="border border-surface-200 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-surface-600 mb-1">{(u as any).municipio?.nome}</p>
                      <p className="font-semibold text-surface-800">{u.nome}</p>
                    </div>
                    <span className={`badge text-xs ${u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div>
                    <p className="text-surface-600 text-xs">CNES</p>
                    <p className="font-mono text-surface-800">{u.cnes}</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => startEditingUnidade(u)}
                      className="flex-1 btn-sm bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
              {unidades.length === 0 && (
                <div className="text-center py-8 text-surface-500">
                  Nenhuma unidade cadastrada
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'municipios' && (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="px-5 py-3 text-left">Nome</th>
                    <th className="px-5 py-3 text-left">Codigo IBGE</th>
                    <th className="px-5 py-3 text-left">UF</th>
                    <th className="px-5 py-3 text-center">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {municipios.map(m => (
                    <tr key={m.id} className="table-row">
                      <td className="px-5 py-3 font-medium text-surface-800">{m.nome}</td>
                      <td className="px-5 py-3 font-mono text-surface-500">{m.codigo_ibge}</td>
                      <td className="px-5 py-3 text-surface-500">{m.uf}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-center text-xs">
                          <button
                            onClick={() => startEditingMunicipio(m)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteMunicipio(m)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS */}
            <div className="md:hidden space-y-3 p-4">
              {municipios.map(m => (
                <div key={m.id} className="border border-surface-200 rounded-lg p-4 space-y-3">
                  <p className="font-semibold text-surface-800">{m.nome}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-surface-600 text-xs">Codigo IBGE</p>
                      <p className="font-mono text-surface-800">{m.codigo_ibge}</p>
                    </div>
                    <div>
                      <p className="text-surface-600 text-xs">UF</p>
                      <p className="font-medium text-surface-800">{m.uf}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => startEditingMunicipio(m)}
                      className="flex-1 btn-sm bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
              {municipios.length === 0 && (
                <div className="text-center py-8 text-surface-500">
                  Nenhum municipio cadastrado
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* PASSWORD RESET MODAL */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display font-semibold text-surface-800">Resetar Senha</h3>
            <div className="bg-surface-50 p-4 rounded-lg">
              <p className="text-sm text-surface-600 mb-1">Profissional:</p>
              <p className="font-medium text-surface-800">{showPasswordModal.nome_completo}</p>
            </div>

            {generatedPassword ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-blue-900">Nova Senha Gerada:</p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 bg-white p-2 rounded font-mono text-sm text-blue-700 break-all">
                    {generatedPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedPassword);
                      toast.success('Senha copiada para clipboard');
                    }}
                    className="btn-secondary text-xs py-1 px-2"
                  >
                    Copiar
                  </button>
                </div>
                <p className="text-xs text-blue-700">Compartilhe esta senha com seguranca com o usuario.</p>
              </div>
            ) : (
              <button
                onClick={() => setGeneratedPassword(generatePassword())}
                className="w-full btn-primary"
              >
                Gerar Nova Senha
              </button>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setShowPasswordModal(null);
                  setGeneratedPassword('');
                }}
                className="flex-1 btn-secondary"
              >
                Cancelar
              </button>
              {generatedPassword && (
                <button
                  onClick={resetPassword}
                  disabled={loading}
                  className="flex-1 btn-primary"
                >
                  {loading ? 'Enviando...' : 'Confirmar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
