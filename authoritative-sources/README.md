# Authoritative sources (Git-tracked)

Put official / primary-authority documents **in this folder**, list them in `manifest.json`, then commit and push to GitHub.

On server start, Chai syncs this folder into Knowledge Governance (approved + indexed) so research can cite them.

## How to add a document

1. Copy the file into a subfolder:
   - `tax/` — IRC, Treasury regs, IRS pubs/forms
   - `audit/` — PCAOB / AICPA / GAGAS materials you are allowed to host
   - `financial-accounting/` — ASC / IFRS / SEC materials you are allowed to host
   - `other/` — anything else with clear licensing
2. Open `manifest.json` and add an entry (see examples below).
3. Commit both the file **and** the manifest row.
4. Restart the server (`npm run dev` or `npm start`).

Allowed file types: `.pdf` `.docx` `.txt` `.md` `.csv` `.xlsx`

## `manifest.json` entry shape

```json
{
  "id": "irs-pub-946-2025",
  "file": "tax/irs-pub-946-2025.txt",
  "publisher": "IRS",
  "title": "Publication 946 (2025) — How To Depreciate Property",
  "sourceType": "authoritative",
  "category": "tax",
  "authorityLevel": "official_guidance",
  "licensingStatus": "public",
  "jurisdiction": "US-federal",
  "taxYear": 2025,
  "accountingFramework": "TAX",
  "topic": "depreciation",
  "effectiveDate": "2025-01-01"
}
```

Required fields: `id`, `file`, `publisher`, `title`, `sourceType`, `category`, `authorityLevel`, `licensingStatus`

## Licensing (important)

You are responsible for what you push.

- Prefer **public** materials (e.g. many IRS publications) when the repo is public.
- **Do not** commit FASB Codification dumps, paid tax research exports, or other licensed content unless your license clearly allows redistribution in a public GitHub repo and public web app.
- Purchasing access ≠ permission to publish the full text for other users’ AI.

Set `licensingStatus` honestly (`public`, `licensed`, `restricted`, `permission_required`).

## Runtime note

Synced copies used by search live under gitignored `data/knowledge-governance/`.  
**This folder** (`authoritative-sources/`) is what you version in Git.
