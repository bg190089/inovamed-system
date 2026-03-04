-- ============================================================
-- Migration 003: Adiciona coluna drive_url na tabela atendimentos
-- Para armazenar o link do backup no Google Drive
-- ============================================================

ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS drive_url TEXT;

COMMENT ON COLUMN atendimentos.drive_url IS 'Link do PDF do prontuário no Google Drive (backup automático)';
