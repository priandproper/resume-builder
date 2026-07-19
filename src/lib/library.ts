/**
 * THE CONTENT LIBRARY
 * ===================
 * A master pool of every piece of resume content the user has ever written —
 * each work experience carrying ALL of its bullet variants, every summary, and
 * every skill set. Building a tailored resume becomes mix-and-match: search the
 * library, insert the bullets you want, reorder, save the version.
 *
 * The library is seeded once from src/data/profile.json and then lives in
 * localStorage, so newly-written bullets (including ones an external app like
 * the referral tracker adds to a resume) can be saved back for reuse.
 */
import type { ContactInfo, EducationItem, SkillGroup } from '../types/resume'
import { newId } from './normalize'
import { secureGet, secureSet, subscribeSecure } from './securestore'
import profile from '../data/profile.json'

export interface LibraryBullet {
  id: string
  text: string
}

export interface LibraryExperience {
  id: string
  company: string
  location: string
  titles: string[]
  startDate: string
  endDate: string
  bullets: LibraryBullet[]
}

export interface SkillSet {
  name: string
  groups: SkillGroup[]
}

export interface Library {
  contact: ContactInfo
  education: EducationItem[]
  experiences: LibraryExperience[]
  summaries: string[]
  skillSets: SkillSet[]
}

const STORAGE_KEY = 'resume-builder:library:v1'

type Listener = () => void
const listeners = new Set<Listener>()
export function subscribeLibrary(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit() {
  listeners.forEach((fn) => fn())
}

// Refresh when the vault locks/unlocks.
subscribeSecure(emit)

interface SeedExperience {
  id: string
  company: string
  location: string
  titles: string[]
  startDate: string
  endDate: string
  bullets: string[]
}

/** Build the initial library from the bundled profile.json. */
export function buildSeedLibrary(): Library {
  return {
    contact: profile.contact as ContactInfo,
    education: profile.education as EducationItem[],
    experiences: (profile.experiences as SeedExperience[]).map((e) => ({
      id: e.id,
      company: e.company,
      location: e.location,
      titles: e.titles,
      startDate: e.startDate,
      endDate: e.endDate,
      bullets: e.bullets.map((text) => ({ id: newId(), text })),
    })),
    summaries: profile.summaries as string[],
    skillSets: profile.skillSets as SkillSet[],
  }
}

export function getLibrary(): Library {
  try {
    const raw = secureGet(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Library
  } catch {
    /* fall through to seed */
  }
  const seed = buildSeedLibrary()
  secureSet(STORAGE_KEY, JSON.stringify(seed))
  return seed
}

/** Seed the library on first run if it isn't there yet. Returns whether seeded. */
export function ensureLibrarySeeded(): boolean {
  if (secureGet(STORAGE_KEY)) return false
  secureSet(STORAGE_KEY, JSON.stringify(buildSeedLibrary()))
  emit()
  return true
}

function save(lib: Library) {
  secureSet(STORAGE_KEY, JSON.stringify(lib))
  emit()
}

/** Replace the whole library (used when restoring a full-state backup). */
export function replaceLibrary(lib: Library): void {
  save(lib)
}

/** Add a bullet to a library experience if it's not already present (dedupe by
 *  normalized text). Returns the (possibly existing) bullet. */
export function addBulletToLibrary(experienceId: string, text: string): void {
  const clean = text.trim()
  if (!clean) return
  const lib = getLibrary()
  const exp = lib.experiences.find((e) => e.id === experienceId)
  if (!exp) return
  const exists = exp.bullets.some((b) => b.text.trim().toLowerCase() === clean.toLowerCase())
  if (exists) return
  exp.bullets.push({ id: newId(), text: clean })
  save(lib)
}

export function removeBulletFromLibrary(experienceId: string, bulletId: string): void {
  const lib = getLibrary()
  const exp = lib.experiences.find((e) => e.id === experienceId)
  if (!exp) return
  exp.bullets = exp.bullets.filter((b) => b.id !== bulletId)
  save(lib)
}

export function addSummaryToLibrary(text: string): void {
  const clean = text.trim()
  if (!clean) return
  const lib = getLibrary()
  if (lib.summaries.some((s) => s.trim().toLowerCase() === clean.toLowerCase())) return
  lib.summaries.push(clean)
  save(lib)
}

/**
 * A normalized key for matching company names across resume versions, which
 * often differ in their parenthetical qualifiers — e.g. "Acme Corp
 * (Banking SaaS / Fintech)" vs "Acme Corp (Banking SaaS)" should match.
 * Strips parentheticals and punctuation down to the core name.
 */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function companyMatches(a: string, b: string): boolean {
  const ka = companyKey(a)
  const kb = companyKey(b)
  if (!ka || !kb) return false
  return ka === kb || ka.startsWith(kb) || kb.startsWith(ka)
}

/** Match a resume's company name to a library experience. */
export function findLibraryExperienceByCompany(company: string): LibraryExperience | undefined {
  const lib = getLibrary()
  return lib.experiences.find((e) => companyMatches(e.company, company))
}
