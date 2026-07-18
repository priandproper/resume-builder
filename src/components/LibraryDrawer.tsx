import { useEffect, useMemo, useState } from 'react'
import type { Resume, SkillGroup } from '../types/resume'
import {
  getLibrary,
  subscribeLibrary,
  addBulletToLibrary,
  addSummaryToLibrary,
  companyMatches,
  type LibraryExperience,
} from '../lib/library'

/**
 * The content-library drawer. Slides in from the right. Search across every
 * bullet / summary you've ever written and click to insert it into the current
 * resume (into the matching experience, creating that experience if needed).
 * Also pushes new content from the current resume back into the library.
 */

function norm(s: string) {
  return s.trim().toLowerCase()
}

export function LibraryDrawer({
  open,
  onClose,
  resume,
  onChange,
  onToast,
}: {
  open: boolean
  onClose: () => void
  resume: Resume | undefined
  onChange: (next: Resume) => void
  onToast: (msg: string) => void
}) {
  const [, force] = useState(0)
  useEffect(() => subscribeLibrary(() => force((n) => n + 1)), [])
  const [query, setQuery] = useState('')

  const library = useMemo(() => getLibrary(), [open, query])

  // Text of every bullet already in the current resume (for "already added" ticks).
  const currentBulletSet = useMemo(() => {
    const set = new Set<string>()
    resume?.experience.forEach((e) => e.highlights.forEach((h) => set.add(norm(h))))
    return set
  }, [resume])

  const q = norm(query)
  const matches = (text: string) => !q || norm(text).includes(q)

  if (!open) return null

  const findResumeExpIndex = (company: string): number => {
    if (!resume) return -1
    return resume.experience.findIndex((e) => companyMatches(e.company, company))
  }

  const insertBullet = (exp: LibraryExperience, text: string) => {
    if (!resume) return
    if (currentBulletSet.has(norm(text))) {
      onToast('Already in this resume')
      return
    }
    const idx = findResumeExpIndex(exp.company)
    if (idx === -1) {
      onChange({
        ...resume,
        experience: [
          ...resume.experience,
          {
            company: exp.company,
            title: exp.titles[0] ?? '',
            location: exp.location,
            startDate: exp.startDate,
            endDate: exp.endDate,
            highlights: [text],
          },
        ],
      })
      onToast(`Added role “${exp.company}” with bullet`)
    } else {
      onChange({
        ...resume,
        experience: resume.experience.map((e, i) =>
          i === idx ? { ...e, highlights: [...e.highlights, text] } : e,
        ),
      })
      onToast('Bullet inserted')
    }
  }

  const addRole = (exp: LibraryExperience) => {
    if (!resume) return
    if (findResumeExpIndex(exp.company) !== -1) return
    onChange({
      ...resume,
      experience: [
        ...resume.experience,
        {
          company: exp.company,
          title: exp.titles[0] ?? '',
          location: exp.location,
          startDate: exp.startDate,
          endDate: exp.endDate,
          highlights: [],
        },
      ],
    })
    onToast(`Added role “${exp.company}”`)
  }

  const useSummary = (text: string) => {
    if (!resume) return
    onChange({ ...resume, summary: text })
    onToast('Summary applied')
  }

  const applySkillSet = (groups: SkillGroup[]) => {
    if (!resume) return
    onChange({ ...resume, skills: groups.map((g) => ({ name: g.name, items: [...g.items] })) })
    onToast('Skill set applied')
  }

  const saveCurrentToLibrary = () => {
    if (!resume) return
    let added = 0
    resume.experience.forEach((e) => {
      const libExp = library.experiences.find((le) => companyMatches(le.company, e.company))
      if (!libExp) return
      const existing = new Set(libExp.bullets.map((x) => norm(x.text)))
      e.highlights.forEach((h) => {
        if (h.trim() && !existing.has(norm(h))) {
          addBulletToLibrary(libExp.id, h)
          existing.add(norm(h))
          added++
        }
      })
    })
    if (resume.summary) addSummaryToLibrary(resume.summary)
    onToast(added > 0 ? `Saved ${added} new bullet${added === 1 ? '' : 's'} to library` : 'Library already up to date')
  }

  return (
    <>
      <div className="drawer-scrim no-print" onClick={onClose} />
      <aside className="library-drawer no-print" role="dialog" aria-label="Content library">
        <div className="drawer-head">
          <div>
            <div className="drawer-title">Content Library</div>
            <div className="drawer-sub">Click any item to add it to this resume</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="drawer-search">
          <input
            className="fld-input"
            placeholder="Search bullets & summaries…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="drawer-body">
          {/* Summaries */}
          {library.summaries.some(matches) && (
            <section className="lib-section">
              <h4 className="lib-heading">Summaries</h4>
              {library.summaries.filter(matches).map((s, i) => (
                <div className="lib-item" key={i}>
                  <p className="lib-text">{s}</p>
                  <button className="lib-insert" onClick={() => useSummary(s)}>Use</button>
                </div>
              ))}
            </section>
          )}

          {/* Experiences with bullet pools */}
          {library.experiences.map((exp) => {
            const shownBullets = exp.bullets.filter((b) => matches(b.text))
            const titleMatches = matches(exp.company)
            if (shownBullets.length === 0 && !titleMatches) return null
            const inResume = findResumeExpIndex(exp.company) !== -1
            return (
              <section className="lib-section" key={exp.id}>
                <div className="lib-exp-head">
                  <div>
                    <span className="lib-company">{exp.company}</span>
                    <span className="lib-dates">{exp.startDate} – {exp.endDate}</span>
                  </div>
                  {!inResume && (
                    <button className="lib-role-btn" onClick={() => addRole(exp)}>+ role</button>
                  )}
                </div>
                {(q ? shownBullets : exp.bullets).map((b) => {
                  const added = currentBulletSet.has(norm(b.text))
                  return (
                    <div className={`lib-item ${added ? 'added' : ''}`} key={b.id}>
                      <p className="lib-text">{b.text}</p>
                      <button
                        className="lib-insert"
                        onClick={() => insertBullet(exp, b.text)}
                        title={added ? 'Already in this resume' : 'Insert into resume'}
                      >
                        {added ? '✓' : '+'}
                      </button>
                    </div>
                  )
                })}
              </section>
            )
          })}

          {/* Skill sets */}
          {!q && library.skillSets.length > 0 && (
            <section className="lib-section">
              <h4 className="lib-heading">Skill sets</h4>
              {library.skillSets.map((set, i) => (
                <div className="lib-item" key={i}>
                  <div className="lib-text">
                    <strong>{set.name}</strong>
                    <div className="lib-skill-preview">
                      {set.groups.map((g) => g.items.join(', ')).join(' · ')}
                    </div>
                  </div>
                  <button className="lib-insert" onClick={() => applySkillSet(set.groups)}>Use</button>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="drawer-foot">
          <button className="ghost-btn" onClick={saveCurrentToLibrary}>
            Save this resume’s new bullets to library
          </button>
        </div>
      </aside>
    </>
  )
}
