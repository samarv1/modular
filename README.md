# Modular

Import your existing resumes, and every job, project, and school gets pulled apart into reusable entries you can drag into new one-page resumes without touching LaTeX or text files again.

---

## The problem

Tailoring a resume per application usually means duplicating a file and hand-editing it, or keeping five slightly-different versions around. Modular treats your resume history as a bank of interchangeable pieces instead of a single linear document, so building a new variant is drag-and-drop, instead of copy-and-paste.

## How it works

**Import.** Upload a resume as a ZIP (LaTeX source) or a PDF. If the ZIP already matches the [Jake's Resume](https://github.com/jakegut/resume) template family, it's parsed directly: every `\resumeSubheading`, `\resumeProjectHeading`, and section body becomes its own bank entry. Otherwise it goes through Gemini instead of getting rejected: a PDF is converted to markdown text first (via markitdown), while a ZIP in some other template hands over its raw LaTeX source as-is. Gemini restructures that text into the same entry shape, a synthesizer regenerates it as Jake's-template-compliant LaTeX, and it's run back through the same parser. Every import path ends up in the same bank.

**Bank.** Every imported entry is edited through structured fields (title, org, dates, bullets), not raw LaTeX. Editing a field regenerates that entry's LaTeX on save.

**Compose.** A resume is built by dragging bank entries into sections, in a three-pane editor: the searchable bank on one side, the resume outline in the middle, a live compiled preview on the other side. Entries can be reordered, moved between sections, or pulled in from any past import, not just the one that originally contributed them.

**Compile.** Every resume has one designated template shell, whose LaTeX preamble is the base. Compilation itself runs in a Vercel Sandbox booted from a pre-built TeX Live snapshot, running `pdflatex` twice to resolve cross-references before returning the compiled PDF.

**Export.** A finished one-page resume exports as either the compiled PDF or a full LaTeX ZIP, rebuilt from the original template's assets.

## Tech stack

- **Framework:** Next.js, React, TypeScript
- **Styling:** Tailwind CSS, shadcn/ui, dnd-kit (drag-and-drop)
- **Database & auth:** Supabase (Postgres, Google SSO, Storage)
- **AI extraction:** Google Gemini
- **Document processing:** [markitdown](https://github.com/microsoft/markitdown) (PDF to markdown Python function) and Vercel Sandbox + TeX Live (LaTeX compilation)

## Project structure

```
.
├── src/app/              # routes and API handlers
├── src/components/       # bank, outline, and preview panes; desktop UI
├── src/lib/
│   ├── adapters/         # the Jake's Resume template adapter (parse/extract/synthesize)
│   ├── resume-extraction.ts   # Gemini-based structured extraction
│   └── sandbox-compile.ts     # LaTeX compilation via Vercel Sandbox
├── api/                  # standalone Python function (PDF -> markdown)
└── supabase/migrations/  # schema
```

## Attribution

Modular's LaTeX adapter targets the [Jake's Resume](https://github.com/jakegut/resume) template family. Every resume, regardless of its original format, ultimately compiles through this template.
