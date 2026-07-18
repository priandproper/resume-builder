/**
 * First-run seeding. On an empty app we populate:
 *   - the content library (from profile.json), and
 *   - the user's prebuilt resume versions (the real tailored resumes).
 * so the user opens straight into their own content, ready to mix and match.
 */
import type { ResumeInput, EducationItem, SkillGroup, ContactInfo } from '../types/resume'
import { normalizeResume } from './normalize'
import { getAllResumes, upsertResume } from './storage'
import { ensureLibrarySeeded } from './library'
import profile from '../data/profile.json'

interface PrebuiltExperience {
  company: string
  title: string
  location?: string
  startDate?: string
  endDate?: string
  highlights: string[]
}
interface Prebuilt {
  label: string
  summary?: string
  headline?: string
  skills?: SkillGroup[]
  experience: PrebuiltExperience[]
}

/** Turn a prebuilt version into a full ResumeInput (adds canonical contact + education). */
function prebuiltToResume(p: Prebuilt): ResumeInput {
  const contact = { ...(profile.contact as ContactInfo) }
  if (p.headline) contact.headline = p.headline
  return {
    label: p.label,
    contact,
    summary: p.summary,
    experience: p.experience,
    education: profile.education as EducationItem[],
    projects: [],
    skills: p.skills ?? [],
  }
}

/** Seed resumes + library if the app is empty. Returns the id to select, if any. */
export function seedIfEmpty(): { selectId?: string } {
  ensureLibrarySeeded()

  if (getAllResumes().length > 0) return {}

  const prebuilt = profile.prebuilt as Prebuilt[]
  let firstId: string | undefined
  // Insert in reverse so the FIRST prebuilt ends up newest (top of the list).
  for (let i = prebuilt.length - 1; i >= 0; i--) {
    const stored = upsertResume(normalizeResume(prebuiltToResume(prebuilt[i])))
    if (i === 0) firstId = stored.id
  }
  return { selectId: firstId }
}
