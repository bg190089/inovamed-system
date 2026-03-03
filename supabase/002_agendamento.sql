-- ============================================================
-- INOVAMED / M&J - Sistema de Escleroterapia
-- Scheduling/Agendamento Module
-- Supabase PostgreSQL - RLS & Functions
-- ============================================================

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE agendamento_status AS ENUM ('agendado', 'confirmado', 'cancelado', 'realizado', 'faltou');

-- ============================================================
-- AGENDAMENTOS TABLE
-- ============================================================
CREATE TABLE agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE RESTRICT,
  profissional_id UUID REFERENCES profissionais(id) ON DELETE SET NULL,
  procedimento_id UUID NOT NULL REFERENCES procedimentos(id) ON DELETE RESTRICT,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,

  -- Scheduling information
  data_agendamento DATE NOT NULL,
  horario_inicio TIME NOT NULL,
  horario_fim TIME,

  -- Status control
  status agendamento_status NOT NULL DEFAULT 'agendado',
  observacoes TEXT,

  -- Audit fields
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT horario_fim_after_inicio CHECK (horario_fim IS NULL OR horario_fim > horario_inicio),
  CONSTRAINT data_agendamento_future CHECK (data_agendamento >= CURRENT_DATE)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_agendamentos_data ON agendamentos(data_agendamento);
CREATE INDEX idx_agendamentos_paciente ON agendamentos(paciente_id);
CREATE INDEX idx_agendamentos_unidade ON agendamentos(unidade_id);
CREATE INDEX idx_agendamentos_profissional ON agendamentos(profissional_id);
CREATE INDEX idx_agendamentos_status ON agendamentos(status);
CREATE INDEX idx_agendamentos_empresa ON agendamentos(empresa_id);
CREATE INDEX idx_agendamentos_data_unidade ON agendamentos(data_agendamento, unidade_id);
CREATE INDEX idx_agendamentos_data_profissional ON agendamentos(data_agendamento, profissional_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agendamentos
-- Policy: Doctors can see and manage their own appointments
CREATE POLICY "agendamentos_medico_select" ON agendamentos
  FOR SELECT TO authenticated
  USING (
    profissional_id = get_user_profissional_id()
    OR get_user_role() IN ('admin', 'gestor', 'recepcionista')
  );

-- Policy: Doctors can insert appointments (for their schedule)
CREATE POLICY "agendamentos_medico_insert" ON agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('admin', 'gestor', 'recepcionista')
  );

-- Policy: Doctors can update their own appointments
CREATE POLICY "agendamentos_medico_update" ON agendamentos
  FOR UPDATE TO authenticated
  USING (
    profissional_id = get_user_profissional_id()
    OR get_user_role() IN ('admin', 'gestor')
  );

-- Policy: Only gestors/admins can delete appointments
CREATE POLICY "agendamentos_delete" ON agendamentos
  FOR DELETE TO authenticated
  USING (get_user_role() IN ('admin', 'gestor'));

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Trigger for updated_at automatic update
CREATE TRIGGER trigger_agendamentos_updated
  BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Audit trigger for agendamentos
CREATE TRIGGER audit_agendamentos
  AFTER INSERT OR UPDATE OR DELETE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function: buscar_agendamentos_dia
