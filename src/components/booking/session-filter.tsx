"use client"

import { useState } from "react"
import { Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SessionTemplate } from "@/types/session"
import { getEventColorValues } from "@/lib/event-colors"

interface SessionFilterProps {
  sessions: SessionTemplate[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export function SessionFilter({ sessions, selectedIds, onSelectionChange }: SessionFilterProps) {
  const [open, setOpen] = useState(false)

  const toggleSession = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(s => s !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  const clearAll = () => onSelectionChange([])

  const label = selectedIds.length === 0
    ? "All sessions"
    : `${selectedIds.length} session${selectedIds.length === 1 ? "" : "s"}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="space-y-1">
          <button
            type="button"
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
              selectedIds.length === 0 ? "font-medium" : "text-muted-foreground"
            }`}
            onClick={clearAll}
          >
            <span className="h-2.5 w-2.5 rounded-full border border-border shrink-0" />
            All sessions
          </button>
          <div className="my-1 border-t" />
          {sessions.map((session) => {
            const isSelected = selectedIds.includes(session.id)
            const color = getEventColorValues(session.event_color).color500
            return (
              <button
                key={session.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                  isSelected ? "font-medium" : "text-muted-foreground"
                }`}
                onClick={() => toggleSession(session.id)}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{session.name}</span>
                {isSelected && (
                  <span className="ml-auto h-3.5 w-3.5 shrink-0 text-foreground">✓</span>
                )}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
