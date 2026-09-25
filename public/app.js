const grade = document.getElementById("grade");
const vazio = document.getElementById("vazio");
const mensagem = document.getElementById("mensagem");
const dialogo = document.getElementById("dialogo-form");
const form = document.getElementById("form-veiculo");
const filtroBusca = document.getElementById("filtro-busca");
const filtroStatus = document.getElementById("filtro-status");
const campoImagens = document.getElementById("campo-imagens");
const galeriaAtual = document.getElementById("galeria-atual");
const galeriaNovas = document.getElementById("galeria-novas");

const STATUS_LABEL = { disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido" };
const MAX_IMAGENS = 20;

let debounceBusca = null;
let imagensParaRemover = new Set();
let arquivosNovos = [];

function formataPreco(valor) {
  if (valor === null || valor === undefined) return null;
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mostraMensagem(texto, tipo = "info") {
  mensagem.textContent = texto;
  mensagem.hidden = false;
  mensagem.className = `mensagem ${tipo === "erro" ? "erro" : ""}`;
  if (tipo !== "erro") {
    setTimeout(() => { mensagem.hidden = true; }, 3000);
  }
}

async function api(caminho, opcoes = {}) {
  const resp = await fetch(caminho, opcoes);
  if (resp.status === 401) {
    mostraMensagem("Sessão expirada ou credenciais inválidas. Recarregue a página.", "erro");
    throw new Error("não autorizado");
  }
  if (!resp.ok) {
    let detalhe = "";
    try { detalhe = (await resp.json()).error; } catch (_) {}
    throw new Error(detalhe || `erro ${resp.status}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function card(v) {
  const el = document.createElement("div");
  el.className = "card";

  const primeira = v.imagens[0];
  const img = primeira
    ? `<div class="imagem-wrap"><img class="imagem" src="${primeira.url}" alt="${v.marca} ${v.modelo}" loading="lazy" />${v.imagens.length > 1 ? `<span class="badge-fotos">+${v.imagens.length - 1}</span>` : ""}</div>`
    : `<div class="sem-imagem">sem imagem</div>`;

  const preco = formataPreco(v.preco);

  el.innerHTML = `
    ${img}
    <div class="card-corpo">
      <span class="status-badge status-${v.status}">${STATUS_LABEL[v.status] || v.status}</span>
      <div class="card-titulo">${v.marca} ${v.modelo}${v.ano ? ` · ${v.ano}` : ""}</div>
      <div class="card-sub">${[v.placa, v.cor, v.quilometragem ? `${v.quilometragem.toLocaleString("pt-BR")} km` : null].filter(Boolean).join(" · ") || "—"}</div>
      ${preco ? `<div class="card-preco">${preco}</div>` : ""}
      ${v.descricao ? `<div class="card-descricao">${escapeHtml(v.descricao)}</div>` : ""}
      <div class="card-acoes">
        <button class="botao btn-editar">Editar</button>
        <button class="botao botao-perigo btn-excluir">Excluir</button>
      </div>
    </div>
  `;

  el.querySelector(".btn-editar").addEventListener("click", () => abreFormulario(v));
  el.querySelector(".btn-excluir").addEventListener("click", () => excluir(v));
  return el;
}

async function carrega() {
  const params = new URLSearchParams();
  if (filtroBusca.value.trim()) params.set("busca", filtroBusca.value.trim());
  if (filtroStatus.value) params.set("status", filtroStatus.value);

  try {
    const veiculos = await api(`/api/veiculos?${params.toString()}`);
    grade.innerHTML = "";
    vazio.hidden = veiculos.length > 0;
    veiculos.forEach((v) => grade.appendChild(card(v)));
  } catch (erro) {
    mostraMensagem(`Falha ao carregar veículos: ${erro.message}`, "erro");
  }
}

function renderizaGaleriaAtual(imagens) {
  galeriaAtual.innerHTML = "";
  imagens
    .filter((img) => !imagensParaRemover.has(img.id))
    .forEach((img) => {
      const item = document.createElement("div");
      item.className = "galeria-item";
      item.innerHTML = `<img src="${img.url}" alt="imagem do veículo" /><button type="button" class="galeria-remover" title="remover esta imagem">×</button>`;
      item.querySelector(".galeria-remover").addEventListener("click", () => {
        imagensParaRemover.add(img.id);
        renderizaGaleriaAtual(imagens);
      });
      galeriaAtual.appendChild(item);
    });
}

function sincronizaInputImagens() {
  const dt = new DataTransfer();
  arquivosNovos.forEach((arquivo) => dt.items.add(arquivo));
  campoImagens.files = dt.files;
}

function renderizaGaleriaNovas() {
  galeriaNovas.innerHTML = "";
  arquivosNovos.forEach((arquivo, indice) => {
    const url = URL.createObjectURL(arquivo);
    const item = document.createElement("div");
    item.className = "galeria-item";
    item.innerHTML = `<img src="${url}" alt="nova imagem" /><button type="button" class="galeria-remover" title="remover">×</button>`;
    item.querySelector(".galeria-remover").addEventListener("click", () => {
      arquivosNovos.splice(indice, 1);
      sincronizaInputImagens();
      renderizaGaleriaNovas();
    });
    galeriaNovas.appendChild(item);
  });
}

function abreFormulario(v) {
  form.reset();
  imagensParaRemover = new Set();
  arquivosNovos = [];
  galeriaAtual.innerHTML = "";
  galeriaNovas.innerHTML = "";

  if (v) {
    document.getElementById("form-titulo").textContent = "Editar veículo";
    document.getElementById("campo-id").value = v.id;
    document.getElementById("campo-marca").value = v.marca || "";
    document.getElementById("campo-modelo").value = v.modelo || "";
    document.getElementById("campo-ano").value = v.ano || "";
    document.getElementById("campo-placa").value = v.placa || "";
    document.getElementById("campo-cor").value = v.cor || "";
    document.getElementById("campo-preco").value = v.preco ?? "";
    document.getElementById("campo-quilometragem").value = v.quilometragem ?? "";
    document.getElementById("campo-status").value = v.status || "disponivel";
    document.getElementById("campo-descricao").value = v.descricao || "";
    renderizaGaleriaAtual(v.imagens);
  } else {
    document.getElementById("form-titulo").textContent = "Novo veículo";
    document.getElementById("campo-id").value = "";
  }
  dialogo.showModal();
}

async function excluir(v) {
  if (!confirm(`Excluir ${v.marca} ${v.modelo}? Essa ação não pode ser desfeita.`)) return;
  try {
    await api(`/api/veiculos/${v.id}`, { method: "DELETE" });
    mostraMensagem("Veículo excluído.");
    carrega();
  } catch (erro) {
    mostraMensagem(`Falha ao excluir: ${erro.message}`, "erro");
  }
}

document.getElementById("btn-novo").addEventListener("click", () => abreFormulario(null));
document.getElementById("btn-cancelar").addEventListener("click", () => dialogo.close());

campoImagens.addEventListener("change", (ev) => {
  arquivosNovos = arquivosNovos.concat(Array.from(ev.target.files)).slice(0, MAX_IMAGENS);
  sincronizaInputImagens();
  renderizaGaleriaNovas();
});

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = document.getElementById("campo-id").value;
  const dados = new FormData(form);
  if (imagensParaRemover.size) {
    dados.set("remover_imagens", JSON.stringify([...imagensParaRemover]));
  }

  try {
    if (id) {
      await api(`/api/veiculos/${id}`, { method: "PUT", body: dados });
      mostraMensagem("Veículo atualizado.");
    } else {
      await api("/api/veiculos", { method: "POST", body: dados });
      mostraMensagem("Veículo cadastrado.");
    }
    dialogo.close();
    carrega();
  } catch (erro) {
    mostraMensagem(`Falha ao salvar: ${erro.message}`, "erro");
  }
});

filtroBusca.addEventListener("input", () => {
  clearTimeout(debounceBusca);
  debounceBusca = setTimeout(carrega, 300);
});
filtroStatus.addEventListener("change", carrega);

carrega();
