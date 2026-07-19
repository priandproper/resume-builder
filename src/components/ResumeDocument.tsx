import { useLayoutEffect, useRef } from 'react'
import type {
  Resume,
  ContactInfo,
  ExperienceItem,
  EducationItem,
  ProjectItem,
  SkillGroup,
} from '../types/resume'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'
import { BulletList } from './BulletList'
import { fitResume } from '../lib/fit'

/**
 * THE EDITABLE DOCUMENT.
 * Renders the one locked template (same structure and CSS as the print output)
 * but every piece of text is edited in place — click and type, like a document.
 * Structure changes (add/remove/reorder entries) use small controls that appear
 * on hover and are hidden in the printed PDF. Empty sections are marked
 * `is-empty` so they show while editing but disappear when printed.
 */

const CONTACT_FIELDS: { key: keyof Resume['contact']; placeholder: string }[] = [
  { key: 'location', placeholder: 'Location' },
  { key: 'email', placeholder: 'Email' },
  { key: 'phone', placeholder: 'Phone' },
  { key: 'website', placeholder: 'Website' },
  { key: 'linkedin', placeholder: 'LinkedIn' },
  { key: 'github', placeholder: 'GitHub' },
]

/** Contact fields rendered as short labelled links (display a label, link to the URL). */
const LINK_LABELS: Partial<Record<keyof Resume['contact'], string>> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  github: 'GitHub',
}

/** Build a clickable href for the email field (others handled by EditableLink). */
function contactHref(key: keyof Resume['contact'], value: string): string | undefined {
  if (!value) return undefined
  if (key === 'email') return `mailto:${value}`
  return undefined
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function Icon({ path }: { path: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {path}
    </svg>
  )
}

function EntryControls({
  onRemove,
  onUp,
  onDown,
}: {
  onRemove: () => void
  onUp?: () => void
  onDown?: () => void
}) {
  // onMouseDown preventDefault keeps focus/caret from leaving an active field.
  const stop = (e: React.MouseEvent) => e.preventDefault()
  return (
    <div className="doc-entry-ctrls doc-ctrl" contentEditable={false}>
      <button className="doc-icon" title="Move up" onMouseDown={stop} onClick={onUp} disabled={!onUp}>
        <Icon path={<><path d="M8 12.5V3.5" /><path d="M4 7l4-4 4 4" /></>} />
      </button>
      <button className="doc-icon" title="Move down" onMouseDown={stop} onClick={onDown} disabled={!onDown}>
        <Icon path={<><path d="M8 3.5v9" /><path d="M4 9l4 4 4-4" /></>} />
      </button>
      <button className="doc-icon danger" title="Remove" onMouseDown={stop} onClick={onRemove}>
        <Icon path={<><path d="M3 4.5h10" /><path d="M6.5 4.5v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1" /><path d="M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" /></>} />
      </button>
    </div>
  )
}

/** A single editable date field showing "start – end" (or just one date, or
 *  nothing). One field keeps the model's start/end but avoids stray dashes and
 *  empty "Start"/"End" placeholders — type a range with a dash and it splits
 *  back into startDate/endDate; type one value and it's the (end) date. */
function EditableDateRange({
  start,
  end,
  onChange,
}: {
  start: string
  end: string
  onChange: (start: string, end: string) => void
}) {
  const combined = [start, end].filter(Boolean).join(' – ')
  const handle = (value: string) => {
    const t = value.trim()
    if (!t) return onChange('', '')
    const parts = t.split(/\s*[–—-]\s*/)
    if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
      onChange(parts[0].trim(), parts.slice(1).join(' – ').trim())
    } else {
      onChange('', t) // a lone value is treated as the end/graduation date
    }
  }
  return <EditableText className="rt-dates" value={combined} placeholder="Dates" onChange={handle} />
}

