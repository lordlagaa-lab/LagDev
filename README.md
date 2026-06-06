# Fluence Lead Scanner

App mobile-first para scanear cartões de visita e gerir leads em feiras/eventos.
**100% Cloudflare** — sem servidor próprio.

---

## 🔗 URLs Deployed

| Component | URL |
|-----------|-----|
| Frontend | https://fluence-lead-scanner.pages.dev |
| API (Worker) | https://fluence-lead-scanner-api.maitilupas.workers.dev |
| D1 Database | `fluence-leads` |

---

## 🔐 Credenciais (seed users)

| Nome | Email | Password | Role |
|------|-------|----------|------|
| Admin | admin@fluence.com | `fluence2024` | admin |
| Alex | alex@fluence.com | `fluence2024` | rep |
| Sophie | sophie@fluence.com | `fluence2024` | rep |
| James | james@fluence.com | `fluence2024` | rep |
| Priya | priya@fluence.com | `fluence2024` | rep |

---

## ☁️ Cloudflare Setup (necessário para correr localmente)

### Token API
Precisas de um token Cloudflare com:
- **D1:Edit**
- **Workers Scripts:Edit**
- **Cloudflare Pages:Edit**

```bash
# Opção 1: Login via browser (recomendado)
wrangler login

# Opção 2: Token direto (se não tiveres browser)
export CLOUDFLARE_API_TOKEN="cfut_..."
```

### D1 Database (já criada, UUID no wrangler.toml)

```bash
# Só precisas de correr o schema se estiveres a fazer setup fresh:
cd worker
wrangler d1 execute fluence-leads --file=schema.sql
```

### JWT Secret
```bash
wrangler secret put JWT_SECRET
# Cola: openssl rand -base64 32
```

---

## 🚀 Deploy (Automático)

**GitHub Actions** faz deploy automático sempre que fazes push para `main`.

### Setup dos Secrets no GitHub (1 vez só)

Vai a **Settings > Secrets and variables > Actions** e adiciona:

| Secret | Valor |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Token Cloudflare com Workers:Edit, D1:Edit, Pages:Edit |
| `JWT_SECRET` | `openssl rand -base64 32` (qualquer string aleatória) |

Depois disto, qualquer push para `main` faz deploy automático do worker + frontend.

### Deploy manual (alternativa)

```bash
export CLOUDFLARE_API_TOKEN="cfut_..."
cd worker && wrangler deploy
cd ../frontend && wrangler pages deploy .
```

---

## 📁 Estrutura do Repositório

```
fluence/
├── worker/
│   ├── src/
│   │   ├── index.js      # Worker principal (routes, handlers)
│   │   ├── db.js          # Camada D1 (CRUD, queries)
│   │   └── auth.js        # JWT + PBKDF2 (Web Crypto API)
│   ├── schema.sql         # D1 database schema
│   ├── wrangler.toml      # Config Cloudflare (com DB UUID preenchido)
│   └── package.json
├── frontend/
│   └── index.html         # App HTML/JS
├── nginx-fluence.conf     # Config do servidor (apenas referência, não necessário)
└── README.md
```

---

## 🤖 Para o Claude Code continuar

Se estás a usar Claude Code (ou qualquer AI agent) para dar manutenção a este projeto:

### Contexto necessário

1. **O projeto está 100% em Cloudflare** — Workers + D1 + Pages. Não há servidor físico.
2. **O frontend** está em `frontend/index.html` — já aponta para `https://fluence-lead-scanner-api.maitilupas.workers.dev`
3. **A API base** está definida no topo do `frontend/index.html` como `API_BASE`
4. **O worker** está em `worker/src/index.js` — todas as rotas, auth, CRUD
5. **A DB é D1** — SQLite na edge, schema em `worker/schema.sql`
6. **Auth** usa PBKDF2 (100k iterações) + JWT (7 dias)
7. **Nginx config** (`nginx-fluence.conf`) é só o catch-all 444 — não precisas de mexer
8. **JWT_SECRET** está definida como secret no Cloudflare — não está no código
9. **Temperatura** dos leads: `"hot"`, `"warm"`, `"cold"` (minúsculas) — validação no DB

### Para deployar do teu lado

```bash
# 1. Autenticar
wrangler login

# 2. Deploy worker
cd worker && wrangler deploy

# 3. Deploy frontend
cd ../frontend && wrangler pages deploy .
```

### Se precisares de criar users novos

```bash
# O worker tem endpoint POST /api/users (admin only)
# Podes também inserir diretamente na D1:
wrangler d1 execute fluence-leads --command="INSERT INTO users (name, email, password_hash, role) VALUES ('Nome', 'email@domain.com', '<pbkdf2_hash>', 'rep');"
```

---

## 🎯 Para usar com Claude (claude.ai)

Se vais pedir ajuda ao Claude (https://claude.ai), **copia e cola isto no chat**:

> **Projeto: Fluence Lead Scanner** — app mobile-first para scanear cartões de visita.
>
> **Stack:** 100% Cloudflare (Workers + D1 + Pages)
> **Repo:** https://github.com/nexlineai/fluence
>
> **Deployed:**
> - Frontend: https://fluence-lead-scanner.pages.dev
> - API: https://fluence-lead-scanner-api.maitilupas.workers.dev
>
> **Users teste:** admin@fluence.com / fluence2024 (admin)
>
> **Estrutura:**
> | Ficheiro | O que faz |
> |----------|-----------|
> | `frontend/index.html` | Interface HTML/JS |
> | `worker/src/index.js` | API routes e handlers |
> | `worker/src/db.js` | CRUD base de dados (D1) |
> | `worker/src/auth.js` | Login (PBKDF2 + JWT) |
> | `worker/schema.sql` | Schema da DB |
>
> **Regras:**
> - Temperatura dos leads: minúsculas ("hot", "warm", "cold")
> - Reps vêem só leads deles, admins vêem todos
> - JWT expira em 7 dias
> - GitHub Actions faz deploy automático no push para main
>
> Preciso que me ajudes com: [explica o que queres fazer]

---

## 📋 Notas

- Reps vêem APENAS os leads que criaram
- Admins vêem TODOS os leads
- Passwords hasheadas com PBKDF2 (100k iterações)
- JWT expira em 7 dias
- Dados sincronizados em tempo real com a Cloudflare edge
- Este repo é o SOURCE OF TRUTH — altera aqui e faz deploy
# Test deploy commit
