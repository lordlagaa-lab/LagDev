# Fluence Lead Scanner

App mobile-first para scanear cartões de visita e gerir leads em feiras/eventos.

## Arquitectura

```
Frontend (HTML/JS)  →  Cloudflare Worker (API)  →  Cloudflare D1 (SQLite)
```

## Deploy

### 1. Criar a D1 database

```bash
cd worker
wrangler d1 create fluence-leads
```

Copia o `database_id` que aparece no output e cola no `wrangler.toml`.

### 2. Inicializar schema

```bash
wrangler d1 execute fluence-leads --file=schema.sql
```

### 3. Gerar passwords e inserir users

O schema.sql tem placeholders. Gera hashes PBKDF2 com este script:

```bash
node -e "
const { webcrypto } = require('crypto');
const { subtle } = webcrypto;
async function hash(pw) {
  const salt = crypto.randomUUID().slice(0, 16);
  const key = await subtle.importKey('raw', Buffer.from(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', salt: Buffer.from(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return 'pbkdf2:100000:' + salt + ':' + Buffer.from(bits).toString('base64url');
}
Promise.all(['password1','password2']).then(h => console.log(h.join('\n')));
"
```

Depois insere manualmente na D1:
```bash
wrangler d1 execute fluence-leads --command="INSERT INTO users (name, email, password_hash, role) VALUES ('Alex van der Berg', 'alex@fluence.com', '<hash>', 'rep');"
```

### 4. Configurar JWT_SECRET

```bash
wrangler secret put JWT_SECRET
# Gera um segredo aleatório: openssl rand -base64 32
```

### 5. Deploy do Worker

```bash
wrangler deploy
```

### 6. Configurar frontend

Edita `frontend/index.html` e muda a linha:

```js
const API_BASE = 'https://fluence-scanner.yourdomain.com';
```

Para o URL do teu worker (aparece no output do `wrangler deploy`).

### 7. Fazer deploy do frontend

Podes hospedar o `frontend/index.html` em:
- Cloudflare Pages (`wrangler pages deploy frontend/`)
- Qualquer static host (Netlify, Vercel, S3)
- Ou servir pelo próprio worker (adicionar rota static)

## Estrutura

```
├── worker/
│   ├── src/
│   │   ├── index.js      # Worker principal (routes, handlers)
│   │   ├── db.js          # Camada D1 (CRUD, queries)
│   │   └── auth.js        # JWT + PBKDF2 (Web Crypto API)
│   ├── schema.sql         # D1 database schema
│   ├── wrangler.toml      # Config Cloudflare
│   └── package.json
├── frontend/
│   └── index.html         # App modificada (usa API em vez de localStorage)
└── README.md
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | ❌ | Login (email + password) → JWT |
| POST | /api/auth/register | ❌ | Registar novo user |
| GET | /api/leads | ✅ | Listar leads (filtros: search, temperature, show_id, assigned_to) |
| POST | /api/leads | ✅ | Criar lead |
| GET | /api/leads/:id | ✅ | Ver lead |
| PUT | /api/leads/:id | ✅ | Editar lead |
| DELETE | /api/leads/:id | ✅ | Apagar lead |
| GET | /api/leads/stats | ✅ | Estatísticas (total, hot, warm, actions) |
| GET | /api/leads/export | ✅ | Exportar todos (JSON) |
| GET | /api/users | ✅ | Listar users |
| POST | /api/users | 🔒 | Criar user (admin only) |
| GET | /api/shows | ✅ | Listar eventos |
| POST | /api/shows | 🔒 | Criar evento (admin only) |

## Notas

- Reps vêem APENAS os leads que criaram
- Admins vêem TODOS os leads
- Passwords hasheadas com PBKDF2 (100k iterações)
- JWT expira em 7 dias
- Dados sincronizados em tempo real com a Cloudflare edge
