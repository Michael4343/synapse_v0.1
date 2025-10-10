# Deep Research → Evidentia JSON Prompt

Use this prompt after your deep-research agent finishes its write-up. It converts free-form notes into the JSON structure rendered on the landing page.

```
You are formatting a deep-research briefing into Evidentia's verification schema. Return ONLY valid JSON matching:

{
  "stage": "ai_research" | "human_review" | "community_feedback",
  "lastUpdated": "ISO-8601 date",
  "reviewers": string[],
  "summary": string,
  "paper": {
    "title": string,
    "authors": string,
    "venue": string,
    "doi": string | null
  },
  "feasibilityQuestions": [
    {
      "id": string,
      "question": string,
      "weight": 1 | 2 | 3,
      "helper"?: string,
      "category"?: string
    }
  ],
  "criticalPath": [
    {
      "id": string,
      "name": string,
      "deliverable": string,
      "checklist": string[],
      "primaryRisk": {
        "severity": "critical" | "moderate" | "minor",
        "issue": string,
        "mitigation": string
      } | null
    }
  ],
  "evidence": {
    "strong": [
      {
        "claim": string,
        "source": string,
        "confidence"?: "verified" | "inferred" | "uncertain",
        "notes"?: string
      }
    ],
    "gaps": [
      {
        "description": string,
        "impact": string,
        "severity": "critical" | "moderate" | "minor",
        "needsExpert"?: boolean
      }
    ],
    "assumptions": string[]
  }
}

Formatting rules:
1. Populate every required field from the notes supplied below. Leave `doi` null if not provided.
2. Use today's date (YYYY-MM-DD) for `lastUpdated`.
3. Choose `stage`: `ai_research` for automated desk review, `human_review` for analyst-confirmed work, `community_feedback` when external labs contributed.
4. `reviewers` lists everyone involved, e.g. `["AI Research Desk"]` or `["Michael Evidentia"]`.
5. Feasibility questions are yes/no lab capability checks. Provide 5–7 items with `weight` 1–3 and 1-sentence helpers.
6. Add 3–5 critical path phases. Each needs a deliverable, a checklist (3+ action items), and a single `primaryRisk`. Use null if no major risk was identified.
7. Evidence → focus on 3–5 headline claims under `strong`, 2–4 open issues under `gaps`, and 3–5 bullet assumptions.
8. Cite precise sources (e.g. "Figure 3C", "Methods – Sample Prep", specific GitHub URLs).
9. Do not include Markdown code fences or commentary—return minified JSON only.

SOURCE NOTES
<<<BEGIN>>>
{{PASTE RAW DEEP-RESEARCH OUTPUT HERE}}
<<<END>>>
```

Paste your agent's notes into the placeholder and run the prompt in Claude/GPT. The JSON can then be stored via `npm run verification-complete` or inserted directly into Supabase.
