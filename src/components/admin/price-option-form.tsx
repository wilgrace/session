"use client"

import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { PriceOption } from "@/lib/db/schema"
import { createPriceOption, updatePriceOption } from "@/app/actions/price-options"

interface PriceOptionFormProps {
  open: boolean
  onClose: () => void
  priceOption: PriceOption | null
  onSuccess: () => void
}

export function PriceOptionForm({
  open,
  onClose,
  priceOption,
  onSuccess,
}: PriceOptionFormProps) {
  const [loading, setLoading] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [spaces, setSpaces] = useState("1")
  const [includeInFilter, setIncludeInFilter] = useState(false)
  const [isActive, setIsActive] = useState(true)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function clearError(field: string) {
    if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: "" }))
  }

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (priceOption) {
        setName(priceOption.name)
        setDescription(priceOption.description || "")
        setPrice(String(priceOption.price / 100))
        setSpaces(String(priceOption.spaces))
        setIncludeInFilter(priceOption.includeInFilter)
        setIsActive(priceOption.isActive)
      } else {
        setName("")
        setDescription("")
        setPrice("")
        setSpaces("1")
        setIncludeInFilter(false)
        setIsActive(true)
      }
      setFieldErrors({})
    }
  }, [open, priceOption])

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = "Name is required"
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum < 0) errors.price = "Enter a valid price (0 for free)"
    const spacesNum = parseInt(spaces)
    if (isNaN(spacesNum) || spacesNum < 1) errors.spaces = "Spaces must be at least 1"
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setLoading(true)

    const priceInPence = Math.round(parseFloat(price) * 100)
    const spacesNum = parseInt(spaces)

    const params = {
      name: name.trim(),
      description: description.trim() || undefined,
      price: priceInPence,
      spaces: spacesNum,
      includeInFilter,
      isActive,
    }

    const result = priceOption
      ? await updatePriceOption({ id: priceOption.id, ...params })
      : await createPriceOption(params)

    if (result.success) {
      toast.success(priceOption ? "Price option updated" : "Price option created")
      onSuccess()
      onClose()
    } else {
      toast.error(result.error || "Failed to save price option")
    }
    setLoading(false)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-[625px] overflow-y-auto">
        <SheetHeader className="mb-6 pb-6 border-b">
          <SheetTitle className="text-xl">{priceOption ? "Edit price" : "Create price"}</SheetTitle>
          <SheetDescription>
            Define a price type and number of spaces it takes up.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="po-name">Name</Label>
            <Input
              id="po-name"
              value={name}
              onChange={(e) => { setName(e.target.value); clearError("name") }}
              placeholder="e.g. Standard, Private Hire, Bring a Friend"
            />
            {fieldErrors.name && <p className="text-xs text-red-500">{fieldErrors.name}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="po-description">Description <span className="text-gray-400">(optional)</span></Label>
            <Textarea
              id="po-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Price per space, Exclusive use of the space"
              rows={2}
            />
          </div>


          {/* Price */}
          <div className="space-y-4 border-t pt-4">
            <Label htmlFor="po-price">Price (£)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
              <Input
                id="po-price"
                value={price}
                onChange={(e) => { setPrice(e.target.value); clearError("price") }}
                placeholder="0.00"
                className="pl-7"
                inputMode="decimal"
              />
            </div>
            {fieldErrors.price && <p className="text-xs text-red-500">{fieldErrors.price}</p>}
            <p className="text-xs text-gray-500">Set 0 for a free price.</p>
          </div>

          {/* Spaces */}
          <div className="space-y-1.5">
            <Label htmlFor="po-spaces">Spaces used</Label>
            <Input
              id="po-spaces"
              type="number"
              min={1}
              step={1}
              value={spaces}
              onChange={(e) => { setSpaces(e.target.value); clearError("spaces") }}
              placeholder="1"
            />
            {fieldErrors.spaces && <p className="text-xs text-red-500">{fieldErrors.spaces}</p>}
            <p className="text-xs text-gray-500">
              How many capacity slots this price users. Use 1 for standard, or match your total capacity for Private Hire.
            </p>
          </div>

          <div className="space-y-4 border-t pt-4">
              <Label className="text-base font-medium">Visibility</Label>
            </div>

            {/* Active */}
            <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Active</Label>
              <p className="text-xs text-gray-500">
                Inactive prices are hidden from all sessions and the booking form.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Include in filter */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Include in calendar filter</Label>
              <p className="text-xs text-gray-500">
                Let users filter the calendar by sessions that have this price available.
              </p>
            </div>
            <Switch checked={includeInFilter} onCheckedChange={setIncludeInFilter} />
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-6 border-t">
          <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {priceOption ? "Save Changes" : "Create Price"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
