'use client';
import { useState, useCallback } from 'react';

interface ConfirmState {
  open: boolean; title: string; description: string;
  variant: 'danger' | 'warning' | 'default'; confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>({ open: false, title: '', description: '', variant: 'default', confirmLabel: 'Confirmar', onConfirm: () => {} });
  const confirm = useCallback((o: { title: string; description: string; variant?: 'danger' | 'warning' | 'default'; confirmLabel?: string; onConfirm: () => void | Promise<void>; }) => {
    setState({ open: true, title: o.title, description: o.description, variant: o.variant || 'default', confirmLabel: o.confirmLabel || 'Confirmar', onConfirm: o.onConfirm });
  }, []);
  const close = useCallback(() => { setState(p => ({ ...p, open: false })); }, []);
  return { state, confirm, close };
}
