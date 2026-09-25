// Cliente mínimo para o PocketBase: guarda as imagens dos veículos.
// O Postgres guarda só a referência (id do registro + nome do arquivo); a URL
// pública é montada na hora, então trocar de domínio do PocketBase não exige
// migração de dados.

const PB_URL = (process.env.POCKETBASE_URL || "").replace(/\/+$/, "");
const PB_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const PB_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;
const COLLECTION = process.env.POCKETBASE_COLLECTION || "cadastro_veiculos_imagens";

let tokenCache = null; // { token, expiraEm }

function configurado() {
  return Boolean(PB_URL && PB_EMAIL && PB_PASSWORD);
}

async function autentica() {
  const resp = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(`PocketBase recusou a autenticação (${resp.status}): ${detalhe.slice(0, 300)}`);
  }
  const dados = await resp.json();
  // Token dura horas; renovamos com folga de 5 minutos para não bater em 401 no meio de um upload.
  tokenCache = { token: dados.token, expiraEm: Date.now() + 25 * 60 * 1000 };
  return tokenCache.token;
}

async function token() {
  if (tokenCache && tokenCache.expiraEm > Date.now()) return tokenCache.token;
  return autentica();
}

async function chamada(caminho, opcoes = {}, tentativaDeNovo = true) {
  const tk = await token();
  const resp = await fetch(`${PB_URL}${caminho}`, {
    ...opcoes,
    headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${tk}` },
  });
  if (resp.status === 401 && tentativaDeNovo) {
    tokenCache = null;
    return chamada(caminho, opcoes, false);
  }
  return resp;
}

async function enviaImagem(buffer, nomeArquivo, mimetype) {
  if (!configurado()) {
    throw new Error("PocketBase não configurado (POCKETBASE_URL/ADMIN_EMAIL/ADMIN_PASSWORD)");
  }
  const form = new FormData();
  form.append("imagem", new Blob([buffer], { type: mimetype }), nomeArquivo);

  const resp = await chamada(`/api/collections/${COLLECTION}/records`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(`Falha ao enviar imagem ao PocketBase (${resp.status}): ${detalhe.slice(0, 300)}`);
  }
  const registro = await resp.json();
  const arquivo = Array.isArray(registro.imagem) ? registro.imagem[0] : registro.imagem;
  return { recordId: registro.id, filename: arquivo };
}

async function removeImagem(recordId) {
  if (!recordId) return;
  if (!configurado()) return;
  const resp = await chamada(`/api/collections/${COLLECTION}/records/${recordId}`, {
    method: "DELETE",
  });
  // 404 é aceitável (já não existe); qualquer outro erro sobe.
  if (!resp.ok && resp.status !== 404) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(`Falha ao remover imagem do PocketBase (${resp.status}): ${detalhe.slice(0, 300)}`);
  }
}

function urlImagem(recordId, filename) {
  if (!recordId || !filename || !PB_URL) return null;
  return `${PB_URL}/api/files/${COLLECTION}/${recordId}/${filename}`;
}

module.exports = { configurado, enviaImagem, removeImagem, urlImagem };
