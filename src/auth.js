const crypto = require("crypto");

const USER = process.env.ADMIN_USER;
const PASSWORD = process.env.ADMIN_PASSWORD;

function comparaSeguro(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Falha fechada: sem ADMIN_USER/ADMIN_PASSWORD configurados, todo pedido é recusado.
// É um painel de cadastro (escreve dados), não pode ficar aberto por esquecimento no deploy.
function basicAuth(req, res, next) {
  if (!USER || !PASSWORD) {
    return res.status(503).json({ error: "autenticação não configurada (ADMIN_USER/ADMIN_PASSWORD)" });
  }

  const cabecalho = req.headers.authorization || "";
  const [tipo, credenciais] = cabecalho.split(" ");
  if (tipo === "Basic" && credenciais) {
    const decodificado = Buffer.from(credenciais, "base64").toString("utf8");
    const idx = decodificado.indexOf(":");
    const usuario = idx >= 0 ? decodificado.slice(0, idx) : decodificado;
    const senha = idx >= 0 ? decodificado.slice(idx + 1) : "";
    if (comparaSeguro(usuario, USER) && comparaSeguro(senha, PASSWORD)) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="Cadastro de veículos"');
  return res.status(401).json({ error: "credenciais inválidas" });
}

module.exports = { basicAuth };
