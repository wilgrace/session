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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Waiver, AgreementType } from "@/lib/db/schema"
import { createWaiver, updateWaiver } from "@/app/actions/waivers"

interface WaiverFormProps {
  open: boolean
  onClose: () => void
  waiver: Waiver | null
  onSuccess: () => void
}

export function WaiverForm({
  open,
  onClose,
  waiver,
  onSuccess,
}: WaiverFormProps) {
  const [loading, setLoading] = useState(false)

  // Form state
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [content, setContent] = useState("")
  const [agreementType, setAgreementType] = useState<AgreementType>("checkbox")
  const [isActive, setIsActive] = useState(false)

  // Inline validation
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const clearError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next })
    }
  }

  // Reset form when waiver changes
  useEffect(() => {
    if (waiver) {
      setTitle(waiver.title)
      setSummary(waiver.summary || "")
      setContent(waiver.content)
      setAgreementType(waiver.agreementType as AgreementType)
      setIsActive(waiver.isActive)
      setFieldErrors({})
    } else {
      setTitle("")
      setSummary("")
      setContent("")
      setAgreementType("checkbox")
      setIsActive(false)
      setFieldErrors({})
    }
  }, [waiver, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!title.trim()) errors.title = "Title is required"
    if (!content.trim()) errors.content = "Content is required"

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstKey = Object.keys(errors)[0]
      document.getElementById(firstKey)?.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    setFieldErrors({})

    setLoading(true)

    const params = {
      title: title.trim(),
      summary: summary.trim() || undefined,
      content: content.trim(),
      agreementType,
      isActive,
    }

    let result
    if (waiver) {
      result = await updateWaiver({ id: waiver.id, ...params })
    } else {
      result = await createWaiver(params)
    }

    if (result.success) {
      toast.success(waiver ? "Waiver updated" : "Waiver created")
      onSuccess()
      onClose()
    } else {
      toast.error(result.error || "Failed to save waiver")
    }

    setLoading(false)
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{waiver ? "Edit Waiver" : "Create Waiver"}</SheetTitle>
          <SheetDescription>
            {waiver
              ? "Update the waiver details below."
              : "Create a new waiver for users to agree to."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); clearError("title") }}
              placeholder="e.g., Terms & Conditions"
              disabled={loading}
              className={cn(fieldErrors.title && "border-red-500 focus-visible:ring-red-500")}
            />
            {fieldErrors.title && <p className="text-sm text-red-500">{fieldErrors.title}</p>}
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief description shown above the full content..."
              disabled={loading}
              rows={2}
            />
            <p className="text-xs text-gray-500">
              A short summary displayed before the full terms.
            </p>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => { setContent(e.target.value); clearError("content") }}
              placeholder="Enter the full terms and conditions..."
              disabled={loading}
              rows={10}
              className={cn("font-mono text-sm", fieldErrors.content && "border-red-500 focus-visible:ring-red-500")}
            />
            {fieldErrors.content ? (
              <p className="text-sm text-red-500">{fieldErrors.content}</p>
            ) : (
              <p className="text-xs text-gray-500">
                The full waiver text that users will need to read and agree to.
              </p>
            )}
          </div>

          {/* Agreement Type */}
          <div className="space-y-4 border-t pt-4">
            <Label className="text-base font-medium">Agreement Method</Label>
            <RadioGroup
              value={agreementType}
              onValueChange={(v) => setAgreementType(v as AgreementType)}
              className="space-y-3"
              disabled={loading}
            >
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="checkbox" id="a-checkbox" className="mt-1" />
                <div>
                  <Label htmlFor="a-checkbox" className="font-normal cursor-pointer">
                    Checkbox
                  </Label>
                  <p className="text-sm text-gray-500">
                    User ticks a checkbox to agree
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="signature" id="a-signature" className="mt-1" />
                <div>
                  <Label htmlFor="a-signature" className="font-normal cursor-pointer">
                    Signature
                  </Label>
                  <p className="text-sm text-gray-500">
                    User draws their signature to agree
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Status */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isActive" className="text-base font-medium">
                  Active
                </Label>
                <p className="text-sm text-gray-500 mt-0.5">
                  Only one waiver can be active at a time
                </p>
              </div>
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={loading}
              />
            </div>

            {isActive && !waiver?.isActive && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Activating this waiver will deactivate any other active waiver.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {waiver ? "Save Changes" : "Create Waiver"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
