# Subir o Cadastro de Veículos no Coolify

## 1. Colocar num repositório

Suba esta pasta para um repositório próprio no GitHub (privado, como os outros
projetos satélite). Ficam de fora `.env` e `node_modules` — ver `.gitignore` e
`.dockerignore`.

## 2. Criar o recurso no Coolify

- **New Resource → Application → Public/Private Repository**, apontando para o repo.
- **Build Pack: Dockerfile** (o `Dockerfile` na raiz já está pronto). Se preferir
  o compose, escolha **Docker Compose** e aponte para `docker-compose.yaml`.
- **Port Exposes: `3000`** — é a porta que o container escuta.
- **Domínio**: escolha o subdomínio (ex.: `veiculos.a5ecossistema.tech` ou
  equivalente). O Coolify cuida do HTTPS.

## 3. Variáveis de ambiente

Em **Environment Variables** (marque as sensíveis como *secret*; todas são de
runtime, não de build):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `postgres://postgres:SENHA@85.31.63.37:5431/postgres` — string de conexão completa do Postgres |
| `POCKETBASE_URL` | `https://db.a5ecossistema.tech` |
| `POCKETBASE_ADMIN_EMAIL` | `hub@a5ecossistema.com` |
| `POCKETBASE_ADMIN_PASSWORD` | a senha do superusuário do PocketBase — **secret** |
| `POCKETBASE_COLLECTION` | `cadastro_veiculos_imagens` (já existe nesse PocketBase) |
| `ADMIN_USER` | usuário para logar no painel |
| `ADMIN_PASSWORD` | senha do painel — **secret**, troque a que está no `.env.example` local |
| `PORT` | `3000` |

Sem `DATABASE_URL`, `POCKETBASE_ADMIN_EMAIL`/`POCKETBASE_ADMIN_PASSWORD` ou
`ADMIN_USER`/`ADMIN_PASSWORD`, o serviço sobe mas responde `503` em tudo que
não for `/saude` — falha fechada, de propósito: é um cadastro que grava dados,
não pode ficar aberto por esquecimento no deploy.

O Postgres (`85.31.63.37:5431`) precisa estar acessível a partir da rede onde o
Coolify roda os containers — confirme que a porta está liberada para o IP do
servidor do Coolify, não só para a sua máquina.

## 4. Health check

Use **`GET /saude`** — não exige login. Resposta esperada:

```json
{"ok": true, "banco_conectado": true, "pocketbase_configurado": true, "autenticacao_configurada": true}
```

`ok: false` (com `200` ou `503`) indica qual das três peças está faltando —
confira o campo correspondente antes de suspeitar do resto.

## 5. Conferir depois de subir

```bash
curl https://SEU-DOMINIO/saude
curl -u usuario:senha https://SEU-DOMINIO/api/veiculos
```

A primeira subida cria a tabela `veiculos` sozinha (migração idempotente em
`src/db.js`, roda toda vez que o processo inicia e não faz nada se a tabela já
existir).

## O que já foi testado localmente antes deste deploy

Criação, edição (troca e remoção de imagem), exclusão (com limpeza da imagem
correspondente no PocketBase), busca, filtro por status, validação de campos
obrigatórios, rejeição de arquivo que não é imagem, e o bloqueio por senha nas
rotas do painel e da API — tudo contra o Postgres e o PocketBase reais
informados para este projeto, não contra mocks.
