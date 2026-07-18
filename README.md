# Resume Builder

A UI-driven resume builder with **one locked, approved template**. The template's
structure never changes — only the content does. You edit resumes in the browser
and export them as PDFs, and **other apps can create or update resumes
programmatically** (this is designed to be driven by a separate "referral
tracker" app that generates tailored resumes per job application).

- **Fully client-side.** No backend, no login. Resumes are stored in your
  browser's `localStorage`.
- **One template.** Professional, ATS-friendly, single-column. Sections render
  in a fixed order; empty sections are omitted.
- **PDF export.** Native browser print-to-PDF — vector text, selectable,
  ATS-readable, pixel-identical to the on-screen preview.
- **Programmatic ingress.** A documented JSON contract plus three ways to push a
  resume in from another app.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Build a static bundle with `npm run build` (outputs to `dist/`), preview it with
`npm run preview`.

## Using the app

- **Edit the resume directly.** Click any text on the page and type — it's a
  live document, not a form. Press **Enter** in a bullet to start a new one;
  **Backspace** on an empty bullet removes it. Hover an entry to reveal
  move/remove controls, and use the subtle **+ Add** links to add entries,
  bullets, or skill groups. Empty fields show a faint placeholder and never
  print.
- **Content library (mix & match).** Click **☰ Library** in the toolbar to open
  a master pool of every experience/bullet/summary/skill set you've written
  (seeded from your resumes). Search by keyword and click **+** to insert a
  bullet into the current resume — it drops into the matching experience
  (creating it if absent). Already-used bullets show a green ✓. **Use** applies
  a summary or skill set. **Save this resume's new bullets to library** captures
  anything new (e.g. bullets an external app added) for reuse. The library lives
  in `src/data/profile.json` (seed) then in `localStorage`.
- **Prebuilt versions.** Your tailored resumes are seeded as ready-to-use
  versions in the sidebar on first run.
- **New / Duplicate / Delete** resumes from the sidebar and toolbar.
- Everything auto-saves to `localStorage` as you type.
- **Download PDF** opens the print dialog — choose "Save as PDF". Page size is
  US Letter; editing controls and placeholders are stripped from the output.
- **Export JSON** / **Import JSON** move a resume in or out as a file.

---

## The resume JSON contract

This is the single source of truth shared by the UI and any external app. The
full TypeScript definition lives in [`src/types/resume.ts`](src/types/resume.ts);
a realistic example is in [`src/lib/sample.ts`](src/lib/sample.ts).

An external app only needs to produce **`ResumeInput`** — everything the app can
default is optional. The one hard requirement is `contact.fullName`.

```jsonc
{
  "label": "Backend roles — Acme",          // optional; shown in the list, not printed
  "contact": {
    "fullName": "Alex Chen",                 // REQUIRED
    "headline": "Backend Engineer",          // optional
    "email": "alex@example.com",
    "phone": "(555) 123-4567",
    "location": "Boston, MA",
    "linkedin": "linkedin.com/in/alexchen",
    "github": "github.com/alexchen",
    "website": "alexchen.dev"
  },
  "summary": "Two or three sentences positioning you for the role.",
  "experience": [
    {
      "company": "Acme",
      "title": "Senior Engineer",
      "location": "Remote",
      "startDate": "Jan 2023",
      "endDate": "Present",
      "highlights": ["Did X, improving Y by Z%", "Led ..."]
    }
  ],
  "education": [
    {
      "institution": "Boston University",
      "degree": "B.S. Computer Science",
      "location": "Boston, MA",
      "startDate": "2015",
      "endDate": "2019",
      "details": "GPA 3.8 · Dean's List"
    }
  ],
  "projects": [
    { "name": "openresume-cli", "link": "github.com/...", "description": "...", "highlights": ["..."] }
  ],
  "skills": [
    { "name": "Languages", "items": ["TypeScript", "Go", "Python"] }
  ]
}
```

Notes:
- Missing or malformed fields are coerced to safe empties — the app never throws
  on bad input except when `contact.fullName` is absent.
- If you provide an `id` that already exists, that resume is **updated**;
  otherwise a new one is **created**. Omit `id` to always create.
- `schemaVersion`, `createdAt`, `updatedAt` are managed by the app.

---

## Programmatic ingress (for the referral tracker)

Three channels, all validated through the same path. Pick whichever fits how the
tracker runs.

### 1. URL import — open a link

Best when the tracker can open a browser tab/link. Put the resume JSON in an
`?import=` param (URL-encoded JSON, or base64-encoded JSON). The app imports it,
selects it, and strips the param so a refresh won't re-import.

```js
const resume = { contact: { fullName: "Alex Chen" }, /* ... */ }
const url = `http://localhost:5173/?import=${encodeURIComponent(JSON.stringify(resume))}`
// open `url` in a browser
```

### 2. `postMessage` — inject at runtime

Best when the tracker embeds the builder in an iframe or opens it with
`window.open` and holds a reference. Post a message; you get an ack back.

```js
const child = window.open("http://localhost:5173/")
// ...once it has loaded...
child.postMessage(
  { type: "resume-builder:ingest", resume: { contact: { fullName: "Alex Chen" } }, requestId: "req-1" },
  "*"
)

window.addEventListener("message", (e) => {
  if (e.data?.type === "resume-builder:ingest-ack") {
    // { ok: true, id, requestId } on success, or { ok: false, error, requestId }
    console.log("ingest result:", e.data)
  }
})
```

### 3. File / paste — manual

Use **Import JSON** in the sidebar to load a `.json` file matching the contract.

---

## Architecture

| File | Responsibility |
| --- | --- |
| [`src/types/resume.ts`](src/types/resume.ts) | The resume contract (types) |
| [`src/lib/normalize.ts`](src/lib/normalize.ts) | Coerce any input into a valid `Resume` |
| [`src/lib/storage.ts`](src/lib/storage.ts) | `localStorage` CRUD + change subscriptions |
| [`src/lib/ingest.ts`](src/lib/ingest.ts) | URL + `postMessage` ingress |
| [`src/components/ResumeDocument.tsx`](src/components/ResumeDocument.tsx) | **The locked template**, edited in place |
| [`src/components/EditableText.tsx`](src/components/EditableText.tsx) | Click-to-edit inline text field |
| [`src/components/BulletList.tsx`](src/components/BulletList.tsx) | Document-style editable bullets |
| [`src/styles/print.css`](src/styles/print.css) | Strips editing UI; scopes print to the resume |

### Future: swapping to a real backend

If the referral tracker becomes server-side and needs a true HTTP API, only
[`src/lib/storage.ts`](src/lib/storage.ts) changes (localStorage → `fetch`). The
JSON contract stays identical, so the template, editor, and ingress code don't
move.
