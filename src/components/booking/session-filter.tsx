"use client"

import { useState } from "react"
import { Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SessionTemplate } from "@/types/session"
import { getEventColorValues } from "@/lib/event-colors"
import type { PriceOption, Membership } from "@/lib/db/schema"

interface SessionFilterProps {
  sessions: SessionTemplate[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  filterablePriceOptions?: PriceOption[]
  selectedPriceOptionIds?: string[]
  onPriceOptionSelectionChange?: (ids: string[]) => void
  filterableMemberships?: Membership[]
  selectedMembershipIds?: string[]
  onMembershipSelectionChange?: (ids: string[]) => void
}

export function SessionFilter({
  sessions,
  selectedIds,
  onSelectionChange,
  filterablePriceOptions = [],
  selectedPriceOptionIds = [],
  onPriceOptionSelectionChange,
  filterableMemberships = [],
  selectedMembershipIds = [],
  onMembershipSelectionChange,
}: SessionFilterProps) {
  const [open, setOpen] = useState(false)

  const toggleSession = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(s => s !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  const togglePriceOption = (id: string) => {
    if (!onPriceOptionSelectionChange) return
    if (selectedPriceOptionIds.includes(id)) {
      onPriceOptionSelectionChange(selectedPriceOptionIds.filter(p => p !== id))
    } else {
      onPriceOptionSelectionChange([...selectedPriceOptionIds, id])
    }
  }

  const toggleMembership = (id: string) => {
    if (!onMembershipSelectionChange) return
    if (selectedMembershipIds.includes(id)) {
      onMembershipSelectionChange(selectedMembershipIds.filter(m => m !== id))
    } else {
      onMembershipSelectionChange([...selectedMembershipIds, id])
    }
  }

  const clearAll = () => {
    onSelectionChange([])
    onPriceOptionSelectionChange?.([])
    onMembershipSelectionChange?.([])
  }

  const totalSelected = selectedIds.length + selectedPriceOptionIds.length + selectedMembershipIds.length
  const label = totalSelected === 0
    ? "All sessions"
    : `${totalSelected} filter${totalSelected === 1 ? "" : "s"}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
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
          {filterablePriceOptions.length > 0 && (
            <>
              {filterablePriceOptions.map((option) => {
                const isSelected = selectedPriceOptionIds.includes(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                      isSelected ? "font-medium" : "text-muted-foreground"
                    }`}
                    onClick={() => togglePriceOption(option.id)}
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary/30 border border-primary/50" />
                    <span className="truncate">{option.name}</span>
                    {isSelected && <span className="ml-auto h-3.5 w-3.5 shrink-0 text-foreground">✓</span>}
                  </button>
                )
              })}
              <div className="my-1 border-t" />
            </>
          )}
          {filterableMemberships.length > 0 && (
            <>
              {filterableMemberships.map((membership) => {
                const isSelected = selectedMembershipIds.includes(membership.id)
                return (
                  <button
                    key={membership.id}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                      isSelected ? "font-medium" : "text-muted-foreground"
                    }`}
                    onClick={() => toggleMembership(membership.id)}
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary/30 border border-primary/50" />
                    <span className="truncate">{membership.name}</span>
                    {isSelected && <span className="ml-auto h-3.5 w-3.5 shrink-0 text-foreground">✓</span>}
                  </button>
                )
              })}
              <div className="my-1 border-t" />
            </>
          )}
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
