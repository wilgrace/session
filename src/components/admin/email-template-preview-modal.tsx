"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { OrgEmailTemplate } from "@/lib/db/schema"
import type { EmailTemplateType } from "@/lib/db/schema"
import { EMAIL_TEMPLATE_LABELS } from "@/lib/email-defaults"
import {
  buildBookingConfirmationPreview,
  buildMembershipConfirmationPreview,
  buildWaitingListPreview,
} from "@/lib/email-html"

interface EmailTemplatePreviewModalProps {
  open: boolean
  onClose: () => void
  template: OrgEmailTemplate | null
  orgName: string
  orgLogoUrl: string | null
  brandColor: string
  brandTextColor: string
}

export function EmailTemplatePreviewModal({
  open,
  onClose,
  template,
  orgName,
  orgLogoUrl,
  brandColor,
  brandTextColor,
}: EmailTemplatePreviewModalProps) {
  if (!template) return null

  const previewHtml = buildPreviewHtml({
    template,
    orgName,
    orgLogoUrl,
    brandColor,
    brandTextColor,
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle>
              {EMAIL_TEMPLATE_LABELS[template.type as EmailTemplateType] ?? template.type}
            </DialogTitle>
            <Badge variant="outline" className="font-normal text-xs">
              Sample data
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-normal">
            Subject: <span className="font-medium text-foreground">{template.subject}</span>
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          <iframe
            srcDoc={previewHtml}
            title="Email preview"
            className="w-full h-full border-0"
            style={{ minHeight: "500px" }}
            sandbox="allow-same-origin"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function buildPreviewHtml({
  template,
  orgName,
  orgLogoUrl,
  brandColor,
  brandTextColor,
}: {
  template: OrgEmailTemplate
  orgName: string
  orgLogoUrl: string | null
  brandColor: string
  brandTextColor: string
}): string {
  const shared = { orgName, orgLogoUrl, brandColor, brandTextColor }

  switch (template.type as EmailTemplateType) {
    case "booking_confirmation":
      return buildBookingConfirmationPreview({
        templateContent: template.content,
        templateSubject: template.subject,
        ...shared,
      })
    case "membership_confirmation":
      return buildMembershipConfirmationPreview({
        templateContent: template.content,
        ...shared,
      })
    case "waiting_list":
      return buildWaitingListPreview({
        templateContent: template.content,
        ...shared,
      })
    default:
      return `<p>No preview available for this template type.</p>`
  }
}
