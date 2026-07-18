import { useEffect, useRef } from 'react'

type Tag = 'span' | 'div' | 'p' | 'h1'

/**
 * An inline, click-to-edit text field rendered directly on the document.
 * Uncontrolled by design: React never rewrites the DOM while the element is
 * focused, so the caret never jumps. We read the text on blur and push it up.
 */
export function EditableText({
  value,
  onChange,
  placeholder,
  className = '',
  as = 'span',
  multiline = false,
  ariaLabel,
  href,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  as?: Tag
  multiline?: boolean
  ariaLabel?: string
  /** When set, render as a clickable <a> (still inline-editable). The href
   *  survives into the printed PDF as a real link; clicks are suppressed while
   *  editing so they place the caret instead of navigating away. */
  href?: string
}) {
  const ref = useRef<HTMLElement | null>(null)

  // Sync DOM text from `value` only when the element is NOT being edited.
  useEffect(() => {
    const el = ref.current
    if (!el || document.activeElement === el) return
    const current = multiline ? el.innerText : el.textContent ?? ''
    if (current !== value) el.textContent = value
  }, [value, multiline])

  const commit = () => {
    const el = ref.current
    if (!el) return
    const raw = (multiline ? el.innerText : el.textContent ?? '').replace(/ /g, ' ')
    const cleaned = multiline ? raw.replace(/\n{3,}/g, '\n\n').replace(/\s+$/,'') : raw.trim()
    if (cleaned !== value) onChange(cleaned)
  }

  const isLink = !!href
  // Rendered tag varies (a/h1/div/p/span); a loose type here is fine at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag: any = isLink ? 'a' : as

  return (
    <Tag
      ref={ref}
      className={`editable ${isLink ? 'editable-link' : ''} ${multiline ? 'editable-multiline' : ''} ${value ? '' : 'is-empty'} ${className}`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      role="textbox"
      aria-label={ariaLabel ?? placeholder}
      spellCheck
      {...(isLink ? { href, onClick: (e: React.MouseEvent) => e.preventDefault() } : {})}
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        // Single-line fields: Enter confirms and blurs instead of inserting a newline.
        if (!multiline && e.key === 'Enter') {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).blur()
        }
      }}
    />
  )
}
