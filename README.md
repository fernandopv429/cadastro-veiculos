# Cadastro de Veículos

Painel de CRUD para cadastro de veículos (marca, modelo, ano, placa, cor, preço,
quilometragem, status e descrição), com imagem por veículo.

- **Dados** (marca, modelo, preço, descrição, etc.): Postgres.
- **Imagem**: PocketBase. O Postgres guarda só a referência (id do registro +
  nome do arquivo no PocketBase); a URL pública é montada na hora a partir dela.
- **Painel**: HTML/CSS/JS estático servido pelo próprio backend, protegido por
  HTTP Basic Auth.

## Rodando local

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL, POCKETBASE_*, ADMIN_USER/PASSWORD
npm start
```

Abre em `http://localhost:3000` (pede usuário/senha do `.env`). A tabela
`veiculos` é criada automaticamente no Postgres na primeira subida
(`CREATE TABLE IF NOT EXISTS`, ver [src/db.js](src/db.js)).

## Estrutura

```
src/
  server.js     # Express, autenticação, arquivos estáticos, health check
  auth.js       # HTTP Basic Auth (falha fechada sem ADMIN_USER/ADMIN_PASSWORD)
  db.js         # pool do Postgres + migração idempotente
  pocketbase.js # upload/remoção de imagem no PocketBase
  veiculos.js   # rotas /api/veiculos (CRUD)
public/         # painel (index.html, app.js, style.css)
```

## API

Tudo em `/api/veiculos` exige Basic Auth.

| Método | Rota | Corpo |
|---|---|---|
| GET | `/api/veiculos?busca=&status=` | — |
| GET | `/api/veiculos/:id` | — |
| POST | `/api/veiculos` | `multipart/form-data`: marca*, modelo*, ano, placa, cor, preco, quilometragem, descricao, status, imagem (arquivo) |
| PUT | `/api/veiculos/:id` | idem POST, todos os campos opcionais; `remover_imagem=true` para tirar a imagem sem enviar outra |
| DELETE | `/api/veiculos/:id` | — |

`GET /saude` não exige autenticação (é o alvo do health check do Coolify) e
devolve se o Postgres e o PocketBase estão configurados e de pé.

## Imagem no PocketBase

A coleção usada é `cadastro_veiculos_imagens` (configurável via
`POCKETBASE_COLLECTION`), com um campo de arquivo `imagem`. `viewRule`/`listRule`
estão públicos (para as imagens abrirem direto no `<img src>` do painel sem
autenticação); criar/editar/apagar continuam restritos a superusuário — só o
backend, autenticado com `POCKETBASE_ADMIN_EMAIL`/`POCKETBASE_ADMIN_PASSWORD`,
consegue gravar.

## Deploy

Ver [DEPLOY-COOLIFY.md](DEPLOY-COOLIFY.md).
