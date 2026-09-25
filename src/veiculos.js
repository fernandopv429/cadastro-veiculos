const express = require("express");
const multer = require("multer");
const { pool } = require("./db");
const pocketbase = require("./pocketbase");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error("formato de imagem não suportado (use jpeg, png, webp ou gif)"));
    }
    cb(null, true);
  },
});

const STATUS_VALIDOS = ["disponivel", "reservado", "vendido"];

const router = express.Router();

function paraNumero(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function paraInteiro(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = parseInt(valor, 10);
  return Number.isFinite(n) ? n : null;
}

function serializa(linha) {
  return {
    id: linha.id,
    marca: linha.marca,
    modelo: linha.modelo,
    ano: linha.ano,
    placa: linha.placa,
    cor: linha.cor,
    preco: linha.preco !== null ? Number(linha.preco) : null,
    quilometragem: linha.quilometragem,
    descricao: linha.descricao,
    status: linha.status,
    imagem_url: pocketbase.urlImagem(linha.imagem_pb_record_id, linha.imagem_pb_filename),
    created_at: linha.created_at,
    updated_at: linha.updated_at,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const { busca, status } = req.query;
    const condicoes = [];
    const valores = [];

    if (status) {
      valores.push(status);
      condicoes.push(`status = $${valores.length}`);
    }
    if (busca) {
      valores.push(`%${busca}%`);
      condicoes.push(`(marca ILIKE $${valores.length} OR modelo ILIKE $${valores.length} OR placa ILIKE $${valores.length})`);
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT * FROM veiculos ${where} ORDER BY created_at DESC`,
      valores
    );
    res.json(rows.map(serializa));
  } catch (erro) {
    next(erro);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM veiculos WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "veículo não encontrado" });
    res.json(serializa(rows[0]));
  } catch (erro) {
    next(erro);
  }
});

router.post("/", upload.single("imagem"), async (req, res, next) => {
  try {
    const { marca, modelo } = req.body;
    if (!marca || !modelo) {
      return res.status(400).json({ error: "marca e modelo são obrigatórios" });
    }
    const status = STATUS_VALIDOS.includes(req.body.status) ? req.body.status : "disponivel";

    let imagemPbRecordId = null;
    let imagemPbFilename = null;
    if (req.file) {
      const enviado = await pocketbase.enviaImagem(req.file.buffer, req.file.originalname, req.file.mimetype);
      imagemPbRecordId = enviado.recordId;
      imagemPbFilename = enviado.filename;
    }

    const { rows } = await pool.query(
      `INSERT INTO veiculos
        (marca, modelo, ano, placa, cor, preco, quilometragem, descricao, status, imagem_pb_record_id, imagem_pb_filename)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        marca,
        modelo,
        paraInteiro(req.body.ano),
        req.body.placa || null,
        req.body.cor || null,
        paraNumero(req.body.preco),
        paraInteiro(req.body.quilometragem),
        req.body.descricao || null,
        status,
        imagemPbRecordId,
        imagemPbFilename,
      ]
    );
    res.status(201).json(serializa(rows[0]));
  } catch (erro) {
    next(erro);
  }
});

router.put("/:id", upload.single("imagem"), async (req, res, next) => {
  try {
    const { rows: existentes } = await pool.query("SELECT * FROM veiculos WHERE id = $1", [req.params.id]);
    if (!existentes.length) return res.status(404).json({ error: "veículo não encontrado" });
    const atual = existentes[0];

    const marca = req.body.marca ?? atual.marca;
    const modelo = req.body.modelo ?? atual.modelo;
    if (!marca || !modelo) {
      return res.status(400).json({ error: "marca e modelo são obrigatórios" });
    }
    const status = STATUS_VALIDOS.includes(req.body.status) ? req.body.status : atual.status;

    let imagemPbRecordId = atual.imagem_pb_record_id;
    let imagemPbFilename = atual.imagem_pb_filename;
    const imagemAntigaId = atual.imagem_pb_record_id;

    if (req.file) {
      const enviado = await pocketbase.enviaImagem(req.file.buffer, req.file.originalname, req.file.mimetype);
      imagemPbRecordId = enviado.recordId;
      imagemPbFilename = enviado.filename;
    } else if (req.body.remover_imagem === "true") {
      imagemPbRecordId = null;
      imagemPbFilename = null;
    }

    const { rows } = await pool.query(
      `UPDATE veiculos SET
        marca=$1, modelo=$2, ano=$3, placa=$4, cor=$5, preco=$6, quilometragem=$7,
        descricao=$8, status=$9, imagem_pb_record_id=$10, imagem_pb_filename=$11, updated_at=now()
       WHERE id=$12
       RETURNING *`,
      [
        marca,
        modelo,
        req.body.ano !== undefined ? paraInteiro(req.body.ano) : atual.ano,
        req.body.placa !== undefined ? req.body.placa || null : atual.placa,
        req.body.cor !== undefined ? req.body.cor || null : atual.cor,
        req.body.preco !== undefined ? paraNumero(req.body.preco) : atual.preco,
        req.body.quilometragem !== undefined ? paraInteiro(req.body.quilometragem) : atual.quilometragem,
        req.body.descricao !== undefined ? req.body.descricao || null : atual.descricao,
        status,
        imagemPbRecordId,
        imagemPbFilename,
        req.params.id,
      ]
    );

    // Só apaga a imagem antiga do PocketBase depois que o Postgres confirmou a troca.
    if (imagemAntigaId && imagemAntigaId !== imagemPbRecordId) {
      await pocketbase.removeImagem(imagemAntigaId).catch((e) => console.error("  aviso: falha ao limpar imagem antiga:", e.message));
    }

    res.json(serializa(rows[0]));
  } catch (erro) {
    next(erro);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("DELETE FROM veiculos WHERE id = $1 RETURNING *", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "veículo não encontrado" });
    if (rows[0].imagem_pb_record_id) {
      await pocketbase.removeImagem(rows[0].imagem_pb_record_id).catch((e) => console.error("  aviso: falha ao remover imagem:", e.message));
    }
    res.status(204).end();
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
