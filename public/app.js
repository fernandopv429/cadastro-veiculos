const grade = document.getElementById("grade");
const vazio = document.getElementById("vazio");
const mensagem = document.getElementById("mensagem");
const dialogo = document.getElementById("dialogo-form");
const form = document.getElementById("form-veiculo");
const filtroBusca = document.getElementById("filtro-busca");
const filtroStatus = document.getElementById("filtro-status");

const STATUS_LABEL = { disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido" };

let debounceBusca = null;

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

function card(v) {
  const el = document.createElement("div");
  el.className = "card";

  const img = v.imagem_url
    ? `<img class="imagem" src="${v.imagem_url}" alt="${v.marca} ${v.modelo}" loading="lazy" />`
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

function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
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

function abreFormulario(v) {
  form.reset();
  document.getElementById("preview-wrap").hidden = true;
  document.getElementById("campo-remover-imagem").checked = false;

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
    if (v.imagem_url) {
      document.getElementById("preview-imagem").src = v.imagem_url;
      document.getElementById("preview-wrap").hidden = false;
    }
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

document.getElementById("campo-imagem").addEventListener("change", (ev) => {
  const arquivo = ev.target.files[0];
  if (!arquivo) return;
  const url = URL.createObjectURL(arquivo);
  document.getElementById("preview-imagem").src = url;
  document.getElementById("preview-wrap").hidden = false;
  document.getElementById("campo-remover-imagem").checked = false;
});

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = document.getElementById("campo-id").value;
  const dados = new FormData(form);

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
