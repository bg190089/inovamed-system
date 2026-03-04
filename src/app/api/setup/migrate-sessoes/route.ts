import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aqjbwtplturuxwlmxpwb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxamJ3dHBsdHVydXh3bG14cHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUwNDU3MiwiZXhwIjoyMDg4MDgwNTcyfQ.QganZO4bGfcNh7d1L_t236KotQ_YYck6uH04djbHYGI';

export async function GET() {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Test: try to read a paciente with sessoes_anteriores
    const { data: testData, error: testError } = await supabase
      .from('pacientes')
      .select('id, sessoes_anteriores')
      .limit(1);

    if (testError && testError.message.includes('sessoes_anteriores')) {
      // Column doesn't exist, create it via raw SQL
      const { error: rpcError } = await supabase.rpc('exec_sql', {
        sql: "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sessoes_anteriores JSONB DEFAULT '[]';"
      });

      if (rpcError) {
        // Fallback: try direct REST approach
        return Response.json({
          success: false,
          message: 'Column does not exist. Please run this SQL in Supabase SQL editor:',
          sql: "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sessoes_anteriores JSONB DEFAULT '[]';",
          error: rpcError.message,
        });
      }

      return Response.json({
        success: true,
        message: 'Column sessoes_anteriores created successfully!',
      });
    }

    // Column already exists
    return Response.json({
      success: true,
      message: 'Column sessoes_anteriores already exists!',
      sample: testData,
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
