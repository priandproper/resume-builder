import {
  RESUME_SCHEMA_VERSION,
  type Resume,
  type ResumeInput,
  type ExperienceItem,
  type EducationItem,
  type ProjectItem,
  type SkillGroup,
} from '../types/resume'

/** Generate a stable-ish unique id without external deps. */
export function newId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  const time = Date.now().toString(36)
  return `res_${time}_${rand}`
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function optStr(v: unknown): string | undefined {
  const s = str(v).trim()
  return s ? s : undefined
}

/** Coerce anything into an array of trimmed non-empty strings. */
function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => str(x)).map((s) => s.trim()).filter(Boolean)
}

/**
 * Like strList but KEEPS empty strings. Used for bullet highlights: the inline
 * editor adds an empty bullet the instant you press Enter, and that bullet must
 * survive the storage round-trip (normalize-on-read) long enough for you to
 * type in it. Empty bullets are removed on blur by the editor, and hidden in
 * print, so nothing empty ever ships.
 */
function bulletList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => str(x).trim())
}

function normExperience(v: unknown): ExperienceItem[] {
  if (!Array.isArray(v)) return []
  return v.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>
    return {
      company: str(r.company),
      title: str(r.title),
      location: optStr(r.location),
      startDate: optStr(r.startDate),
      endDate: optStr(r.endDate),
      highlights: bulletList(r.highlights),
    }
  })
}

function normEducation(v: unknown): EducationItem[] {
  if (!Array.isArray(v)) return []
  return v.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>
    return {
      institution: str(r.institution),
      degree: str(r.degree),
      location: optStr(r.location),
      startDate: optStr(r.startDate),
      endDate: optStr(r.endDate),
      details: optStr(r.details),
    }
  })
}

function normProjects(v: unknown): ProjectItem[] {
  if (!Array.isArray(v)) return []
  return v.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>
    return {
      name: str(r.name),
      link: optStr(r.link),
      description: optStr(r.description),
      highlights: bulletList(r.highlights),
    }
  })
}

function normSkills(v: unknown): SkillGroup[] {
  if (!Array.isArray(v)) return []
  return v.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>
    return {
      name: str(r.name),
      items: strList(r.items),
    }
  })
}

/**
 * Turn untrusted input (from the referral tracker, a pasted blob, a URL param,
 * or an imported file) into a fully-formed Resume. Never throws on bad data —
 * missing/garbage fields become sensible empties. Throws only if the one hard
 * requirement (a name) is absent.
 */
export function normalizeResume(input: ResumeInput | Record<string, unknown>): Resume {
  const raw = (input ?? {}) as Record<string, unknown>
  const contactRaw = (raw.contact ?? {}) as Record<string, unknown>

  const fullName = str(contactRaw.fullName).trim()
  if (!fullName) {
    throw new Error('Resume is missing contact.fullName (a name is required).')
  }

  const now = new Date().toISOString()

  return {
    schemaVersion: RESUME_SCHEMA_VERSION,
    id: optStr(raw.id) ?? newId(),
    label: optStr(raw.label) ?? `${fullName} — resume`,
    contact: {
      fullName,
      headline: optStr(contactRaw.headline),
      email: optStr(contactRaw.email),
      phone: optStr(contactRaw.phone),
      location: optStr(contactRaw.location),
      website: optStr(contactRaw.website),
      linkedin: optStr(contactRaw.linkedin),
      github: optStr(contactRaw.github),
    },
    summary: optStr(raw.summary),
    experience: normExperience(raw.experience),
    education: normEducation(raw.education),
    projects: normProjects(raw.projects),
    skills: normSkills(raw.skills),
    createdAt: optStr(raw.createdAt) ?? now,
    updatedAt: now,
  }
}

/** An empty resume shell for the "New resume" button. */
export function blankResume(): Resume {
  return normalizeResume({ contact: { fullName: 'Your Name' } })
}
