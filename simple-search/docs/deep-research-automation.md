# Deep Research Automation

This doc captures the CLI workflow for sending Evidentia deep-research prompts to Perplexity, formatting the results with Gemini, and saving analyses to Supabase.

## Overview

- **Prompt source** — we continue to reuse `COMPILE SIMILAR PAPERS.md`. The scripts inject target paper metadata but otherwise leave the text untouched.
- **Models** — Perplexity `sonar-deep-research` processes the request, Gemini (default `gemini-2.0-flash`, override with `GEMINI_MODEL`) reformats into the reproducibility schema.
- **Persistence** — formatted payloads are stored in `public.paper_analyses` with raw prompt/response snapshots for traceability.

## Environment Variables

```
PERPLEXITY_API_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash (optional override)
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
```

`loadEnvFiles()` reads `.env.local` / `.env` from both repo root and `simple-search/`, so add variables to whichever file you already use for CLI scripts.

## CLI Commands

Run these from `simple-search/`.

### 1. Generate Prompts

```
npm run recent-prompts
```

- Select the researcher.
- Paste a JSON object/array describing the target paper(s), then type `END` on its own line.
- The script prints each prompt; add `--copy` to put the first prompt on the clipboard instead of emailing it manually.

### 2. Automate Deep Research + Ingestion

```
npm run deep-prompts            # interactive run
npm run deep-prompts --dry-run   # build prompts only
npm run deep-prompts --skip-save # call models but skip Supabase insert
```

Workflow:
1. Select researcher and paste the same paper JSON payload.
2. Script builds the prompt, calls Perplexity, strips `<think>...</think>` sections.
3. Gemini receives the raw analysis plus the strict formatting prompt and returns minified JSON.
4. We validate array lengths, cluster labels, highlight pattern, and matrix keys before saving.
5. Successful runs land in `paper_analyses` with status `approved` and `model_version` `perplexity.sonar-deep-research+gemini-2.5`.
6. If Perplexity returns a credit/402 error, the prompt is emailed to the researcher (or printed to the console if email is unconfigured) so the legacy workflow still works.

### 3. Manual Ingestion (Optional)

```
npm run ingest-analyses
```

Use when you already have Perplexity + Gemini output (e.g., for backfilling). The script collects:
- Perplexity prompt
- Perplexity response
- Gemini JSON payload

…and stores them under the selected researcher.

## Paper Payload Format

Paste an object or array of objects. Minimal fields:

```
{
  "title": "Paper title",
  "authors": ["Author A", "Author B"],
  "venue": "Conference 2024",
  "year": 2024,
  "doi": "10.1234/example",
  "url": "https://...",
  "abstract": "Short abstract"
}
```

Strings for `authors` are split on commas/semicolons.

## Table Schema

Migration `0005_create_paper_analyses.sql` adds:

- `paper_analyses(researcher_id, paper_title, paper_identifier, prompt_fingerprint, perplexity_prompt, perplexity_response, gemini_payload, status, model_version, …)`
- Unique fingerprint per researcher/prompt for idempotent reruns.
- RLS: researchers can view/update their rows; service role has full access.

## Validation Rules

Before persisting, we enforce:
- `feasibilitySnapshot`: 5–7 entries, question text starts with *Do you have / Can you / Are you equipped to*.
- `methodFindingCrosswalk.papers`: 3–5 entries, `clusterLabel` in `{Sample and model, Field deployments, Insight primers}`.
- `highlight` matches allowed prefixes.
- Every crosswalk `matrix` includes all eight keys.

Failures throw explicit CLI errors so you can re-run or escalate.

## Notes

- `--dry-run` skips both model calls and Supabase writes but still assembles prompts for inspection.
- Retain Perplexity + Gemini keys in `.env.local`; scripts abort early if they’re missing.
- The automation keeps raw prompt/response in Supabase, making it easy to audit or regenerate Gemini formatting later.
- Perplexity credit exhaustion automatically falls back to emailing the prompt (requires `RESEND_API_KEY`/`RESEND_FROM_EMAIL`).
