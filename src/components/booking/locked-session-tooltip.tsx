"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Lock, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

interface LockedSessionDialogProps {
  open: boolean
  sessionName: string
  onOpenChange: (open: boolean) => void
}

export function LockedSessionDialog({
  open,
  sessionName,
  onOpenChange,
}: LockedSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100">
              <Lock className="h-6 w-6 text-amber-600" />
            </div>
          </div>
          <DialogTitle className="text-center">{sessionName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            This session is by invitation only. Please contact us for availability and booking details.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            asChild
          >
            <a href="mailto:hello@sawna.co?subject=Session Inquiry">
              <Mail className="mr-2 h-4 w-4" />
              Contact Us
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
