'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Empresa, Unidade } from '@/types';
import { cn } from '@/lib/utils';

export default function ContextSelector() {
  const { user, empresas, unidades, selectedEmpresa, selectedUnidade, setSelectedEmpresa, setSelectedUnidade } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'empresa' | 'unidade'>('empresa');
  const isRecepcionista = user?.role === 'recepcionista';

  // Open automatically when no selection
  useEffect(() => {
    if (isRecepcionista) {
      // Recepcionista only needs to select empresa
      if (!selectedEmpresa) setOpen(true);
    } else {
      if (!selectedEmpresa || !selectedUnidade) setOpen(true);
    }
  }, [selectedEmpresa, selectedUnidade, isRecepcionista]);

  // Listen for reopen event from Sidebar or other components
  const handleReopen = useCallback(() => {
    setStep('empresa');
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener('openContextSelector', handleReopen);
    return () => window.removeEventListener('openContextSelector', handleReopen);
  }, [handleReopen]);

  function handleSelectEmpresa(emp: Empresa) {
    setSelectedEmpresa(emp);
    // Recepcionista: skip unidade selection, auto-select based on assigned municipio
    if (isRecepcionista && unidades.length > 0) {
      setSelectedUnidade(unidades[0]);
      setOpen(false);
      return;
    }
    setStep('unidade');
  }

  function handleSelectUnidade(uni: Unidade) {
    setSelectedUnidade(uni);
    setOpen(false);
  }

  function handleClose() {
    if (isRecepcionista && selectedEmpresa) {
      setOpen(false);
    } else if (selectedEmpresa && selectedUnidade) {
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-elevated max-w-lg w-full overflow-hidden">
        <div className="bg-brand-600 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-display font-bold text-white">
              {step === 'empresa' ? 'Selecione a Empresa' : 'Selecione a Unidade'}
            </h2>
            <p className="text-brand-200 text-sm mt-1">
              {step === 'empresa'
                ? 'Escolha a empresa para este atendimento'
                : 'Escolha o município/unidade de atendimento'}
            </p>
          </div>
          {((isRecepcionista && selectedEmpresa) || (selectedEmpresa && selectedUnidade)) && (
            <button
              onClick={handleClose}
              className="text-white/70 hover:text-white transition-colors p-1"
              title="Fechar"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {step === 'empresa' ? (
            empresas.map((emp) => (
              <button
                key={emp.id}
                onClick={() => handleSelectEmpresa(emp)}
                className={cn(
                  'w-full text-left p-4 rounded-xl border-2 transition-all',
                  selectedEmpresa?.id === emp.id
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-surface-200 hover:border-brand-300 hover:bg-surface-50'
                )}
              >
                <div className="font-semibold text-surface-800">
                  {emp.tipo === 'inovamed' ? 'Inovamed' : 'M&J Serviços de Saúde'}
                </div>
                <div className="text-sm text-surface-500 mt-0.5">{emp.cnpj}</div>
                {selectedEmpresa?.id === emp.id && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-brand-600 font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Selecionada
                  </span>
                )}
              </button>
            ))
          ) : (
            <>
              <button
                onClick={() => setStep('empresa')}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium mb-2 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Voltar para empresas
              </button>
              {unidades.map((uni) => (
                <button
                  key={uni.id}
                  onClick={() => handleSelectUnidade(uni)}
                  className={cn(
                    'w-full text-left p-4 rounded-xl border-2 transition-all',
                    selectedUnidade?.id === uni.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-surface-200 hover:border-brand-300 hover:bg-surface-50'
                  )}
                >
                  <div className="font-semibold text-surface-800">
                    {(uni as any).municipio?.nome || uni.nome}
                  </div>
                  <div className="text-sm text-surface-500 mt-0.5">
                    CNES: {uni.cnes}
                  </div>
                  {selectedUnidade?.id === uni.id && (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs text-brand-600 font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Selecionada
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        {((isRecepcionista && selectedEmpresa) || (selectedEmpresa && selectedUnidade)) && (
          <div className="px-6 pb-6">
            <button
              onClick={handleClose}
              className="btn-primary w-full"
            >
              Confirmar Seleção
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
