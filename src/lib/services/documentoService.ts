import { SupabaseClient } from '@supabase/supabase-js';

export interface DocumentoPaciente {
  id: string;
  paciente_id: string;
  unidade_id?: string;
  profissional_id?: string;
  tipo: string;
  nome_arquivo: string;
  descricao?: string;
  storage_path: string;
  mime_type?: string;
  tamanho_bytes?: number;
  created_at: string;
}

export class DocumentoService {
  constructor(private supabase: SupabaseClient) {}

  async getByPaciente(pacienteId: string): Promise<DocumentoPaciente[]> {
    const { data, error } = await this.supabase
      .from('documentos_paciente')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async upload(file: File, pacienteId: string, tipo: string, descricao: string, unidadeId?: string, profissionalId?: string): Promise<DocumentoPaciente> {
    // Generate unique path
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${pacienteId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // Upload to storage
    const { error: uploadError } = await this.supabase.storage
      .from('documentos-paciente')
      .upload(path, file, { contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);

    // Save metadata
    const { data, error } = await this.supabase
      .from('documentos_paciente')
      .insert({
        paciente_id: pacienteId,
        unidade_id: unidadeId,
        profissional_id: profissionalId,
        tipo,
        nome_arquivo: file.name,
        descricao: descricao || null,
        storage_path: path,
        mime_type: file.type,
        tamanho_bytes: file.size,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async delete(id: string, storagePath: string): Promise<void> {
    // Delete from storage
    await this.supabase.storage.from('documentos-paciente').remove([storagePath]);
    // Delete metadata
    const { error } = await this.supabase.from('documentos_paciente').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  getPublicUrl(path: string): string {
    const { data } = this.supabase.storage.from('documentos-paciente').getPublicUrl(path);
    return data.publicUrl;
  }

  async getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from('documentos-paciente')
      .createSignedUrl(path, expiresIn);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }
}
