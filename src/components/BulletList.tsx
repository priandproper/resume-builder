import { useEffect, useLayoutEffect, useRef, useState } from 'react'

let counter = 0
const uid = () => `b${++counter}`

type Row = { id: string; text: string }

/**
 * An editable bullet list that behaves like a document:
 *  - click a bullet and type
 *  - Enter starts a new bullet
 *  - Backspace on an empty bullet removes it (caret moves to the previous one)
 *  - empty bullets are dropped on blur so nothing empty prints
 *
 * Uses stable row ids (not array indices) as React keys, which keeps
 * contentEditable DOM nodes and the caret stable across insert/remove.
 */
export function BulletList({
  items,
  onChange,
  placeholder,
}: {
  items: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    items.filter((t) => t.trim() !== '').map((t) => ({ id: uid(), text: t })),
  )
  const [focusId, setFocusId] = useState<string | null>(null)

  // Resync from props only on genuine EXTERNAL changes (resume switch, import),
  // comparing by non-empty content so our own transient empty bullet (added on
  // Enter, before you've typed) never triggers a rebuild that would drop it.
  useLayoutEffect(() => {
    const rowsContent = rows.map((r) => r.text).filter((t) => t.trim() !== '')
    const itemsContent = items.filter((t) => t.trim() !== '')
    const same =
      rowsContent.length === itemsContent.length && rowsContent.every((t, i) => t === itemsContent[i])
    if (!same) setRows(itemsContent.map((t) => ({ id: uid(), text: t })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const propagate = (next: Row[]) => {
    setRows(next)
    onChange(next.map((r) => r.text))
  }

  const setText = (id: string, text: string) =>
    propagate(rows.map((r) => (r.id === id ? { ...r, text } : r)))

  const addAfter = (id: string, currentText: string) => {
    const idx = rows.findIndex((r) => r.id === id)
    const next = rows.slice()
    if (idx >= 0) next[idx] = { ...next[idx], text: currentText.trim() }
    const row = { id: uid(), text: '' }
    next.splice(idx + 1, 0, row)
    propagate(next)
    setFocusId(row.id)
  }

  const removeEmpty = (id: string) => {
    const idx = rows.findIndex((r) => r.id === id)
    if (idx < 0) return
    const prev = rows[idx - 1]
    propagate(rows.filter((r) => r.id !== id))
    if (prev) setFocusId(prev.id)
  }

  const commit = (id: string, text: string) => {
    // Drop this bullet if it was left empty; otherwise store it trimmed so it
    // matches what normalize-on-read produces (no resync while editing).
    if (text.trim() === '') {
      propagate(rows.filter((r) => r.id !== id))
    } else {
      setText(id, text.trim())
    }
  }

  const addFirst = () => {
    const row = { id: uid(), text: '' }
    propagate([...rows, row])
    setFocusId(row.id)
  }

  return (
    <>
      {rows.length > 0 && (
        <ul className="rt-bullets">
          {rows.map((r) => (
            <EditableBullet
              key={r.id}
              text={r.text}
              placeholder={placeholder}
              focus={focusId === r.id}
              onFocused={() => setFocusId(null)}
              onCommit={(t) => commit(r.id, t)}
              onEnter={(t) => addAfter(r.id, t)}
              onBackspaceEmpty={() => removeEmpty(r.id)}
            />
          ))}
        </ul>
      )}
      <button className="doc-add doc-ctrl" onMouseDown={(e) => e.preventDefault()} onClick={addFirst}>
        + bullet
      </button>
    </>
  )
}

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function EditableBullet({
  text,
  placeholder,
  focus,
  onFocused,
  onCommit,
  onEnter,
  onBackspaceEmpty,
}: {
  text: string
  placeholder?: string
  focus: boolean
  onFocused: () => void
  onCommit: (t: string) => void
  onEnter: (currentText: string) => void
  onBackspaceEmpty: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)

  // useLayoutEffect so bullet text is in the DOM before the parent measures for
  // one-page fit (child layout effects run before the parent's).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || document.activeElement === el) return
    if (el.innerText !== text) el.textContent = text
  }, [text])

  useEffect(() => {
    if (focus && ref.current) {
      ref.current.focus()
      placeCaretAtEnd(ref.current)
      onFocused()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  return (
    <li
      ref={ref}
      className={`editable ${text ? '' : 'is-empty'}`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      role="textbox"
      spellCheck
      onBlur={(e) => onCommit((e.currentTarget as HTMLElement).innerText)}
      onKeyDown={(e) => {
        const el = e.currentTarget as HTMLElement
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter(el.innerText)
        } else if (e.key === 'Backspace' && el.innerText === '') {
          e.preventDefault()
          onBackspaceEmpty()
        }
      }}
    />
  )
}
