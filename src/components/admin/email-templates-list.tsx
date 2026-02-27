"use client"

import { useState } from "react"
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
import { Eye, Pencil, Mail } from "lucide-react"
import type { OrgEmailTemplate } from "@/lib/db/schema"
import { toggleEmailTemplateActive } from "@/app/actions/email-templates"
import { toast } from "sonner"
import { EMAIL_TEMPLATE_LABELS } from "@/lib/email-defaults"
import { EmailTemplateForm } from "./email-template-form"
import { EmailTemplatePreviewModal } from "./email-template-preview-modal"

interface EmailTemplatesListProps {
  templates: OrgEmailTemplate[]
  orgName: string
  orgLogoUrl: string | null
  brandColor: string
  brandTextColor: string
  onRefresh: () => void
}

export function EmailTemplatesList({
  templates,
  orgName,
  orgLogoUrl,
  brandColor,
  brandTextColor,
  onRefresh,
}: EmailTemplatesListProps) {
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<OrgEmailTemplate | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<OrgEmailTemplate | null>(null)

  async function handleToggleActive(template: OrgEmailTemplate) {
    setTogglingId(template.id)
    const result = await toggleEmailTemplateActive(template.id, !template.isActive)
    if (result.success) {
      toast.success(template.isActive ? "Email disabled" : "Email enabled")
      onRefresh()
    } else {
      toast.error(result.error || "Failed to update email")
    }
    setTogglingId(null)
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
        <Mail className="h-8 w-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No email templates found.</p>
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Subject</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell>
                  <p className="font-medium text-sm">{template.subject}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {EMAIL_TEMPLATE_LABELS[template.type as keyof typeof EMAIL_TEMPLATE_LABELS] ?? template.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={template.isActive}
                      onCheckedChange={() => handleToggleActive(template)}
                      disabled={togglingId === template.id}
                    />
                    <Badge
                      variant={template.isActive ? "default" : "secondary"}
                      className={template.isActive ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
                    >
                      {template.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreviewTemplate(template)}
                      className="h-8 w-8"
                      title="Preview email"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingTemplate(template)}
                      className="h-8 w-8"
                      title="Edit template"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EmailTemplateForm
        open={editingTemplate !== null}
        onClose={() => setEditingTemplate(null)}
        template={editingTemplate}
        onSuccess={() => {
          setEditingTemplate(null)
          onRefresh()
        }}
      />

      <EmailTemplatePreviewModal
        open={previewTemplate !== null}
        onClose={() => setPreviewTemplate(null)}
        template={previewTemplate}
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
        brandColor={brandColor}
        brandTextColor={brandTextColor}
      />
    </>
  )
}
