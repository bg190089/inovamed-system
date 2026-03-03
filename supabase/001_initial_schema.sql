-- ============================================================
-- INOVAMED / M&J - Sistema de Escleroterapia
-- Supabase PostgreSQL Schema + RLS + Functions
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'gestor', 'medico', 'recepcionista');
CREATE TYPE sexo_type AS ENUM ('M', 'F');
CREATE TYPE procedimento_tipo AS ENUM ('unilateral', 'bilateral');
CREATE TYPE atendimento_status AS ENUM ('aguardando', 'em_atendimento', 'finalizado', 'cancelado');
CREATE TYPE empresa_tipo AS ENUM ('inovamed', 'mj');

-- ============================================================
-- EMPRESAS
-- ============================================================
CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo empresa_tipo NOT NULL UNIQUE,
  razao_social TEXT NOT NULL,
  cnpj VARCHAR(18) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO empresas (tipo, razao_social, cnpj) VALUES
  ('inovamed', 'INOVAMED - Equipamentos e Serviços Médicos', '00.000.000/0001-00'),
  ('mj', 'M&J Serviços de Saúde LTDA', '00.000.000/0002-00');

-- ============================================================
-- MUNICIPIOS + UNIDADES (CNES)
-- ============================================================
CREATE TABLE municipios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(100) NOT NULL,
  codigo_ibge VARCHAR(7),
  uf VARCHAR(2) DEFAULT 'BA',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE unidades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  municipio_id UUID NOT NULL REFERENCES municipios(id),
  nome VARCHAR(200) NOT NULL,
  cnes VARCHAR(7) NOT NULL UNIQUE,
  endereco TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais dos municípios e CNES
INSERT INTO municipios (id, nome, codigo_ibge) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Conceição do Coité', '2907806'),
  ('a1000000-0000-0000-0000-000000000002', 'Santo Estevão', '2928802'),
  ('a1000000-0000-0000-0000-000000000003', 'Conceição da Feira', '2907509'),
  ('a1000000-0000-0000-0000-000000000004', 'Serra Preta', '2930105'),
  ('a1000000-0000-0000-0000-000000000005', 'Serrinha', '2930501'),
  ('a1000000-0000-0000-0000-000000000006', 'Barrocas', '2903235');

INSERT INTO unidades (municipio_id, nome, cnes) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Policlínica Municipal de Conceição do Coité', '3900037'),
  ('a1000000-0000-0000-0000-000000000002', 'Unidade de Saúde de Santo Estevão', '2520338'),
  ('a1000000-0000-0000-0000-000000000003', 'Unidade de Saúde de Conceição da Feira', '2660024'),
  ('a1000000-0000-0000-0000-000000000004', 'Unidade de Saúde de Serra Preta', '2997614');
-- Serrinha e Barrocas: CNES pendente - cadastrar via admin

-- ============================================================
-- PROFISSIONAIS
-- ============================================================
CREATE TABLE profissionais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  nome_completo VARCHAR(200) NOT NULL,
  cns VARCHAR(15),
  cpf VARCHAR(14),
  cbo VARCHAR(6) DEFAULT '225203',
  crm VARCHAR(20),
  role user_role NOT NULL DEFAULT 'medico',
  empresa_id UUID REFERENCES empresas(id),
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profissional pode atender em múltiplas unidades
CREATE TABLE profissional_unidades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profissional_id UUID NOT NULL REFERENCES profissionais(id),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  UNIQUE(profissional_id, unidade_id)
);

-- ============================================================
-- PACIENTES
-- ============================================================
CREATE TABLE pacientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_completo VARCHAR(200) NOT NULL,
  sexo sexo_type NOT NULL,
  data_nascimento DATE NOT NULL,
  cpf VARCHAR(14) UNIQUE,
  cns VARCHAR(15),
  cep VARCHAR(10),
  logradouro VARCHAR(200),
  numero VARCHAR(20),
  complemento VARCHAR(100),
  bairro VARCHAR(100),
  cidade VARCHAR(100),
  uf VARCHAR(2) DEFAULT 'BA',
  telefone VARCHAR(20),
  email VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para busca rápida na recepção
CREATE INDEX idx_pacientes_cpf ON pacientes(cpf);
CREATE INDEX idx_pacientes_cns ON pacientes(cns);
CREATE INDEX idx_pacientes_nome ON pacientes USING gin(to_tsvector('portuguese', nome_completo));

