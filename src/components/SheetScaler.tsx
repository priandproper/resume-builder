import { useLayoutEffect, useRef, useState } from 'react'

const SHEET_W = 8.5 * 96 // 816px — the sheet's fixed width

/**
 * Scales the (fixed 8.5in-wide) resume sheet down to fit the available width,
 * so the whole one-page resume is visible on a phone. On a wide screen the
 * scale is 1 (no change). The fit-to-page logic measures layout height
 * (offsetHeight), which is transform-immune, so it stays correct while scaled.
 * Editing still works through the transform (tap a field, pinch to zoom in).
 */
export function SheetScaler({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [boxH, setBoxH] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const recompute = () => {
      const avail = outer.clientWidth
      const s = avail > 0 ? Math.min(1, avail / SHEET_W) : 1
      setScale(s)
      setBoxH(inner.offsetHeight * s)
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(outer) // width changes (viewport)
    ro.observe(inner) // height changes (edits / re-fit)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="sheet-scaler" ref={outerRef}>
      <div className="sheet-scaler-box" style={{ height: boxH }}>
        <div className="sheet-scaler-inner" ref={innerRef} style={{ transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  )
}
