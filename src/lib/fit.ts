/**
 * ADAPTIVE ONE-PAGE FIT
 * =====================
 * Every resume must export as one solid page. The whole template derives its
 * sizing from a single base font on the sheet (`--rt-font`), so scaling that one
 * value scales the entire resume — fonts and spacing together. This routine
 * picks the base font that makes the content fill exactly one printable page
 * (growing to fill whitespace, shrinking to avoid a second page), then shrinks
 * the contact line's font (`--rt-contact-font`) just enough to keep it on ONE
 * line.
 *
 * To measure the *printed* height we must exclude what print hides (edit
 * controls, "+ add" affordances, empty sections). We hide those with direct
 * inline styles rather than a CSS class, because a class toggled during React's
 * layout phase isn't reliably applied before getBoundingClientRect().
 */

// Base font search bounds (pt). Floor keeps it readable; ceiling avoids a tiny
// resume ballooning to a comic size.
const MIN_FONT = 7
const MAX_FONT = 11.5
// Printable page geometry (US Letter with 0.4in margins).
const PAGE_IN = 11
const MARGIN_IN = 0.4

const HIDE_SELECTOR =
  '.doc-add, .doc-add-entry, .doc-ctrl, .doc-entry-ctrls, .rt-section.is-empty, .rt-bullets li.is-empty'

function contentHeightPx(sheet: HTMLElement): number {
  const header = sheet.querySelector('.rt-header') as HTMLElement | null
  const sections = Array.from(sheet.querySelectorAll('.rt-section')).filter(
    (s) => (s as HTMLElement).offsetHeight > 0,
  ) as HTMLElement[]
  if (!header || sections.length === 0) return 0
  const top = header.getBoundingClientRect().top
  const bottom = sections[sections.length - 1].getBoundingClientRect().bottom
  return bottom - top
}

/** Fit one resume sheet to a single page. Idempotent; safe to call repeatedly. */
export function fitResume(sheet: HTMLElement): void {
  // Pixels-per-inch in the current rendering (DPR-independent): the sheet's top
  // padding is exactly MARGIN_IN inches.
  const padTop = parseFloat(getComputedStyle(sheet).paddingTop) || 0
  const pxPerIn = padTop > 0 ? padTop / MARGIN_IN : 96
  const targetPx = (PAGE_IN - 2 * MARGIN_IN) * pxPerIn

  // Hide print-hidden bits via inline styles so the measurement matches the PDF.
  const hidden = Array.from(sheet.querySelectorAll(HIDE_SELECTOR)) as HTMLElement[]
  const prevDisplay = hidden.map((el) => el.style.display)
  hidden.forEach((el) => {
    el.style.display = 'none'
  })

  try {
    // 1) Vertical fit — BINARY SEARCH for the largest base font whose content
    //    still fits one page. Monotonic and deterministic (the fixed-point
    //    iteration oscillated around line-wrap boundaries and never settled).
    sheet.style.setProperty('--rt-contact-font', '') // let contact ride the base while we measure
    let lo = MIN_FONT
    let hi = MAX_FONT
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2
      sheet.style.setProperty('--rt-font', `${mid}pt`)
      const h = contentHeightPx(sheet)
      if (h > 0 && h <= targetPx) lo = mid
      else hi = mid
    }
    const font = lo
    sheet.style.setProperty('--rt-font', `${font.toFixed(2)}pt`)

    // 2) Contact one-line fit — start at 0.9× base, shrink until it stops wrapping.
    const contact = sheet.querySelector('.rt-contact') as HTMLElement | null
    if (contact) {
      let cf = font * 0.9
      sheet.style.setProperty('--rt-contact-font', `${cf.toFixed(2)}pt`)
      let guard = 0
      while (contact.scrollWidth > contact.clientWidth + 0.5 && cf > 4.5 && guard < 60) {
        cf -= 0.2
        sheet.style.setProperty('--rt-contact-font', `${cf.toFixed(2)}pt`)
        guard++
      }
    }
  } finally {
    hidden.forEach((el, i) => {
      el.style.display = prevDisplay[i]
    })
  }
}
