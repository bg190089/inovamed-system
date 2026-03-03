'use client';

import { Suspense, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

function UploadQRContent() {
  const searchParams = useSearchParams();
  const pacienteId = searchParams.get('paciente') || '';
  const unidadeId = searchParams.get('unidade') || '';
  const profissionalId = searchParams.get('profissional') || '';
  const tipo = searchParams.get('tipo') || 'outro';

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState(0);

  async function handleUpload(file: File) {
    if (!file || !pacienteId) return;
    setUploading(true);
    setError('');

    try {
      const path = `${pacienteId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos-paciente')
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      const { error: dbError } = await supabase
        .from('documentos_paciente')
        .insert({
          paciente_id: pacienteId,
          unidade_id: unidadeId || null,
          profissional_id: profissionalId || null,
          tipo,
          nome_arquivo: file.name,
          storage_path: path,
          mime_type: file.type,
          tamanho_bytes: file.size,
        });
      if (dbError) throw new Error(dbError.message);

      setSuccess(true);
      setUploadCount(prev => prev + 1);
      setPreview(null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar documento');
    }
    setUploading(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
    handleUpload(file);
  }

  if (!pacienteId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Invalido</h1>
          <p className="text-gray-500">Escaneie o QR Code novamente no sistema.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col items-center p-4 pt-8">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Inovamed</h1>
          <p className="text-sm text-gray-500 mt-1">Upload de Documento</p>
        </div>

        {uploadCount > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <p className="text-sm font-semibold text-emerald-700">{uploadCount} documento(s) enviado(s)</p>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="font-semibold text-emerald-800">Documento enviado!</p>
            <p className="text-xs text-emerald-600 mt-1">Voce pode enviar mais documentos abaixo.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-6 text-center transition-colors shadow-lg disabled:opacity-50"
        >
          <svg className="w-12 h-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-lg font-bold">{uploading ? 'Enviando...' : 'Tirar Foto'}</p>
          <p className="text-blue-200 text-sm mt-1">Abrir camera para fotografar documento</p>
        </button>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full bg-white border-2 border-gray-200 hover:border-blue-300 rounded-2xl p-4 text-center transition-colors disabled:opacity-50"
        >
          <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="font-semibold text-gray-700">Escolher Arquivo</p>
          <p className="text-xs text-gray-400 mt-0.5">Selecionar da galeria ou arquivos</p>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx" onChange={handleFileChange} className="hidden" />

        {uploading && (
          <div className="text-center py-4">
            <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500 mt-3">Enviando documento...</p>
          </div>
        )}

        {preview && (
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <img src={preview} alt="Preview" className="w-full object-contain max-h-64" />
          </div>
        )}

        <p className="text-[10px] text-gray-400 text-center">
          Sistema Inovamed - Os documentos serao vinculados ao prontuario do paciente.
        </p>
      </div>
    </div>
  );
}

export default function UploadQRPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    }>
      <UploadQRContent />
    </Suspense>
  );
}