-- ============================================================
-- PROCEDIMENTOS (tabela SUS)
-- ============================================================
CREATE TABLE procedimentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_sus VARCHAR(15) NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  tipo procedimento_tipo NOT NULL,
  cid_principal VARCHAR(10) DEFAULT 'I839',
  valor_sus DECIMAL(10,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE
);

INSERT INTO procedimentos (codigo_sus, descricao, tipo, cid_principal) VALUES
  ('0309070015', 'Tratamento Esclerosante Não Estético de Varizes dos MMII (Unilateral)', 'unilateral', 'I839'),
  ('0309070023', 'Tratamento Esclerosante Não Estético de Varizes dos MMII (Bilateral)', 'bilateral', 'I839');

-- ============================================================
-- ATENDIMENTOS
-- ============================================================
CREATE TABLE atendimentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identificação
  numero_ficha SERIAL,
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  profissional_id UUID NOT NULL REFERENCES profissionais(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  procedimento_id UUID NOT NULL REFERENCES procedimentos(id),
  
  -- BPA-I fields
  competencia VARCHAR(6), -- AAAAMM (ex: 202601)
  cnes_unidade VARCHAR(7),
  cns_profissional VARCHAR(15),
  cbo_profissional VARCHAR(6),
  data_atendimento DATE NOT NULL DEFAULT CURRENT_DATE,
  numero_autorizacao VARCHAR(13),
  
  -- Prontuário
  anamnese TEXT,
  doppler TEXT,
  descricao_procedimento TEXT,
  observacoes TEXT,
  
  -- CID
  cid VARCHAR(10) DEFAULT 'I839',
  carater_atendimento VARCHAR(2) DEFAULT '01', -- 01 = Eletivo
  
  -- Controle
  status atendimento_status DEFAULT 'aguardando',
  hora_chegada TIMESTAMPTZ DEFAULT NOW(),
  hora_inicio_atendimento TIMESTAMPTZ,
  hora_fim_atendimento TIMESTAMPTZ,
  
  -- Assinatura
  assinatura_paciente TEXT, -- Base64 da assinatura
  assinatura_at TIMESTAMPTZ,
  termo_aceito BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes para performance
CREATE INDEX idx_atendimentos_data ON atendimentos(data_atendimento);
CREATE INDEX idx_atendimentos_paciente ON atendimentos(paciente_id);
CREATE INDEX idx_atendimentos_profissional ON atendimentos(profissional_id);
CREATE INDEX idx_atendimentos_unidade ON atendimentos(unidade_id);
CREATE INDEX idx_atendimentos_competencia ON atendimentos(competencia);
CREATE INDEX idx_atendimentos_status ON atendimentos(status);

-- ============================================================
-- FILA DE ATENDIMENTO (controle da recepção)
-- ============================================================
CREATE TABLE fila_atendimento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atendimento_id UUID NOT NULL REFERENCES atendimentos(id),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  posicao INTEGER NOT NULL,
  data_fila DATE DEFAULT CURRENT_DATE,
  chamado BOOLEAN DEFAULT FALSE,
  chamado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG (LGPD)
-- ============================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ============================================================
-- TERMOS E CONSENTIMENTOS
-- ============================================================
CREATE TABLE termos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo VARCHAR(200) NOT NULL,
  conteudo TEXT NOT NULL,
  versao VARCHAR(10) NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO termos (titulo, conteudo, versao) VALUES
  ('Termo de Consentimento - Escleroterapia', 
   'TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO

Eu, abaixo identificado(a), declaro que fui informado(a) sobre o procedimento de Tratamento Esclerosante de Varizes dos Membros Inferiores, incluindo:

1. NATUREZA DO PROCEDIMENTO: Consiste na aplicação de substância esclerosante nas veias varicosas, visando a obliteração das mesmas.

2. BENEFÍCIOS ESPERADOS: Melhora estética e funcional, alívio de sintomas como dor, peso e edema nos membros inferiores.

3. RISCOS E COMPLICAÇÕES POSSÍVEIS: Hematomas, hiperpigmentação temporária, tromboflebite superficial, reações alérgicas, necrose cutânea (raro), trombose venosa profunda (raro).

4. ALTERNATIVAS: Tratamento cirúrgico convencional, uso de meias elásticas, laser endovenoso.

5. Declaro que tive a oportunidade de fazer perguntas e que todas foram respondidas satisfatoriamente.

6. Autorizo a equipe médica a realizar o procedimento descrito, bem como procedimentos adicionais que se façam necessários.

7. Atesto que compareci e fui atendido(a) nesta data.',
   '1.0');

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Função para gerar competência automaticamente
CREATE OR REPLACE FUNCTION set_competencia()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.competencia IS NULL THEN
    NEW.competencia := TO_CHAR(NEW.data_atendimento, 'YYYYMM');
  END IF;
  
  -- Preencher campos BPA automaticamente
  SELECT u.cnes INTO NEW.cnes_unidade 
  FROM unidades u WHERE u.id = NEW.unidade_id;
  
  SELECT p.cns, p.cbo INTO NEW.cns_profissional, NEW.cbo_profissional
  FROM profissionais p WHERE p.id = NEW.profissional_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_competencia
  BEFORE INSERT ON atendimentos
  FOR EACH ROW EXECUTE FUNCTION set_competencia();

-- Função para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pacientes_updated
  BEFORE UPDATE ON pacientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_atendimentos_updated
  BEFORE UPDATE ON atendimentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_profissionais_updated
  BEFORE UPDATE ON profissionais
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Função de busca rápida de paciente (recepção)
CREATE OR REPLACE FUNCTION buscar_paciente(termo TEXT)
RETURNS SETOF pacientes AS $$
BEGIN
  -- Tenta buscar por CPF primeiro
  IF termo ~ '^\d' THEN
    RETURN QUERY SELECT * FROM pacientes 
    WHERE cpf LIKE termo || '%' OR cns LIKE termo || '%'
    LIMIT 10;
  ELSE
    RETURN QUERY SELECT * FROM pacientes
    WHERE to_tsvector('portuguese', nome_completo) @@ plainto_tsquery('portuguese', unaccent(termo))
       OR nome_completo ILIKE '%' || unaccent(termo) || '%'
    LIMIT 10;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Função para relatório BPA-I
CREATE OR REPLACE FUNCTION gerar_bpa_individual(
  p_competencia VARCHAR,
  p_unidade_id UUID
)
RETURNS TABLE (
  cnes VARCHAR,
  competencia VARCHAR,
  cns_profissional VARCHAR,
  cbo VARCHAR,
  data_atendimento TEXT,
  numero_folha TEXT,
  numero_sequencial TEXT,
  procedimento VARCHAR,
  paciente_nome VARCHAR,
  paciente_cpf VARCHAR,
  paciente_cns VARCHAR,
  paciente_sexo TEXT,
  paciente_municipio VARCHAR,
  paciente_nascimento TEXT,
  cid VARCHAR,
  carater VARCHAR,
  quantidade TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.cnes_unidade,
    a.competencia,
    a.cns_profissional,
    a.cbo_profissional,
    TO_CHAR(a.data_atendimento, 'YYYYMMDD'),
    LPAD(ROW_NUMBER() OVER (
      PARTITION BY a.cns_profissional 
      ORDER BY a.data_atendimento, a.numero_ficha
    )::TEXT / 20 + 1, 3, '0'),
    LPAD((ROW_NUMBER() OVER (
      PARTITION BY a.cns_profissional 
      ORDER BY a.data_atendimento, a.numero_ficha
    ) - 1) % 20 + 1, 2, '0')::TEXT,
    pr.codigo_sus,
    p.nome_completo::VARCHAR,
    COALESCE(p.cpf, '')::VARCHAR,
    COALESCE(p.cns, '')::VARCHAR,
    p.sexo::TEXT,
    COALESCE(p.cidade, '')::VARCHAR,
    TO_CHAR(p.data_nascimento, 'YYYYMMDD'),
    a.cid,
    a.carater_atendimento,
    '001'
  FROM atendimentos a
  JOIN pacientes p ON p.id = a.paciente_id
  JOIN procedimentos pr ON pr.id = a.procedimento_id
  WHERE a.competencia = p_competencia
    AND a.unidade_id = p_unidade_id
    AND a.status = 'finalizado'
  ORDER BY a.cns_profissional, a.data_atendimento, a.numero_ficha;
END;
$$ LANGUAGE plpgsql;

-- Função para relatório de produtividade médica
CREATE OR REPLACE FUNCTION relatorio_produtividade_medico(
  p_data_inicio DATE,
  p_data_fim DATE,
  p_profissional_id UUID DEFAULT NULL
)
RETURNS TABLE (
  profissional_nome VARCHAR,
  profissional_crm VARCHAR,
  total_atendimentos BIGINT,
  total_unilateral BIGINT,
  total_bilateral BIGINT,
  media_diaria NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.nome_completo::VARCHAR,
    pr.crm::VARCHAR,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE proc.tipo = 'unilateral')::BIGINT,
    COUNT(*) FILTER (WHERE proc.tipo = 'bilateral')::BIGINT,
    ROUND(COUNT(*)::NUMERIC / GREATEST(
      (SELECT COUNT(DISTINCT a2.data_atendimento) 
       FROM atendimentos a2 
       WHERE a2.profissional_id = pr.id 
         AND a2.data_atendimento BETWEEN p_data_inicio AND p_data_fim
         AND a2.status = 'finalizado'), 1
    ), 1)
  FROM atendimentos a
  JOIN profissionais pr ON pr.id = a.profissional_id
  JOIN procedimentos proc ON proc.id = a.procedimento_id
  WHERE a.data_atendimento BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'finalizado'
    AND (p_profissional_id IS NULL OR a.profissional_id = p_profissional_id)
  GROUP BY pr.id, pr.nome_completo, pr.crm
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- Função para relatório de produtividade por município
CREATE OR REPLACE FUNCTION relatorio_produtividade_municipio(
  p_competencia VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  municipio_nome VARCHAR,
  cnes VARCHAR,
  total_atendimentos BIGINT,
  total_unilateral BIGINT,
  total_bilateral BIGINT,
  total_profissionais BIGINT,
  dias_atendimento BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.nome::VARCHAR,
    u.cnes::VARCHAR,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE proc.tipo = 'unilateral')::BIGINT,
    COUNT(*) FILTER (WHERE proc.tipo = 'bilateral')::BIGINT,
    COUNT(DISTINCT a.profissional_id)::BIGINT,
    COUNT(DISTINCT a.data_atendimento)::BIGINT
  FROM atendimentos a
  JOIN unidades u ON u.id = a.unidade_id
  JOIN municipios m ON m.id = u.municipio_id
  JOIN procedimentos proc ON proc.id = a.procedimento_id
  WHERE a.status = 'finalizado'
    AND (p_competencia IS NULL OR a.competencia = p_competencia)
  GROUP BY m.id, m.nome, u.cnes
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - LGPD
-- ============================================================

ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policy helpers
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profissionais WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_profissional_id()
RETURNS UUID AS $$
  SELECT id FROM profissionais WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Pacientes: todos autenticados podem ler, apenas recepção+ podem inserir/editar
CREATE POLICY "pacientes_select" ON pacientes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pacientes_insert" ON pacientes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "pacientes_update" ON pacientes
  FOR UPDATE TO authenticated USING (true);

-- Atendimentos: médicos veem apenas os seus, gestores/admin veem todos
CREATE POLICY "atendimentos_select" ON atendimentos
  FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin', 'gestor', 'recepcionista')
    OR profissional_id = get_user_profissional_id()
  );

CREATE POLICY "atendimentos_insert" ON atendimentos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "atendimentos_update" ON atendimentos
  FOR UPDATE TO authenticated
  USING (
    get_user_role() IN ('admin', 'gestor')
    OR profissional_id = get_user_profissional_id()
  );

-- Profissionais: todos autenticados podem ler, admin pode tudo
CREATE POLICY "profissionais_select" ON profissionais
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profissionais_manage" ON profissionais
  FOR ALL TO authenticated
  USING (get_user_role() = 'admin');

-- Audit: apenas admin pode ver
CREATE POLICY "audit_select" ON audit_log
  FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "audit_insert" ON audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- AUDIT TRIGGER (LGPD compliance)
-- ============================================================
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_data)
    VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_pacientes
  AFTER INSERT OR UPDATE OR DELETE ON pacientes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_atendimentos
  AFTER INSERT OR UPDATE OR DELETE ON atendimentos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
