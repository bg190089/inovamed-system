'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';

export default function AssinaturaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex gap-1.5"><div className="w-3 h-3 bg-brand-500 rounded-full animate-pulse" /><div className="w-3 h-3 bg-brand-500 rounded-full animate-pulse" /><div className="w-3 h-3 bg-brand-500 rounded-full animate-pulse" /></div>
      </div>
    }>
      <AssinaturaContent />
    </Suspense>
  );
}

function AssinaturaContent() {
  const searchParams = useSearchParams();
  const atendimentoId = searchParams.get('id');
  const supabase = createClient();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [termo, setTermo] = useState('');
  const [pacienteNome, setPacienteNome] = useState('');
  const [procedimentoTipo, setProcedimentoTipo] = useState('');
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (atendimentoId) loadData();
  }, [atendimentoId]);

  async function loadData() {
    try {
      // Load atendimento
      const { data: atend } = await supabase
        .from('atendimentos')
        .select('*, paciente:pacientes(nome_completo), procedimento:procedimentos(tipo)')
        .eq('id', atendimentoId)
        .single();

      if (!atend) { setError('Atendimento não encontrado'); return; }
      setPacienteNome(atend.paciente?.nome_completo || '');
      setProcedimentoTipo(atend.procedimento?.tipo || '');

      // Load active term
      const { data: termoData } = await supabase
        .from('termos')
        .select('conteudo')
        .eq('ativo', true)
        .single();
      setTermo(termoData?.conteudo || '');
    } catch {
      setError('Erro ao carregar dados');
    }
  }

  // Drawing handlers
  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const pos = 'touches' in e
      ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
      : { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pos = 'touches' in e
      ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
      : { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stopDraw() {
    setIsDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function handleSubmit() {
    const canvas = canvasRef.current;
    if (!canvas || !atendimentoId) return;

    // Check if canvas has content
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasDrawing = imageData.data.some((val, i) => i % 4 === 3 && val > 0);
    if (!hasDrawing) {
      alert('Por favor, assine no espaço indicado.');
      return;
    }

    setSaving(true);
    try {
      const signature = canvas.toDataURL('image/png');
      const { error } = await supabase.from('atendimentos').update({
        assinatura_paciente: signature,
        assinatura_at: new Date().toISOString(),
        termo_aceito: true,
      }).eq('id', atendimentoId);

      if (error) throw error;
      setSigned(true);
    } catch (err: any) {
      alert('Erro ao salvar assinatura: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-6">
        <div className="text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-surface-600 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50 p-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-display font-bold text-emerald-900 mb-2">
            Termo Assinado com Sucesso
          </h1>
          <p className="text-emerald-700">
            Obrigado, {pacienteNome}. Seu termo de consentimento foi registrado.
          </p>
          <p className="text-sm text-emerald-600 mt-4">
            {formatDate(new Date(), "dd/MM/yyyy 'às' HH:mm")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <span className="font-display font-bold text-surface-800">Inovamed</span>
          </div>
          <h1 className="text-xl font-display font-bold text-surface-900">
            Termo de Consentimento
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            {pacienteNome} &bull; {procedimentoTipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}
          </p>
        </div>

        {/* Term content */}
        <div className="card p-5 mb-4">
          <div className="prose prose-sm max-w-none text-surface-600 whitespace-pre-wrap leading-relaxed max-h-[40vh] overflow-y-auto">
            {termo}
          </div>
        </div>

        {/* Signature */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="font-semibold text-surface-800 text-sm">Assinatura do Paciente</label>
            <button onClick={clearCanvas} className="text-xs text-red-500 hover:text-red-700">
              Limpar
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="signature-canvas w-full"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          <p className="text-xs text-surface-400 mt-2 text-center">
            Use o dedo ou caneta para assinar acima
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="btn-success w-full mt-4 py-3.5 text-base"
        >
          {saving ? 'Registrando...' : 'Confirmar e Assinar Termo'}
        </button>
      </div>
    </div>
  );
}
