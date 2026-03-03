'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui';

export default function AssinaturaMedicoPage() {
  const { user } = useAuth();
  const supabase = useSupabase();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeTab, setActiveTab] = useState<'desenhar' | 'upload'>('desenhar');
  const [currentSignature, setCurrentSignature] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load existing signature
  const loadSignature = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profissionais')
      .select('assinatura_digital')
      .eq('id', user.id)
      .single();
    if (data?.assinatura_digital) {
      setCurrentSignature(data.assinatura_digital);
    }
  }, [user, supabase]);

  useEffect(() => {
    loadSignature();
  }, [loadSignature]);

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [activeTab]);

  function getCoords(e: React.TouchEvent | React.MouseEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw() {
    setIsDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem (PNG ou JPG)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function saveSignature() {
    if (!user) return;
    setSaving(true);

    try {
      let signatureData: string;

      if (activeTab === 'desenhar') {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('Canvas nao encontrado');
        // Check if canvas has content
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Contexto nao encontrado');
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let hasContent = false;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] > 0) { hasContent = true; break; }
        }
        if (!hasContent) {
          toast.error('Desenhe sua assinatura antes de salvar');
          setSaving(false);
          return;
        }
        signatureData = canvas.toDataURL('image/png');
      } else {
        if (!uploadPreview) {
          toast.error('Selecione uma imagem de assinatura');
          setSaving(false);
          return;
        }
        signatureData = uploadPreview;
      }

      const { error } = await supabase
        .from('profissionais')
        .update({
          assinatura_digital: signatureData,
          tipo_assinatura: activeTab === 'desenhar' ? 'desenhada' : 'manual',
        })
        .eq('id', user.id);

      if (error) throw new Error(error.message);

      setCurrentSignature(signatureData);
      toast.success('Assinatura salva com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar assinatura');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto pt-16 lg:pt-0">
      <PageHeader
        title="Assinatura Digital"
        subtitle="Configure sua assinatura para os prontuarios"
      />

      {/* Current Signature */}
      {currentSignature && (
        <div className="card p-4 mb-6">
          <h3 className="font-semibold text-surface-800 mb-3 text-sm">Assinatura Atual</h3>
          <div className="bg-white border border-surface-200 rounded-lg p-4 flex justify-center">
            <img
              src={currentSignature}
              alt="Assinatura atual"
              className="max-h-24 object-contain"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="card">
        <div className="flex border-b border-surface-100">
          <button
            onClick={() => setActiveTab('desenhar')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'desenhar'
                ? 'text-brand-600 border-b-2 border-brand-500'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            Desenhar Assinatura
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'upload'
                ? 'text-brand-600 border-b-2 border-brand-500'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            Enviar Imagem
          </button>
        </div>

        <div className="p-5">
          {activeTab === 'desenhar' ? (
            <div>
              <p className="text-sm text-surface-600 mb-3">Desenhe sua assinatura abaixo usando o mouse ou o dedo:</p>
              <div className="border-2 border-dashed border-surface-300 rounded-xl bg-white overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className="w-full touch-none cursor-crosshair"
                  style={{ height: '200px' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
              </div>
              <button
                onClick={clearCanvas}
                className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-md hover:bg-red-100"
              >
                Limpar
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-surface-600 mb-3">Envie uma imagem da sua assinatura digitalizada (PNG ou JPG):</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleFileUpload}
                className="block w-full text-sm text-surface-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
              />
              {uploadPreview && (
                <div className="mt-4 bg-white border border-surface-200 rounded-lg p-4 flex justify-center">
                  <img src={uploadPreview} alt="Preview" className="max-h-32 object-contain" />
                </div>
              )}
            </div>
          )}

          <button
            onClick={saveSignature}
            disabled={saving}
            className="btn-primary w-full mt-4"
          >
            {saving ? 'Salvando...' : 'Salvar Assinatura'}
          </button>
        </div>
      </div>
    </div>
  );
}
