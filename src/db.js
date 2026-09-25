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
  imagem_pb_record_id TEXT,
  imagem_pb_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veiculos_status_idx ON veiculos (status);
`;

async function migrar() {
  await pool.query(MIGRACAO);
}

module.exports = { pool, migrar };
