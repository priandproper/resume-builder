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
import { fitResume } from './lib/fit'
import { buildBackup, isBackup, restoreBackup } from './lib/backup'
import { ResumeDocument } from './components/ResumeDocument'
import { LibraryDrawer } from './components/LibraryDrawer'
import { SheetScaler } from './components/SheetScaler'
import { Logo } from './components/Logo'

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

/**
 * Filename convention for exports (PDF + JSON): "<Full Name> - <Label>".
 * e.g. "Jane Doe - Amazon Business PMM". Keeps the person's name first
 * (what recruiters expect) — never the app name. Strips characters that are
 * illegal in filenames.
 */
function fileBaseName(resume: Resume): string {
  const name = (resume.contact.fullName || 'Resume').trim()
  const label = (resume.label || '').trim()
  const raw = label ? `${name} - ${label}` : `${name} - Resume`
  return raw
    .replace(/[\\/:*?"<>|]/g, '') // characters not allowed in filenames
    .replace(/\s+/g, ' ')
    .trim()
}

export default function App() {
  const resumes = useResumes()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false) // off-canvas resume list on mobile
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
    downloadFile(`${fileBaseName(selected)}.json`, JSON.stringify(selected, null, 2), 'application/json')
  }

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (isBackup(data)) {
        // A whole-state backup (e.g. from iCloud) — restore everything.
        const { count, selectId } = restoreBackup(data)
        if (selectId) setSelectedId(selectId)
        showToast(`Restored ${count} resume${count === 1 ? '' : 's'} from backup.`)
      } else {
        const stored = ingestResume(data)
        setSelectedId(stored.id)
        showToast('Imported resume from file.')
      }
    } catch (err) {
      showToast(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleBackup = () => {
    const backup = buildBackup(new Date().toISOString())
    downloadFile('Resume Builder - Backup.json', JSON.stringify(backup, null, 2), 'application/json')
    showToast(`Backed up ${backup.resumes.length} resume${backup.resumes.length === 1 ? '' : 's'} + library.`)
  }

  const handlePrint = () => {
    // Re-fit to one page (the adaptive base font is set on the sheet and is
    // inherited into print), then hand off to the browser's PDF export.
    const sheet = document.getElementById('resume-print-root')
    if (sheet) fitResume(sheet)

    // The browser's "Save as PDF" defaults the filename to document.title, so
    // set it to our convention (e.g. "Jane Doe - Amazon Business PMM")
    // just for the print, then restore it.
    const prevTitle = document.title
    if (selected) document.title = fileBaseName(selected)
    const restore = () => {
      document.title = prevTitle
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
    window.setTimeout(restore, 1500) // fallback if afterprint doesn't fire
  }

  return (
    <div className="app">
      {sidebarOpen && (
        <div className="drawer-scrim mobile-only no-print" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`sidebar no-print ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <span className="brand">
            <Logo size={20} />
            Resume Builder
          </span>
          <button className="add-btn" onClick={handleNew}>+ New</button>
        </div>
        <ul className="resume-list">
          {resumes.map((r) => (
            <li
              key={r.id}
              className={`resume-list-item ${r.id === selectedId ? 'active' : ''}`}
              onClick={() => {
                setSelectedId(r.id)
                setSidebarOpen(false)
              }}
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
          <div className="sidebar-foot-row">
            <button className="ghost-btn" onClick={() => fileInputRef.current?.click()}>
              Import
            </button>
            <button className="ghost-btn" onClick={handleBackup}>
              Backup all
            </button>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <div className="toolbar no-print">
          <button
            className="hamburger mobile-only"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open resume list"
          >
            ☰
          </button>
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
            <SheetScaler key={selected.id}>
              <ResumeDocument resume={selected} onChange={handleEditorChange} />
            </SheetScaler>
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
