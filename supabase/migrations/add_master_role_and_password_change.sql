-- Add deve_trocar_senha column to profissionais table
-- This column tracks whether a user must change their password on first login

ALTER TABLE profissionais
ADD COLUMN IF NOT EXISTS deve_trocar_senha BOOLEAN NOT NULL DEFAULT false;

-- Set existing users to NOT need password change (they already have their passwords)
-- Only new users created via admin will have deve_trocar_senha = true (set by API)

-- Create an index on deve_trocar_senha for efficient filtering of users who need to change password
CREATE INDEX IF NOT EXISTS idx_profissionais_deve_trocar_senha
ON profissionais(deve_trocar_senha)
WHERE deve_trocar_senha = true;

-- Add municipio_id column to profissionais table
-- This is used to link recepcionistas to a specific municipio
ALTER TABLE profissionais
ADD COLUMN IF NOT EXISTS municipio_id UUID REFERENCES municipios(id);

-- Create an index on municipio_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_profissionais_municipio_id
ON profissionais(municipio_id);
