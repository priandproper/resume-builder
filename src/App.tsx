import { useEffect, useMemo, useRef, useState } from 'react'
import type { Resume } from './types/resume'
import {
  getAllResumes,
  getResume,
  upsertResume,
  deleteResume,
  duplicateResume,
  subscribe,
} from './lib/storage'
import { blankResume } from './lib/normalize'
import { ingestResume, ingestFromUrl, listenForPostMessage } from './lib/ingest'
import { seedIfEmpty } from './lib/seed'
import { ResumeDocument } from './components/ResumeDocument'
import { LibraryDrawer } from './components/LibraryDrawer'

function useResumes(): Resume[] {
  const [resumes, setResumes] = useState<Resume[]>(() => getAllResumes())
  useEffect(() => subscribe(() => setResumes(getAllResumes())), [])
  return resumes
}

/** Download a string as a file. */
function downloadFile(name: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'resume'
}

export default function App() {
  const resumes = useResumes()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000)
  }

  // First-run seeding + URL ingress + initial selection. Guarded to run exactly
  // once even under StrictMode's double-invoke, because it consumes the URL
  // ?import= param (which only exists on the first pass). This is the sole owner
  // of the *initial* selection, so it must not race the reconcile effect below.
  const bootstrapped = useRef(false)
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    // Seed the content library + prebuilt resume versions on first run.
    const seeded = seedIfEmpty()

    // ?import=... from the referral tracker (or a shared link).
    const fromUrl = ingestFromUrl()
    if (fromUrl && 'error' in fromUrl) {
      showToast(`Import failed: ${fromUrl.error}`)
    } else if (fromUrl && 'id' in fromUrl) {
      showToast('Imported resume from link.')
    }

    // Pick the initial selection: imported resume, else first seeded, else newest.
    const importedId = fromUrl && 'id' in fromUrl ? fromUrl.id : undefined
    const list = getAllResumes()
    setSelectedId(importedId ?? seeded.selectId ?? list[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live postMessage ingress (its own effect so cleanup runs correctly).
  useEffect(
    () =>
      listenForPostMessage((id) => {
        setSelectedId(id)
        showToast('Resume received from another app.')
      }),
    [],
  )

  // Reconcile ONLY when the current selection points at a resume that no longer
  // exists (e.g. after a delete). Never overrides a valid selection, so it can't
  // fight the bootstrap effect.
  useEffect(() => {
    if (selectedId && !resumes.some((r) => r.id === selectedId)) {
      setSelectedId(resumes[0]?.id ?? null)
    }
  }, [resumes, selectedId])

  const selected = useMemo(
    () => (selectedId ? getResume(selectedId) : undefined),
    [selectedId, resumes],
  )

  const handleEditorChange = (next: Resume) => {
    upsertResume(next)
  }

  const handleNew = () => {
    const created = upsertResume(blankResume())
    setSelectedId(created.id)
  }

  const handleDuplicate = () => {
    if (!selected) return
    const copy = duplicateResume(selected.id)
    if (copy) setSelectedId(copy.id)
  }

  const handleDelete = () => {
    if (!selected) return
    if (!window.confirm(`Delete "${selected.label}"? This cannot be undone.`)) return
    deleteResume(selected.id)
  }

  const handleExportJson = () => {
    if (!selected) return
    downloadFile(`${slugify(selected.label)}.json`, JSON.stringify(selected, null, 2), 'application/json')
  }

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const stored = ingestResume(data)
      setSelectedId(stored.id)
      showToast('Imported resume from file.')
    } catch (err) {
      showToast(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handlePrint = () => {
    // Measure the real printable content and shrink-to-fit a single page by
    // setting --print-scale (consumed by print.css via `zoom`). We measure with
    // the `measuring` class on, which hides the same things print hides (edit
    // controls, empty sections) so the height reflects the actual PDF.
    const sheet = document.getElementById('resume-print-root')
    const root = document.documentElement
    let scale = 1
    if (sheet) {
      const header = sheet.querySelector('.rt-header')
      document.body.classList.add('measuring')
      const sections = Array.from(sheet.querySelectorAll('.rt-section')).filter(
        (s) => (s as HTMLElement).offsetHeight > 0,
      )
      if (header && sections.length) {
        const top = header.getBoundingClientRect().top
        const bottom = sections[sections.length - 1].getBoundingClientRect().bottom
        const contentPx = bottom - top
        // Letter minus 0.4in margins = 10.2in of printable height; 2% safety.
        const pageAvailPx = (11 - 0.8) * 96 * 0.98
        scale = Math.max(0.5, Math.min(1, pageAvailPx / contentPx))
      }
      document.body.classList.remove('measuring')
    }
    root.style.setProperty('--print-scale', String(scale))
    window.print()
    // Reset so the on-screen view is never left scaled.
    window.setTimeout(() => root.style.setProperty('--print-scale', '1'), 400)
  }

  return (
    <div className="app">
      <aside className="sidebar no-print">
        <div className="sidebar-head">
          <span className="brand">Resume Builder</span>
          <button className="add-btn" onClick={handleNew}>+ New</button>
        </div>
        <ul className="resume-list">
          {resumes.map((r) => (
            <li
              key={r.id}
              className={`resume-list-item ${r.id === selectedId ? 'active' : ''}`}
              onClick={() => setSelectedId(r.id)}
            >
              <span className="rli-label">{r.label}</span>
              <span className="rli-name">{r.contact.fullName}</span>
            </li>
          ))}
          {resumes.length === 0 && <li className="resume-list-empty">No resumes yet.</li>}
        </ul>
        <div className="sidebar-foot">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImportFile(f)
              e.target.value = ''
            }}
          />
          <button className="ghost-btn" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
        </div>
      </aside>

      <main className="workspace">
        <div className="toolbar no-print">
          {selected ? (
            <>
              <span className="toolbar-title">{selected.label}</span>
              <div className="toolbar-actions">
                <button className="ghost-btn accent" onClick={() => setLibraryOpen(true)}>
                  ☰ Library
                </button>
                <button className="ghost-btn" onClick={handleDuplicate}>Duplicate</button>
                <button className="ghost-btn" onClick={handleExportJson}>Export JSON</button>
                <button className="ghost-btn danger" onClick={handleDelete}>Delete</button>
                <button className="primary-btn" onClick={handlePrint}>Download PDF</button>
              </div>
            </>
          ) : (
            <span className="toolbar-title">Create or import a resume to begin.</span>
          )}
        </div>

        <div className="doc-canvas">
          {selected ? (
            <ResumeDocument resume={selected} onChange={handleEditorChange} />
          ) : (
            <div className="empty-state no-print">Create or import a resume to begin.</div>
          )}
        </div>
      </main>

      <LibraryDrawer
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        resume={selected}
        onChange={handleEditorChange}
        onToast={showToast}
      />

      {toast && <div className="toast no-print">{toast}</div>}
    </div>
  )
}
