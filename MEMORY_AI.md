# Fluence Lead Scanner — Summary (Session Dump)

## Estado Atual

### 📦 100% Cloudflare (Workers + D1 + Pages)
- **Worker:** `fluence-lead-scanner-api` — `fluence-lead-scanner-api.maitilupas.workers.dev`
- **Frontend (Pages):** `fluence-lead-scanner.pages.dev`
- **D1 Database:** `fluence-leads` (ID: `949471af-1670-4aa7-b65a-5b1f24078ccf`)
- **Local code:** `/root/fluence-lead-scanner/`

### 👤 Users
- admin@fluence.com / fluence2024 (role: admin)
- alex@fluence.com / fluence2024
- sophie@fluence.com / fluence2024

### 📊 Dados
- 1 lead existente: Jan Jansen, ACME Corp, Hot
- API auth funciona (login retorna JWT)
- CRUD endpoints todos implementados

### ✅ Funcionalidades no Frontend
- Login/Register multi-user
- Lead form completo (contacto, empresa, temperatura, deal size, timeline, produtos, notas, next action)
- OCR card scanner (Tesseract.js no browser)
- Voice notes (MediaRecorder)
- Search/filter na lista de leads
- Export Excel (SheetJS)
- Tema dark/light
- Mobile-first PWA

## ⚠️ Problema: Frontend deployado está STALE

O código local (`/root/fluence-lead-scanner/frontend/index.html`) tem:
```
API_BASE = 'https://fluence-lead-scanner-api.maitilupas.workers.dev';
```

Mas o deployado em pages.dev tem:
```
API_BASE = '';
```

Logo o login falha: tenta `pages.dev/api/auth/login` em vez de `workers.dev/api/auth/login`.

**Precisas de abrir este link para auth do wrangler:**
https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20workers%3Awrite%20d1%3Awrite%20pages%3Awrite%20zone%3Aread&state=itGAcbA0WliDqMvsvQXH7XJ7Ex9g8Jm1&code_challenge=IeMgA9lWwiGUYdrwtKSXdThKFp1NVmwN-LzP99NxUC4&code_challenge_method=S256

Depois de autenticar, corre:
```
cd /root/fluence-lead-scanner/frontend
npx wrangler pages deploy . --project-name fluence-lead-scanner
```

## 🔒 Infra Blindada (já feito)
- ✅ nginx default_server → 444 (sem IP exposto)
- ✅ IPv4 firewall DROP (só SSH/HTTP/HTTPS + established)
- ✅ IPv6 firewall DROP (mesma regra)
- ✅ Cloudflare tunnel ativo (tunnel ID: 5bbd0cc9-d7c2-481b-8b2d-4631a1b99c0f)
- ✅ Ingress tunnel: sync.grooveline.org → localhost:4000
- ✅ Compressão: threshold 0.2, nemotron free
- ✅ Modelo: deepseek-v4-pro (para tasks complexas)
- ✅ Repo GitHub: nexlineai/streamline-infra

## 🔲 O que André precisa de fazer no dashboard Cloudflare
1. Abrir o link de auth do wrangler (em cima)
2. stream.grooveline.org DNS → mudar de grey cloud para orange cloud

## 📁 Ficheiros Importantes
- `/root/fluence-lead-scanner/worker/src/index.js` → API Worker
- `/root/fluence-lead-scanner/worker/src/auth.js` → JWT auth
- `/root/fluence-lead-scanner/worker/src/db.js` → D1 queries
- `/root/fluence-lead-scanner/frontend/index.html` → PWA (54KB)
- `/root/fluence-lead-scanner/wrangler.toml` → config principal
- `/root/fluence-lead-scanner/worker/wrangler.toml` → config worker
- `/root/grooveline-platform/worker/wrangler.toml` → grooveline (tem IP exposto no SYNC_URL)
- `/root/streamline-infra/` → repo git com todas as configs
