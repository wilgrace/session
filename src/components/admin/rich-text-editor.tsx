"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import { useEffect, useRef, useState } from "react"
import { Bold, Italic, Link2, List, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  minRows?: number
}

export function RichTextEditor({ value, onChange, disabled, placeholder, className, minRows = 3 }: RichTextEditorProps) {
  const [linkInputVisible, setLinkInputVisible] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const linkInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Disable everything except bold, italic, bulletList, listItem, paragraph, text, hardBreak
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        orderedList: false,
        strike: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
          class: "underline text-primary",
        },
      }),
    ],
    content: value || "",
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // Return empty string instead of empty paragraph
      onChange(html === "<p></p>" ? "" : html)
    },
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[var(--min-height)] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          "prose prose-sm max-w-none focus:outline-none",
          className
        ),
      },
    },
  })

  // Sync external value changes (e.g. when form resets)
  const prevValueRef = useRef(value)
  useEffect(() => {
    if (!editor) return
    if (value !== prevValueRef.current) {
      prevValueRef.current = value
      // Only update if editor content differs to avoid cursor jump
      const currentHtml = editor.getHTML()
      const normalised = value === "" ? "<p></p>" : value
      if (currentHtml !== normalised) {
        editor.commands.setContent(value || "", false)
      }
    }
  }, [value, editor])

  const applyLink = () => {
    if (!editor) return
    const url = linkUrl.trim()
    if (url) {
      const href = url.startsWith("http") ? url : `https://${url}`
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
    }
    setLinkInputVisible(false)
    setLinkUrl("")
  }

  const cancelLink = () => {
    setLinkInputVisible(false)
    setLinkUrl("")
    editor?.chain().focus().run()
  }

  const openLinkInput = () => {
    if (!editor) return
    const existingHref = editor.getAttributes("link").href as string | undefined
    setLinkUrl(existingHref || "")
    setLinkInputVisible(true)
    // Focus the input after render
    setTimeout(() => linkInputRef.current?.focus(), 0)
  }

  return (
    <div
      className="relative"
      style={{ "--min-height": `${(minRows ?? 3) * 1.5 + 1}rem` } as React.CSSProperties}
    >
      {editor && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-md border bg-white shadow-md p-1"
        >
          {linkInputVisible ? (
            <div className="flex items-center gap-1 px-1">
              <input
                ref={linkInputRef}
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); applyLink() }
                  if (e.key === "Escape") cancelLink()
                }}
                placeholder="https://..."
                className="h-6 w-44 rounded border border-input px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button type="button" onClick={applyLink} className="rounded p-0.5 hover:bg-gray-100" aria-label="Apply link">
                <Check className="h-3.5 w-3.5 text-green-600" />
              </button>
              <button type="button" onClick={cancelLink} className="rounded p-0.5 hover:bg-gray-100" aria-label="Cancel">
                <X className="h-3.5 w-3.5 text-gray-500" />
              </button>
            </div>
          ) : (
            <>
              <BubbleButton
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
                aria-label="Bold"
              >
                <Bold className="h-3.5 w-3.5" />
              </BubbleButton>
              <BubbleButton
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                aria-label="Italic"
              >
                <Italic className="h-3.5 w-3.5" />
              </BubbleButton>
              <BubbleButton
                active={editor.isActive("link")}
                onClick={openLinkInput}
                aria-label="Link"
              >
                <Link2 className="h-3.5 w-3.5" />
              </BubbleButton>
              <BubbleButton
                active={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                aria-label="Bullet list"
              >
                <List className="h-3.5 w-3.5" />
              </BubbleButton>
            </>
          )}
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      {!editor?.getText() && placeholder && (
        <p className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">{placeholder}</p>
      )}
    </div>
  )
}

function BubbleButton({ children, active, onClick, "aria-label": ariaLabel }: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  "aria-label": string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "rounded p-1.5 transition-colors hover:bg-gray-100",
        active && "bg-gray-200 text-primary"
      )}
    >
      {children}
    </button>
  )
}
