/**
 * ADAPTIVE ONE-PAGE FIT
 * =====================
 * Every resume must export as one solid page. The whole template derives its
 * sizing from a single base font on the sheet (`--rt-font`), so scaling that one
 * value scales the entire resume — fonts and spacing together. This routine
 * picks the base font that makes the content fill one printable page, shrinks
 * the contact font (`--rt-contact-font`) so the contact stays on ONE line, then
 * distributes any leftover space (`--rt-fill`) so the page reads as full.
 *
 * Crucial detail: we measure with the sheet temporarily in its PRINT geometry
 * (content width 7.7in, no padding, no min-height) and with the print-hidden
 * bits (edit controls, "+ add", empty sections) hidden via inline styles — so
 * the measured height is exactly what prints. Everything is restored before the
 * browser paints (this runs in a layout effect), so nothing flashes on screen.
 */

const MIN_FONT = 7
const MAX_FONT = 11.5
const PAGE_IN = 11
const MARGIN_IN = 0.4
const CONTENT_W_IN = 8.5 - 2 * MARGIN_IN // 7.7in — the printed content width

const HIDE_SELECTOR =
  '.doc-add, .doc-add-entry, .doc-ctrl, .doc-entry-ctrls, .rt-section.is-empty, .rt-bullets li.is-empty'

/** Fit one resume sheet to a single page. Idempotent; safe to call repeatedly. */
export function fitResume(sheet: HTMLElement): void {
  // pixels-per-inch in the current rendering (from the 0.4in padding), read
  // BEFORE we override the padding.
  const padTop = parseFloat(getComputedStyle(sheet).paddingTop) || 0
  const pxPerIn = padTop > 0 ? padTop / MARGIN_IN : 96
  // Font is fit to a slightly conservative height; fill can reach nearer the edge.
  const fontTargetPx = (PAGE_IN - 2 * MARGIN_IN - 0.15) * pxPerIn
  const fillTargetPx = (PAGE_IN - 2 * MARGIN_IN - 0.05) * pxPerIn

  // Put the sheet into print geometry + hide print-hidden bits, so getBounding-
  // ClientRect().height equals the true printed content height.
  const saved = {
    width: sheet.style.width,
    padding: sheet.style.padding,
    minHeight: sheet.style.minHeight,
  }
  const hidden = Array.from(sheet.querySelectorAll(HIDE_SELECTOR)) as HTMLElement[]
  const prevDisplay = hidden.map((el) => el.style.display)

  sheet.style.setProperty('--rt-fill', '0px')
  sheet.style.setProperty('--rt-contact-font', '')
  sheet.style.width = `${CONTENT_W_IN}in`
  sheet.style.padding = '0'
  sheet.style.minHeight = '0'
  hidden.forEach((el) => {
    el.style.display = 'none'
  })

  // offsetHeight is the LAYOUT height — unaffected by any CSS transform on an
  // ancestor (e.g. the mobile fit-to-width scaler), so the fit stays correct
  // when the sheet is displayed scaled down.
  const printHeight = () => sheet.offsetHeight

  try {
    // 1) Vertical fit — binary-search the largest base font that fits one page.
    let lo = MIN_FONT
    let hi = MAX_FONT
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2
      sheet.style.setProperty('--rt-font', `${mid}pt`)
      const h = printHeight()
      if (h > 0 && h <= fontTargetPx) lo = mid
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

    // 3) Vertical justification — spread leftover space across section/entry gaps
    //    so the page fills instead of leaving a gap at the bottom.
    const leftover = fillTargetPx - printHeight()
    let gaps = 0
    sheet.querySelectorAll('.rt-section, .rt-entry').forEach((el) => {
      if ((el as HTMLElement).offsetHeight > 0) gaps++
    })
    if (leftover > 6 && gaps > 0) {
      const per = Math.min(leftover / gaps, 0.4 * pxPerIn)
      sheet.style.setProperty('--rt-fill', `${per.toFixed(2)}px`)
    }
  } finally {
    sheet.style.width = saved.width
    sheet.style.padding = saved.padding
    sheet.style.minHeight = saved.minHeight
    hidden.forEach((el, i) => {
      el.style.display = prevDisplay[i]
    })
  }
}