-- Returns appointments for a specific date and unit with patient and professional names
CREATE OR REPLACE FUNCTION buscar_agendamentos_dia(
  p_data DATE,
  p_unidade_id UUID
)
RETURNS TABLE (
  id UUID,
  paciente_id UUID,
  paciente_nome VARCHAR,
  unidade_id UUID,
  profissional_id UUID,
  profissional_nome VARCHAR,
  procedimento_id UUID,
  procedimento_descricao TEXT,
  data_agendamento DATE,
  horario_inicio TIME,
  horario_fim TIME,
  status agendamento_status,
  observacoes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.paciente_id,
    pa.nome_completo::VARCHAR,
    a.unidade_id,
    a.profissional_id,
    COALESCE(pr.nome_completo, 'Não atribuído')::VARCHAR,
    a.procedimento_id,
    pr_proc.descricao,
    a.data_agendamento,
    a.horario_inicio,
    a.horario_fim,
    a.status,
    a.observacoes,
    a.created_at,
    a.updated_at
  FROM agendamentos a
  JOIN pacientes pa ON pa.id = a.paciente_id
  LEFT JOIN profissionais pr ON pr.id = a.profissional_id
  JOIN procedimentos pr_proc ON pr_proc.id = a.procedimento_id
  WHERE a.data_agendamento = p_data
    AND a.unidade_id = p_unidade_id
  ORDER BY a.horario_inicio ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: listar_agendamentos_profissional_intervalo
-- Returns appointments for a specific professional within a date range
CREATE OR REPLACE FUNCTION listar_agendamentos_profissional_intervalo(
  p_profissional_id UUID,
  p_data_inicio DATE,
  p_data_fim DATE
)
RETURNS TABLE (
  id UUID,
  paciente_id UUID,
  paciente_nome VARCHAR,
  unidade_id UUID,
  unidade_nome VARCHAR,
  procedimento_id UUID,
  procedimento_descricao TEXT,
  data_agendamento DATE,
  horario_inicio TIME,
  horario_fim TIME,
  status agendamento_status,
  observacoes TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.paciente_id,
    pa.nome_completo::VARCHAR,
    a.unidade_id,
    u.nome::VARCHAR,
    a.procedimento_id,
    pr_proc.descricao,
    a.data_agendamento,
    a.horario_inicio,
    a.horario_fim,
    a.status,
    a.observacoes,
    a.created_at
  FROM agendamentos a
  JOIN pacientes pa ON pa.id = a.paciente_id
  JOIN unidades u ON u.id = a.unidade_id
  JOIN procedimentos pr_proc ON pr_proc.id = a.procedimento_id
  WHERE a.profissional_id = p_profissional_id
    AND a.data_agendamento BETWEEN p_data_inicio AND p_data_fim
  ORDER BY a.data_agendamento ASC, a.horario_inicio ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: verificar_disponibilidade_horario
-- Check if a time slot is available for a professional at a unit
CREATE OR REPLACE FUNCTION verificar_disponibilidade_horario(
  p_profissional_id UUID,
  p_unidade_id UUID,
  p_data DATE,
  p_horario_inicio TIME,
  p_horario_fim TIME,
  p_agendamento_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_conflitos INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_conflitos
  FROM agendamentos
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND data_agendamento = p_data
    AND status IN ('agendado', 'confirmado', 'realizado')
    AND (p_agendamento_id IS NULL OR id != p_agendamento_id)
    AND (
      (horario_inicio < p_horario_fim AND horario_fim IS NULL) OR
      (horario_inicio < p_horario_fim AND horario_fim > p_horario_inicio)
    );

  RETURN v_conflitos = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: contar_agendamentos_dia
-- Count appointments for a specific date and unit
CREATE OR REPLACE FUNCTION contar_agendamentos_dia(
  p_data DATE,
  p_unidade_id UUID,
  p_status agendamento_status DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM agendamentos
  WHERE data_agendamento = p_data
    AND unidade_id = p_unidade_id
    AND (p_status IS NULL OR status = p_status);

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: relatorio_agendamentos_por_periodo
-- Report of appointments grouped by date and unit within a period
CREATE OR REPLACE FUNCTION relatorio_agendamentos_por_periodo(
  p_data_inicio DATE,
  p_data_fim DATE,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS TABLE (
  data_agendamento DATE,
  unidade_nome VARCHAR,
  total_agendados BIGINT,
  total_confirmados BIGINT,
  total_cancelados BIGINT,
  total_realizados BIGINT,
  total_faltou BIGINT,
  total_geral BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.data_agendamento,
    u.nome::VARCHAR,
    COUNT(*) FILTER (WHERE a.status = 'agendado')::BIGINT,
    COUNT(*) FILTER (WHERE a.status = 'confirmado')::BIGINT,
    COUNT(*) FILTER (WHERE a.status = 'cancelado')::BIGINT,
    COUNT(*) FILTER (WHERE a.status = 'realizado')::BIGINT,
    COUNT(*) FILTER (WHERE a.status = 'faltou')::BIGINT,
    COUNT(*)::BIGINT
  FROM agendamentos a
  JOIN unidades u ON u.id = a.unidade_id
  WHERE a.data_agendamento BETWEEN p_data_inicio AND p_data_fim
    AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
  GROUP BY a.data_agendamento, u.id, u.nome
  ORDER BY a.data_agendamento DESC, u.nome ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: relatorio_pacientes_por_profissional
-- Report of appointments grouped by professional within a period
CREATE OR REPLACE FUNCTION relatorio_pacientes_por_profissional(
  p_data_inicio DATE,
  p_data_fim DATE,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS TABLE (
  profissional_nome VARCHAR,
  profissional_crm VARCHAR,
  total_agendados BIGINT,
  total_confirmados BIGINT,
  total_realizados BIGINT,
  percentual_comparecimento NUMERIC,
  total_geral BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.nome_completo::VARCHAR,
    COALESCE(pr.crm, 'N/A')::VARCHAR,
    COUNT(*) FILTER (WHERE a.status = 'agendado')::BIGINT,
    COUNT(*) FILTER (WHERE a.status = 'confirmado')::BIGINT,
    COUNT(*) FILTER (WHERE a.status = 'realizado')::BIGINT,
    CASE
      WHEN COUNT(*) > 0 THEN ROUND(
        (COUNT(*) FILTER (WHERE a.status = 'realizado')::NUMERIC / COUNT(*)::NUMERIC) * 100,
        2
      )
      ELSE 0::NUMERIC
    END,
    COUNT(*)::BIGINT
  FROM agendamentos a
  JOIN profissionais pr ON pr.id = a.profissional_id
  WHERE a.data_agendamento BETWEEN p_data_inicio AND p_data_fim
    AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
  GROUP BY pr.id, pr.nome_completo, pr.crm
  ORDER BY COUNT(*) DESC, pr.nome_completo ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SIDEBAR ROUTES CONFIGURATION
-- ============================================================
-- Note: Add this route to your application's sidebar/navigation configuration:
--
-- {
--   path: '/agendamentos',
--   label: 'Agendamentos',
--   icon: 'Calendar',
--   requiredRole: ['admin', 'gestor', 'medico', 'recepcionista'],
--   children: [
--     {
--       path: '/agendamentos/listar',
--       label: 'Listar Agendamentos',
--       icon: 'List'
--     },
--     {
--       path: '/agendamentos/novo',
--       label: 'Novo Agendamento',
--       icon: 'Plus'
--     },
--     {
--       path: '/agendamentos/calendario',
--       label: 'Visualizar Calendário',
--       icon: 'Calendar'
--     },
--     {
--       path: '/agendamentos/relatorios',
--       label: 'Relatórios',
--       icon: 'BarChart3'
--     }
--   ]
-- }

-- ============================================================
-- END OF AGENDAMENTO MODULE
-- ============================================================
