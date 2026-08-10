# Chai

Accounting assistant: the website talks to a small **middleman server**; that server holds the OpenAI key and runs depreciation tools. Visitors never see the key.

## How it fits together

1. Browser = Chai chat UI  
2. Middleman = `server/` (`/api/chat`) — has `OPENAI_API_KEY`  
3. OpenAI + calculators run only on the middleman  

## Knowledge Governance

Admin-only area in the sidebar. Set `CHAI_ADMIN_TOKEN` in `.env`, paste the same token in the Governance panel.

- Approved internal sources are searched first (mock/local retrieval by default)
- If insufficient, approved-domain official research runs (mock by default)
- Unsupported conclusions are blocked
- User **Files** remain separate and are never primary legal authority

## Uploaded files

Use **Files** in the sidebar (or the paperclip in chat) to upload PDF/TXT/MD/CSV/JSON.  
Files are stored under `data/documents/` on the server, embedded with OpenAI, and searched via the `search_documents` tool. Answers include verbatim quotes.

## Local setup

1. `npm install`
2. Copy `.env.example` → `.env` and paste your OpenAI key:
   ```
   OPENAI_API_KEY=sk-...
   ```
3. `npm run dev`  
   - Website: http://localhost:5173  
   - Middleman: http://localhost:3001  

Get a key at https://platform.openai.com/api-keys (billing required). Set a spend limit.

## Tests

```bash
npm test
```

## Deploy (safe for a public site)

1. `npm run build`
2. On your host (Railway, Render, Fly, a VPS, etc.):
   - Start command: `npm start`
   - Set env var **`OPENAI_API_KEY`** in the host’s secret/settings panel (not in the frontend)
3. Open the public URL. The same server serves the website and `/api/chat`.

Do **not** put the key in any `VITE_` variable.
