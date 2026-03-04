'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast.error('Credenciais inválidas. Verifique e tente novamente.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      toast.error('Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();

    if (!forgotEmail) {
      toast.error('Por favor, digite seu e-mail');
      return;
    }

    setSendingReset(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: 'https://inovamed-system.vercel.app/reset-password',
      });

      if (error) {
        toast.error('Erro ao enviar e-mail de recuperacao. Verifique o e-mail e tente novamente.');
        return;
      }

      toast.success('E-mail de recuperacao enviado! Verifique sua caixa de entrada.');
      setForgotEmail('');
      setShowForgotPassword(false);
    } catch (err) {
      toast.error('Erro ao solicitar recuperacao de senha');
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-950 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-brand-400 rounded-full blur-3xl" />
          <div className="absolute bottom-32 right-16 w-96 h-96 bg-medical-400 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 px-16 max-w-lg">
          {/* LGPD Badge */}
          <div className="flex items-center gap-2 mb-6 bg-green-900/30 border border-green-700/40 rounded-lg px-4 py-2 w-fit">
            <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-sm font-medium text-green-300">Em conformidade com a LGPD</span>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-brand-500 rounded-xl flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-display font-bold text-white">Inovamed</h1>
          </div>
          <h2 className="text-2xl font-display font-semibold text-white/90 mb-4">
            Sistema de Escleroterapia
          </h2>
          <p className="text-brand-200 text-lg leading-relaxed">
            Gestão completa de atendimentos, prontuários eletrônicos e faturamento SUS integrado.
          </p>
          <div className="mt-12 flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-white">BPA-I</div>
              <div className="text-sm text-brand-300">Integrado</div>
            </div>
            <div className="w-px h-12 bg-brand-700" />
            <div className="text-center">
              <div className="text-3xl font-bold text-white">SUS</div>
              <div className="text-sm text-brand-300">Faturamento</div>
            </div>
            <div className="w-px h-12 bg-brand-700" />
            <div className="text-center">
              <div className="text-3xl font-bold text-white">
                <svg className="w-8 h-8 mx-auto text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="text-sm text-brand-300">LGPD</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-surface-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <span className="text-xl font-display font-bold text-surface-800">Inovamed</span>
          </div>

          <h2 className="text-2xl font-display font-bold text-surface-900 mb-2">
            Acesse sua conta
          </h2>
          <p className="text-surface-500 mb-8">
            Entre com suas credenciais para acessar o sistema
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="input-label">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="seu@email.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="input-label">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium mt-2"
              >
                Esqueci minha senha
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando...
                </div>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-surface-400">
            Inovamed &copy; {new Date().getFullYear()} &mdash; Todos os direitos reservados
          </p>
        </div>

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
              <h3 className="font-display font-semibold text-surface-800 text-lg">Recuperar Senha</h3>

              <p className="text-sm text-surface-600">
                Digite seu e-mail para receber um link de recuperacao de senha:
              </p>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="input-label">E-mail</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="input-field"
                    placeholder="seu@email.com"
                    required
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotEmail('');
                    }}
                    className="flex-1 btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={sendingReset}
                    className="flex-1 btn-primary"
                  >
                    {sendingReset ? (
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Enviando...
                      </div>
                    ) : (
                      'Enviar'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
