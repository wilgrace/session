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
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { OrgEmailTemplate } from "@/lib/db/schema"
import { updateEmailTemplate } from "@/app/actions/email-templates"
import { EMAIL_TEMPLATE_LABELS, EMAIL_TEMPLATE_DEFAULTS } from "@/lib/email-defaults"
import type { EmailTemplateType } from "@/lib/db/schema"

interface EmailTemplateFormProps {
  open: boolean
  onClose: () => void
  template: OrgEmailTemplate | null
  onSuccess: () => void
}

export function EmailTemplateForm({
  open,
  onClose,
  template,
  onSuccess,
}: EmailTemplateFormProps) {
  const [loading, setLoading] = useState(false)

  const [subject, setSubject] = useState("")
  const [content, setContent] = useState("")
  const [replyTo, setReplyTo] = useState("")
  const [isActive, setIsActive] = useState(true)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const clearError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next })
    }
  }

  useEffect(() => {
    if (template) {
      setSubject(template.subject)
      setContent(template.content)
      setReplyTo(template.replyTo || "")
      setIsActive(template.isActive)
      setFieldErrors({})
    }
  }, [template, open])

  const templateDefaults = template
    ? EMAIL_TEMPLATE_DEFAULTS[template.type as EmailTemplateType]
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!template) return

    const errors: Record<string, string> = {}
    if (!subject.trim()) errors.subject = "Subject is required"
    if (!content.trim()) errors.content = "Content is required"

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setLoading(true)

    const result = await updateEmailTemplate({
      id: template.id,
      subject: subject.trim(),
      content: content.trim(),
      replyTo: replyTo.trim() || null,
      isActive,
    })

    if (result.success) {
      toast.success("Email template saved")
      onSuccess()
    } else {
      toast.error(result.error || "Failed to save template")
    }

    setLoading(false)
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {template ? EMAIL_TEMPLATE_LABELS[template.type as EmailTemplateType] ?? template?.type : "Edit Email"}
          </SheetTitle>
          <SheetDescription>
            Customise the email sent to users. Use <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{"{{variable}}"}</code> placeholders for dynamic content.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject *</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); clearError("subject") }}
              placeholder="Your booking is confirmed"
              disabled={loading}
              className={cn(fieldErrors.subject && "border-red-500 focus-visible:ring-red-500")}
            />
            {fieldErrors.subject && <p className="text-sm text-red-500">{fieldErrors.subject}</p>}
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="email-content">Content *</Label>
            <Textarea
              id="email-content"
              value={content}
              onChange={(e) => { setContent(e.target.value); clearError("content") }}
              placeholder="<p>Hi {{first_name}},</p><p>Your booking is confirmed!</p>"
              disabled={loading}
              rows={8}
              className={cn("font-mono text-sm", fieldErrors.content && "border-red-500 focus-visible:ring-red-500")}
            />
            {fieldErrors.content ? (
              <p className="text-sm text-red-500">{fieldErrors.content}</p>
            ) : (
              <p className="text-xs text-gray-500">
                HTML is supported. Use the variables below as placeholders.
              </p>
            )}
          </div>

          {/* Available variables */}
          {templateDefaults && (
            <div className="space-y-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-xs font-medium text-gray-700">Available variables</p>
              <div className="flex flex-wrap gap-1.5">
                {templateDefaults.editableVariables.map((v) => (
                  <Badge key={v} variant="outline" className="font-mono text-xs cursor-pointer select-all">
                    {v}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Non-editable injected fields */}
          {templateDefaults && templateDefaults.injectedFields.length > 0 && (
            <div className="space-y-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-xs font-medium text-blue-700">Auto-included in every email</p>
              <ul className="space-y-1">
                {templateDefaults.injectedFields.map((field) => (
                  <li key={field} className="text-xs text-blue-600 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                    {field}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reply-to */}
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="email-reply-to">Reply-to (optional)</Label>
            <Input
              id="email-reply-to"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="hello@yourdomain.com"
              disabled={loading}
            />
            <p className="text-xs text-gray-500">
              If set, replies from users will go to this address instead of the From address.
            </p>
          </div>

          {/* Status */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-active" className="text-base font-medium">Active</Label>
                <p className="text-sm text-gray-500 mt-0.5">
                  When active, this email is sent automatically
                </p>
              </div>
              <Switch
                id="email-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={loading}
              />
            </div>
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
              Save Changes
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
