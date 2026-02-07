"use client"

import { useState } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { createWaiverAgreement } from "@/app/actions/waivers"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, FileText } from "lucide-react"
import { SignatureCanvas } from "./signature-canvas"
import type { Waiver } from "@/lib/db/schema"

interface WaiverAgreementOverlayProps {
  isOpen: boolean
  waiver: Waiver
  onComplete: () => void
}

export function WaiverAgreementOverlay({
  isOpen,
  waiver,
  onComplete,
}: WaiverAgreementOverlayProps) {
  const isMobile = useIsMobile()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isCheckbox = waiver.agreementType === "checkbox"
  const canSubmit = isCheckbox ? agreed : !!signatureData

  const handleSubmit = async () => {
    if (!canSubmit) return

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await createWaiverAgreement({
        waiverId: waiver.id,
        agreementType: waiver.agreementType as "checkbox" | "signature",
        signatureData: signatureData || undefined,
      })

      if (result.success) {
        onComplete()
      } else {
        setError(result.error || "Failed to record agreement")
      }
    } catch {
      setError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{waiver.title}</h2>
          {waiver.summary && (
            <p className="text-sm text-muted-foreground">{waiver.summary}</p>
          )}
        </div>
      </div>

      {/* Content (scrollable) */}
      <ScrollArea className="h-[200px] sm:h-[300px] rounded-lg border p-4">
        <div className="whitespace-pre-wrap text-sm text-gray-700">
          {waiver.content}
        </div>
      </ScrollArea>

      {/* Agreement Input */}
      <div className="space-y-4">
        {isCheckbox ? (
          <div className="flex items-start space-x-3">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              disabled={isSubmitting}
            />
            <Label
              htmlFor="agree"
              className="text-sm leading-relaxed cursor-pointer"
            >
              I have read and agree to the terms and conditions above
            </Label>
          </div>
        ) : (
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Please sign below to agree
            </Label>
            <SignatureCanvas
              onChange={setSignatureData}
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Submit button */}
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit || isSubmitting}
        className="w-full h-12 rounded-xl"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          "I Agree"
        )}
      </Button>
    </div>
  )

  // Mobile: Bottom sheet
  if (isMobile) {
    return (
      <Sheet open={isOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-2xl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{waiver.title}</SheetTitle>
            <SheetDescription>Agreement required to continue</SheetDescription>
          </SheetHeader>
          <div className="pt-2">{content}</div>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: Centered dialog
  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-lg" hideCloseButton>
        <DialogHeader className="sr-only">
          <DialogTitle>{waiver.title}</DialogTitle>
          <DialogDescription>Agreement required to continue</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}
