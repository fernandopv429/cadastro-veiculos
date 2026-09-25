const express = require("express");
const multer = require("multer");
const { pool } = require("./db");
const pocketbase = require("./pocketbase");
const { basicAuth } = require("./auth");

const MAX_IMAGENS = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_IMAGENS },
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
  const imagens = (linha.imagens || [])
    .filter((img) => img.id !== null)
    .sort((a, b) => a.ordem - b.ordem)
    .map((img) => ({
      id: img.id,
      url: pocketbase.urlImagem(img.pb_record_id, img.pb_filename),
    }));
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
    imagens,
    created_at: linha.created_at,
    updated_at: linha.updated_at,
  };
}

// Um único SELECT com as imagens agregadas em json, na ordem certa.
const SELECT_COM_IMAGENS = `
  SELECT v.*, COALESCE(
    json_agg(
      json_build_object(
        'id', vi.id, 'pb_record_id', vi.imagem_pb_record_id,
        'pb_filename', vi.imagem_pb_filename, 'ordem', vi.ordem
      ) ORDER BY vi.ordem
    ) FILTER (WHERE vi.id IS NOT NULL),
    '[]'
  ) AS imagens
  FROM veiculos v
  LEFT JOIN veiculo_imagens vi ON vi.veiculo_id = v.id
`;

// Envia várias imagens ao PocketBase (uma por registro) e insere as linhas
// correspondentes em veiculo_imagens. Se alguma falhar no meio do caminho,
// desfaz o que já tinha subido para não deixar arquivo órfão no PocketBase.
async function adicionaImagens(veiculoId, arquivos, ordemInicial) {
  const enviados = [];
  try {
    for (let i = 0; i < arquivos.length; i++) {
      const arquivo = arquivos[i];
      const enviado = await pocketbase.enviaImagem(arquivo.buffer, arquivo.originalname, arquivo.mimetype);
      enviados.push(enviado);
      await pool.query(
        `INSERT INTO veiculo_imagens (veiculo_id, imagem_pb_record_id, imagem_pb_filename, ordem)
         VALUES ($1,$2,$3,$4)`,
        [veiculoId, enviado.recordId, enviado.filename, ordemInicial + i]
      );
    }
  } catch (erro) {
    await Promise.all(enviados.map((e) => pocketbase.removeImagem(e.recordId).catch(() => {})));
    throw erro;
  }
}

router.get("/", async (req, res, next) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
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
      `${SELECT_COM_IMAGENS} ${where} GROUP BY v.id ORDER BY v.created_at DESC`,
      valores
    );
    res.json(rows.map(serializa));
  } catch (erro) {
    next(erro);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    const { rows } = await pool.query(
      `${SELECT_COM_IMAGENS} WHERE v.id = $1 GROUP BY v.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "veículo não encontrado" });
    res.json(serializa(rows[0]));
  } catch (erro) {
    next(erro);
  }
});

router.post("/", basicAuth, upload.array("imagens", MAX_IMAGENS), async (req, res, next) => {
  let veiculoId = null;
  try {
    const { marca, modelo } = req.body;
    if (!marca || !modelo) {
      return res.status(400).json({ error: "marca e modelo são obrigatórios" });
    }
    const status = STATUS_VALIDOS.includes(req.body.status) ? req.body.status : "disponivel";

    const { rows } = await pool.query(
      `INSERT INTO veiculos (marca, modelo, ano, placa, cor, preco, quilometragem, descricao, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
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
      ]
    );
    veiculoId = rows[0].id;

    if (req.files && req.files.length) {
      await adicionaImagens(veiculoId, req.files, 0);
    }

    const { rows: completo } = await pool.query(`${SELECT_COM_IMAGENS} WHERE v.id = $1 GROUP BY v.id`, [veiculoId]);
    res.status(201).json(serializa(completo[0]));
  } catch (erro) {
    if (veiculoId) {
      await pool.query("DELETE FROM veiculos WHERE id = $1", [veiculoId]).catch(() => {});
    }
    next(erro);
  }
});

router.put("/:id", basicAuth, upload.array("imagens", MAX_IMAGENS), async (req, res, next) => {
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

    await pool.query(
      `UPDATE veiculos SET
        marca=$1, modelo=$2, ano=$3, placa=$4, cor=$5, preco=$6, quilometragem=$7,
        descricao=$8, status=$9, updated_at=now()
       WHERE id=$10`,
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
        req.params.id,
      ]
    );

    // remover_imagens: JSON com os ids (de veiculo_imagens) a apagar — validados
    // contra este veículo antes de mexer no PocketBase, para um id de outro
    // veículo não conseguir apagar imagem alheia.
    if (req.body.remover_imagens) {
      let ids = [];
      try {
        ids = JSON.parse(req.body.remover_imagens);
      } catch (_) {
        return res.status(400).json({ error: "remover_imagens precisa ser um JSON com uma lista de ids" });
      }
      if (Array.isArray(ids) && ids.length) {
        const { rows: paraRemover } = await pool.query(
          "SELECT * FROM veiculo_imagens WHERE veiculo_id = $1 AND id = ANY($2::int[])",
          [req.params.id, ids]
        );
        for (const img of paraRemover) {
          await pool.query("DELETE FROM veiculo_imagens WHERE id = $1", [img.id]);
          await pocketbase.removeImagem(img.imagem_pb_record_id).catch((e) =>
            console.error("  aviso: falha ao remover imagem:", e.message)
          );
        }
      }
    }

    if (req.files && req.files.length) {
      const { rows: maxOrdem } = await pool.query(
        "SELECT COALESCE(MAX(ordem), -1) AS max FROM veiculo_imagens WHERE veiculo_id = $1",
        [req.params.id]
      );
      await adicionaImagens(req.params.id, req.files, maxOrdem[0].max + 1);
    }

    const { rows: completo } = await pool.query(`${SELECT_COM_IMAGENS} WHERE v.id = $1 GROUP BY v.id`, [req.params.id]);
    res.json(serializa(completo[0]));
  } catch (erro) {
    next(erro);
  }
});

router.delete("/:id", basicAuth, async (req, res, next) => {
  try {
    const { rows: imagens } = await pool.query("SELECT * FROM veiculo_imagens WHERE veiculo_id = $1", [req.params.id]);
    const { rows } = await pool.query("DELETE FROM veiculos WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "veículo não encontrado" });
    await Promise.all(
      imagens.map((img) =>
        pocketbase.removeImagem(img.imagem_pb_record_id).catch((e) => console.error("  aviso: falha ao remover imagem:", e.message))
      )
    );
    res.status(204).end();
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