export function ResumeDocument({
  resume,
  onChange,
  identity,
  onIdentityChange,
}: {
  resume: Resume
  onChange: (next: Resume) => void
  identity: ContactInfo
  onIdentityChange: (patch: Partial<ContactInfo>) => void
}) {
  const sheetRef = useRef<HTMLElement>(null)
  // Re-fit to one page whenever the resume OR the shared contact changes.
  useLayoutEffect(() => {
    if (sheetRef.current) fitResume(sheetRef.current)
  }, [resume, identity])

  const set = (patch: Partial<Resume>) => onChange({ ...resume, ...patch })
  // Contact is the GLOBAL identity (same on every resume), not per-resume data.
  const setContact = onIdentityChange

  const updateExp = (i: number, patch: Partial<ExperienceItem>) =>
    set({ experience: resume.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const updateEdu = (i: number, patch: Partial<EducationItem>) =>
    set({ education: resume.education.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const updateProj = (i: number, patch: Partial<ProjectItem>) =>
    set({ projects: resume.projects.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const updateSkill = (i: number, patch: Partial<SkillGroup>) =>
    set({ skills: resume.skills.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const hasSummary = !!resume.summary
  const noExperience = resume.experience.length === 0
  const noEducation = resume.education.length === 0
  const noProjects = resume.projects.length === 0
  const noSkills = resume.skills.length === 0

  return (
    <article className="resume-sheet" id="resume-print-root" ref={sheetRef}>
      {/* ---------- Header ---------- */}
      <header className="rt-header">
        <EditableText
          as="h1"
          className="rt-name"
          value={identity.fullName}
          placeholder="Your Name"
          onChange={(v) => setContact({ fullName: v })}
          ariaLabel="Full name"
        />
        <div className="rt-contact">
          {CONTACT_FIELDS.map((f) => {
            const value = identity[f.key] ?? ''
            const linkLabel = LINK_LABELS[f.key]
            return (
              <span className={`rt-contact-item ${value ? '' : 'is-empty'}`} key={f.key}>
                {linkLabel ? (
                  <EditableLink
                    url={value}
                    label={linkLabel}
                    placeholder={f.placeholder}
                    onChange={(v) => setContact({ [f.key]: v })}
                  />
                ) : (
                  <EditableText
                    value={value}
                    placeholder={f.placeholder}
                    href={contactHref(f.key, value)}
                    onChange={(v) => setContact({ [f.key]: v })}
                  />
                )}
              </span>
            )
          })}
        </div>
      </header>

      {/* ---------- Summary ---------- */}
      <section className={`rt-section ${hasSummary ? '' : 'is-empty'}`}>
        <h2 className="rt-section-title">Summary</h2>
        <EditableText
          as="p"
          className="rt-summary"
          multiline
          value={resume.summary ?? ''}
          placeholder="Write a short professional summary…"
          onChange={(v) => set({ summary: v })}
        />
      </section>

      {/* ---------- Experience ---------- */}
      <section className={`rt-section ${noExperience ? 'is-empty' : ''}`}>
        <h2 className="rt-section-title">Experience</h2>
        {resume.experience.map((exp, i) => (
          <div className="rt-entry doc-entry" key={i}>
            <EntryControls
              onRemove={() => set({ experience: resume.experience.filter((_, j) => j !== i) })}
              onUp={i > 0 ? () => set({ experience: move(resume.experience, i, i - 1) }) : undefined}
              onDown={
                i < resume.experience.length - 1
                  ? () => set({ experience: move(resume.experience, i, i + 1) })
                  : undefined
              }
            />
            <div className="rt-entry-head">
              <div className="rt-entry-left">
                <EditableText className="rt-entry-title" value={exp.title} placeholder="Job title" onChange={(v) => updateExp(i, { title: v })} />
                <EditableText className="rt-entry-org" value={exp.company} placeholder="Company" onChange={(v) => updateExp(i, { company: v })} />
              </div>
              <div className="rt-entry-right">
                <EditableDateRange
                  start={exp.startDate ?? ''}
                  end={exp.endDate ?? ''}
                  onChange={(s, e) => updateExp(i, { startDate: s, endDate: e })}
                />
                <EditableText className="rt-location" value={exp.location ?? ''} placeholder="Location" onChange={(v) => updateExp(i, { location: v })} />
              </div>
            </div>
            <BulletList
              items={exp.highlights}
              placeholder="Describe an accomplishment…"
              onChange={(items) => updateExp(i, { highlights: items })}
            />
          </div>
        ))}
        <button
          className="doc-add-entry doc-ctrl"
          onClick={() =>
            set({ experience: [...resume.experience, { company: '', title: '', highlights: [] }] })
          }
        >
          + Add experience
        </button>
      </section>

      {/* ---------- Education ---------- */}
      <section className={`rt-section ${noEducation ? 'is-empty' : ''}`}>
        <h2 className="rt-section-title">Education</h2>
        {resume.education.map((ed, i) => (
          <div className="rt-entry doc-entry" key={i}>
            <EntryControls
              onRemove={() => set({ education: resume.education.filter((_, j) => j !== i) })}
              onUp={i > 0 ? () => set({ education: move(resume.education, i, i - 1) }) : undefined}
              onDown={
                i < resume.education.length - 1
                  ? () => set({ education: move(resume.education, i, i + 1) })
                  : undefined
              }
            />
            <div className="rt-entry-head">
              <div className="rt-entry-left">
                <EditableText className="rt-entry-title" value={ed.institution} placeholder="Institution" onChange={(v) => updateEdu(i, { institution: v })} />
                <EditableText className="rt-entry-org" value={ed.degree} placeholder="Degree" onChange={(v) => updateEdu(i, { degree: v })} />
              </div>
              <div className="rt-entry-right">
                <EditableDateRange
                  start={ed.startDate ?? ''}
                  end={ed.endDate ?? ''}
                  onChange={(s, e) => updateEdu(i, { startDate: s, endDate: e })}
                />
                <EditableText className="rt-location" value={ed.location ?? ''} placeholder="Location" onChange={(v) => updateEdu(i, { location: v })} />
              </div>
            </div>
            <EditableText className="rt-detail-line" value={ed.details ?? ''} placeholder="Details (e.g. GPA 3.8 · Dean's List)" onChange={(v) => updateEdu(i, { details: v })} />
          </div>
        ))}
        <button
          className="doc-add-entry doc-ctrl"
          onClick={() => set({ education: [...resume.education, { institution: '', degree: '' }] })}
        >
          + Add education
        </button>
      </section>

      {/* ---------- Projects ---------- */}
      <section className={`rt-section ${noProjects ? 'is-empty' : ''}`}>
        <h2 className="rt-section-title">Projects</h2>
        {resume.projects.map((pr, i) => (
          <div className="rt-entry doc-entry" key={i}>
            <EntryControls
              onRemove={() => set({ projects: resume.projects.filter((_, j) => j !== i) })}
              onUp={i > 0 ? () => set({ projects: move(resume.projects, i, i - 1) }) : undefined}
              onDown={
                i < resume.projects.length - 1
                  ? () => set({ projects: move(resume.projects, i, i + 1) })
                  : undefined
              }
            />
            <div className="rt-entry-head">
              <div className="rt-entry-left">
                <EditableText className="rt-entry-title" value={pr.name} placeholder="Project name" onChange={(v) => updateProj(i, { name: v })} />
                <EditableText className="rt-entry-link" value={pr.link ?? ''} placeholder="Link" onChange={(v) => updateProj(i, { link: v })} />
              </div>
            </div>
            <EditableText className="rt-detail-line" value={pr.description ?? ''} placeholder="Description" onChange={(v) => updateProj(i, { description: v })} />
            <BulletList
              items={pr.highlights}
              placeholder="Describe a highlight…"
              onChange={(items) => updateProj(i, { highlights: items })}
            />
          </div>
        ))}
        <button
          className="doc-add-entry doc-ctrl"
          onClick={() => set({ projects: [...resume.projects, { name: '', highlights: [] }] })}
        >
          + Add project
        </button>
      </section>

      {/* ---------- Skills ---------- */}
      <section className={`rt-section ${noSkills ? 'is-empty' : ''}`}>
        <h2 className="rt-section-title">Skills</h2>
        <div className="rt-skills">
          {resume.skills.map((group, i) => (
            <div className="rt-skill-row doc-entry" key={i}>
              <EntryControls
                onRemove={() => set({ skills: resume.skills.filter((_, j) => j !== i) })}
                onUp={i > 0 ? () => set({ skills: move(resume.skills, i, i - 1) }) : undefined}
                onDown={
                  i < resume.skills.length - 1
                    ? () => set({ skills: move(resume.skills, i, i + 1) })
                    : undefined
                }
              />
              <EditableText className="rt-skill-name" value={group.name} placeholder="Category" onChange={(v) => updateSkill(i, { name: v })} />
              <EditableText
                className="rt-skill-items"
                value={group.items.join(', ')}
                placeholder="Comma, separated, skills"
                onChange={(v) =>
                  updateSkill(i, { items: v.split(',').map((s) => s.trim()).filter(Boolean) })
                }
              />
            </div>
          ))}
        </div>
        <button
          className="doc-add-entry doc-ctrl"
          onClick={() => set({ skills: [...resume.skills, { name: '', items: [] }] })}
        >
          + Add skill group
        </button>
      </section>
    </article>
  )
}
