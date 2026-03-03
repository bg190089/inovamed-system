'use client';
import { useState } from 'react';

interface ConfirmDialogProps {
  open: boolean; title: string; description: string;
  confirmLabel?: string; cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void | Promise<void>; onCancel: () => void;
}

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'default', onConfirm, onCancel }: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  if (!open) return null;
  async function handleConfirm() { setLoading(true); try { await onConfirm(); } finally { setLoading(false); } }
  const colors: Record<string, string> = { danger: 'bg-red-600 hover:bg-red-700', warning: 'bg-amber-600 hover:bg-amber-700', default: 'bg-brand-600 hover:bg-brand-700' };
  const bgIcons: Record<string, string> = { danger: 'bg-red-100', warning: 'bg-amber-100', default: 'bg-brand-100' };
  const txIcons: Record<string, string> = { danger: 'text-red-600', warning: 'text-amber-600', default: 'text-brand-600' };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-elevated max-w-md w-full overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${bgIcons[variant]}`}>
              <svg className={`w-5 h-5 ${txIcons[variant]}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-surface-900">{title}</h3>
              <p className="text-sm text-surface-500 mt-1">{description}</p>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onCancel} disabled={loading} className="btn-secondary text-sm">{cancelLabel}</button>
          <button onClick={handleConfirm} disabled={loading} className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-white font-medium rounded-lg text-sm transition-all disabled:opacity-50 ${colors[variant]}`}>
            {loading ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Aguarde...</span> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
