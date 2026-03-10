"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2, Plus, Filter, GripVertical } from "lucide-react"
import type { PriceOption } from "@/lib/db/schema"
import { updatePriceOption, deletePriceOption, reorderPriceOptions } from "@/app/actions/price-options"
import { toast } from "sonner"
import { formatPrice } from "@/lib/pricing-utils"

interface PriceOptionsListProps {
  priceOptions: PriceOption[]
  onEdit: (option: PriceOption) => void
  onCreate: () => void
  onRefresh: () => void
}

export function PriceOptionsList({
  priceOptions,
  onEdit,
  onCreate,
  onRefresh,
}: PriceOptionsListProps) {
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [ordered, setOrdered] = useState<PriceOption[]>(priceOptions)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  useEffect(() => {
    setOrdered(priceOptions)
  }, [priceOptions])

  async function handleToggleActive(option: PriceOption) {
    setTogglingId(option.id)
    const result = await updatePriceOption({ id: option.id, isActive: !option.isActive })
    if (result.success) {
      toast.success(option.isActive ? "Price option deactivated" : "Price option activated")
      onRefresh()
    } else {
      toast.error(result.error || "Failed to update price option")
    }
    setTogglingId(null)
  }

  async function handleDelete(option: PriceOption) {
    if (!confirm(`Delete "${option.name}"? This cannot be undone.`)) return
    setDeletingId(option.id)
    const result = await deletePriceOption(option.id)
    if (result.success) {
      toast.success("Price option deleted")
      onRefresh()
    } else {
      toast.error(result.error || "Failed to delete price option")
    }
    setDeletingId(null)
  }

  // Drag-to-reorder handlers
  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = "move"
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (!draggedId || draggedId === overId) return
    const fromIndex = ordered.findIndex(o => o.id === draggedId)
    const toIndex = ordered.findIndex(o => o.id === overId)
    if (fromIndex === -1 || toIndex === -1) return
    const next = [...ordered]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setOrdered(next)
  }

  async function handleDrop() {
    setDraggedId(null)
    const ids = ordered.map(o => o.id)
    const result = await reorderPriceOptions(ids)
    if (!result.success) {
      toast.error(result.error || "Failed to reorder")
      onRefresh()
    }
  }

  function handleDragEnd() {
    setDraggedId(null)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-medium text-gray-900">Session Prices</p>
          <p className="text-sm text-gray-500 mt-1">
            Define ticket types that control how many spaces are booked and at what price.
          </p>
        </div>
        <Button onClick={onCreate} className="gap-2" variant="outline">
          <Plus className="h-4 w-4" />
          Create Price
        </Button>
      </div>

      {ordered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
          <p className="text-sm text-gray-500 mb-4">
            No prices yet. Create your first ticket type to start taking payments.
          </p>
          <Button onClick={onCreate} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Create Price
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Spaces</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Filter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((option) => (
                <TableRow
                  key={option.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, option.id)}
                  onDragOver={(e) => handleDragOver(e, option.id)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  className={draggedId === option.id ? "opacity-40" : ""}
                >
                  <TableCell>
                    <GripVertical className="h-4 w-4 text-gray-400 cursor-grab active:cursor-grabbing" />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{option.name}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-gray-500 truncate max-w-xs">
                      {option.description || "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{option.spaces}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{formatPrice(option.price)}</span>
                  </TableCell>
                  <TableCell>
                    {option.includeInFilter ? (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Filter className="h-3 w-3" />
                        In filter
                      </Badge>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={option.isActive}
                        onCheckedChange={() => handleToggleActive(option)}
                        disabled={togglingId === option.id}
                      />
                      <Badge
                        variant={option.isActive ? "default" : "secondary"}
                        className={
                          option.isActive
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : ""
                        }
                      >
                        {option.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(option)}
                        className="h-8 w-8"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(option)}
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        disabled={deletingId === option.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
