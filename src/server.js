require("dotenv").config();
const path = require("path");
const express = require("express");
const { pool, migrar } = require("./db");
const { basicAuth } = require("./auth");
const veiculosRouter = require("./veiculos");
const pocketbase = require("./pocketbase");

const PORT = process.env.PORT || 3000;

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sem autenticação: alvo de health check do Coolify, não pode depender de senha.
app.get("/saude", async (req, res) => {
  let db = false;
  try {
    await pool.query("SELECT 1");
    db = true;
  } catch (erro) {
    console.error("  saude: postgres indisponível:", erro.message);
  }
  const ok = db && pocketbase.configurado();
  res.status(ok ? 200 : 503).json({
    ok,
    banco_conectado: db,
    pocketbase_configurado: pocketbase.configurado(),
    autenticacao_configurada: Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD),
  });
});

// Leitura pública de propósito: dados e fotos dos veículos precisam ficar
// livres para scraping por bots/integrações. Só escrita (dentro do router)
// e o painel exigem login.
app.use("/api/veiculos", veiculosRouter);
app.use(basicAuth, express.static(path.join(__dirname, "..", "public")));

app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes("formato de imagem")) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "imagem maior que o limite de 10MB" });
  }
  if (err && err.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({ error: "no máximo 10 imagens por veículo" });
  }
  console.error("  erro não tratado:", err);
  res.status(500).json({ error: "erro interno" });
});

async function main() {
  await migrar();
  console.log("  migração do banco ok");
  if (!pocketbase.configurado()) {
    console.warn("  aviso: PocketBase não configurado — uploads de imagem vão falhar");
  }
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    console.warn("  aviso: ADMIN_USER/ADMIN_PASSWORD ausentes — painel e API respondem 503");
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`  ouvindo em http://0.0.0.0:${PORT}`);
  });
}

main().catch((erro) => {
  console.error("  falha ao iniciar:", erro);
  process.exit(1);
});
