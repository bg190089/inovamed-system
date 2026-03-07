-- Migration: Add performance indexes for common queries
-- Run this in Supabase Dashboard > SQL Editor

-- Most important: covers getFilaDoDia (called every 10s on recepcao/triagem/consultorio)
CREATE INDEX IF NOT EXISTS idx_atendimentos_unidade_data 
ON atendimentos(unidade_id, data_atendimento);

-- Covers status filtering (aguardando, em_atendimento, finalizado)
CREATE INDEX IF NOT EXISTS idx_atendimentos_status 
ON atendimentos(status);

-- Covers medico dashboard filtering
CREATE INDEX IF NOT EXISTS idx_atendimentos_profissional 
ON atendimentos(profissional_id);

-- Covers patient history queries
CREATE INDEX IF NOT EXISTS idx_atendimentos_paciente 
ON atendimentos(paciente_id);

-- Composite index for the most common query pattern
CREATE INDEX IF NOT EXISTS idx_atendimentos_unidade_data_status 
ON atendimentos(unidade_id, data_atendimento, status);

-- FK lookup optimization  
CREATE INDEX IF NOT EXISTS idx_profissional_unidades_profissional 
ON profissional_unidades(profissional_id);

CREATE INDEX IF NOT EXISTS idx_profissional_unidades_unidade 
ON profissional_unidades(unidade_id);

-- Competencia-based queries (relatorios)
CREATE INDEX IF NOT EXISTS idx_atendimentos_competencia 
ON atendimentos(competencia);
