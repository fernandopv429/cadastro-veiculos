const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não configurada");
}

// O Postgres do Coolify normalmente não expõe certificado confiável publicamente;
// aceitar sem verificar é o mesmo trade-off que uma conexão interna sem TLS.
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
});

const MIGRACAO = `
CREATE TABLE IF NOT EXISTS veiculos (
  id SERIAL PRIMARY KEY,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  ano INTEGER,
  placa TEXT,
  cor TEXT,
  preco NUMERIC(12,2),
  quilometragem INTEGER,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veiculos_status_idx ON veiculos (status);

-- Uma linha por foto (cada uma é um registro próprio no PocketBase, com um
-- único arquivo). Suporta várias imagens por veículo sem mexer no campo de
-- arquivo do PocketBase, que continua maxSelect=1 por registro.
CREATE TABLE IF NOT EXISTS veiculo_imagens (
  id SERIAL PRIMARY KEY,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  imagem_pb_record_id TEXT NOT NULL,
  imagem_pb_filename TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veiculo_imagens_veiculo_id_idx ON veiculo_imagens (veiculo_id);

-- Migração de instalações antigas (coluna única de imagem na própria tabela
-- veiculos): move o que existir para veiculo_imagens e remove as colunas.
-- Guardado atrás de um IF EXISTS para não quebrar em instalações novas, que
-- já nascem sem essas colunas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'veiculos' AND column_name = 'imagem_pb_record_id'
  ) THEN
    INSERT INTO veiculo_imagens (veiculo_id, imagem_pb_record_id, imagem_pb_filename, ordem)
    SELECT id, imagem_pb_record_id, imagem_pb_filename, 0
    FROM veiculos
    WHERE imagem_pb_record_id IS NOT NULL AND imagem_pb_filename IS NOT NULL;

    ALTER TABLE veiculos DROP COLUMN imagem_pb_record_id;
    ALTER TABLE veiculos DROP COLUMN imagem_pb_filename;
  END IF;
END $$;
`;

async function migrar() {
  await pool.query(MIGRACAO);
}

module.exports = { pool, migrar };
