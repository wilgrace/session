"use client"

import { Suspense, useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { usePageHeaderAction } from "@/hooks/use-page-header-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  getOrganizationSettings,
  updateOrganizationSettings,
  checkSlugAvailability,
  toggleCommunitySurvey,
  OrganizationSettings,
} from "@/app/actions/organization"
import { getWaivers } from "@/app/actions/waivers"
import { getEmailTemplates } from "@/app/actions/email-templates"
import { Loader2, Check, AlertCircle, Copy } from "lucide-react"
import { toast } from "sonner"
import { WaiversList } from "@/components/admin/waivers-list"
import { WaiverForm } from "@/components/admin/waiver-form"
import { EmailTemplatesList } from "@/components/admin/email-templates-list"
import { CommunitySurveySection } from "@/components/admin/community-survey-section"
import { CommunityProfileOverlay } from "@/components/auth/community-profile-overlay"
import type { Waiver, OrgEmailTemplate } from "@/lib/db/schema"

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  )
}

function SettingsPageContent() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const { setAction } = usePageHeaderAction()
  const handleSaveRef = useRef<() => void>(() => {})
  handleSaveRef.current = handleSave

  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [formSlug, setFormSlug] = useState("")
  // Design fields kept in state for pass-through on save (not editable here)
  const [logoUrl, setLogoUrl] = useState("")
  const [faviconUrl, setFaviconUrl] = useState("")
  const [headerImageUrl, setHeaderImageUrl] = useState("")
  const [defaultSessionImageUrl, setDefaultSessionImageUrl] = useState("")
  const [brandColor, setBrandColor] = useState("#6c47ff")
  const [brandTextColor, setBrandTextColor] = useState("#ffffff")
  const [homepageUrl, setHomepageUrl] = useState("")
  const [instagramUrl, setInstagramUrl] = useState("")
  const [facebookUrl, setFacebookUrl] = useState("")

  // Slug validation state
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [checkingSlug, setCheckingSlug] = useState(false)

  // Email templates state
  const [emailTemplates, setEmailTemplates] = useState<OrgEmailTemplate[]>([])
  const [adminNotificationEmail, setAdminNotificationEmail] = useState("")

  // Waivers state
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [waiverFormOpen, setWaiverFormOpen] = useState(false)
  const [editingWaiver, setEditingWaiver] = useState<Waiver | null>(null)

  // Cancellations state
  const [cancellationWindowHours, setCancellationWindowHours] = useState(0)

  // Community survey state
  const [communitySurveyEnabled, setCommunitySurveyEnabled] = useState(true)
  const [surveyPreviewOpen, setSurveyPreviewOpen] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    setAction({ label: "Save Changes", onClick: () => handleSaveRef.current(), loading: saving })
    return () => setAction(null)
  }, [saving])

  async function loadSettings() {
    setLoading(true)
    setError(null)

    const result = await getOrganizationSettings()

    if (result.success && result.data) {
      setSettings(result.data)
      setName(result.data.name)
      setDescription(result.data.description || "")
      setFormSlug(result.data.slug)
      setLogoUrl(result.data.logoUrl || "")
      setFaviconUrl(result.data.faviconUrl || "")
      setHeaderImageUrl(result.data.headerImageUrl || "")
      setDefaultSessionImageUrl(result.data.defaultSessionImageUrl || "")
      setBrandColor(result.data.brandColor || "#6c47ff")
      setBrandTextColor(result.data.brandTextColor || "#ffffff")
      setHomepageUrl(result.data.homepageUrl || "")
      setInstagramUrl(result.data.instagramUrl || "")
      setFacebookUrl(result.data.facebookUrl || "")
      setAdminNotificationEmail(result.data.adminNotificationEmail || "")
      setCancellationWindowHours(result.data.cancellationWindowHours ?? 0)
      setCommunitySurveyEnabled(result.data.communitySurveyEnabled)

      const [waiversResult, emailTemplatesResult] = await Promise.all([
        getWaivers(),
        getEmailTemplates(),
      ])
      if (waiversResult.success && waiversResult.data) {
        setWaivers(waiversResult.data)
      }
      if (emailTemplatesResult.success && emailTemplatesResult.data) {
        setEmailTemplates(emailTemplatesResult.data)
      }
    } else {
      setError(result.error || "Failed to load settings")
    }

    setLoading(false)
  }

  async function handleWaiverRefresh() {
    const result = await getWaivers()
    if (result.success && result.data) {
      setWaivers(result.data)
    }
  }

  async function handleEmailTemplatesRefresh() {
    const result = await getEmailTemplates()
    if (result.success && result.data) {
      setEmailTemplates(result.data)
    }
  }

  function handleEditWaiver(waiver: Waiver) {
    setEditingWaiver(waiver)
    setWaiverFormOpen(true)
  }

  function handleCreateWaiver() {
    setEditingWaiver(null)
    setWaiverFormOpen(true)
  }

  async function handleToggleCommunitySurvey(enabled: boolean) {
    if (!settings) return
    const result = await toggleCommunitySurvey(settings.id, enabled)
    if (result.success) {
      setCommunitySurveyEnabled(enabled)
      toast.success(enabled ? "Community survey enabled" : "Community survey disabled")
    } else {
      toast.error(result.error || "Failed to update community survey setting")
    }
  }

  useEffect(() => {
    if (!settings) return
    if (formSlug === settings.slug) {
      setSlugAvailable(null)
      return
    }

    const timeoutId = setTimeout(async () => {
      if (formSlug.length < 3) {
        setSlugAvailable(false)
        return
      }

      setCheckingSlug(true)
      const result = await checkSlugAvailability(formSlug, settings.id)
      setSlugAvailable(result.available ?? false)
      setCheckingSlug(false)
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [formSlug, settings])

  async function handleSave() {
    if (!settings) return

    if (!name.trim()) {
      toast.error("Organization name is required")
      return
    }

    if (!formSlug.trim() || formSlug.length < 3) {
      toast.error("Slug must be at least 3 characters")
      return
    }

    if (formSlug !== settings.slug && !slugAvailable) {
      toast.error("This URL path is not available")
      return
    }

    setSaving(true)

    const result = await updateOrganizationSettings({
      organizationId: settings.id,
      name: name.trim(),
      description: description.trim() || null,
      slug: formSlug.trim(),
      logoUrl: logoUrl || null,
      faviconUrl: faviconUrl || null,
      headerImageUrl: headerImageUrl || null,
      defaultSessionImageUrl: defaultSessionImageUrl || null,
      brandColor: brandColor || null,
      brandTextColor: brandTextColor || null,
      homepageUrl: homepageUrl.trim() || null,
      instagramUrl: instagramUrl.trim() || null,
      facebookUrl: facebookUrl.trim() || null,
      cancellationWindowHours: cancellationWindowHours,
    })

    if (result.success) {
      toast.success("Settings saved successfully")

      if (formSlug !== settings.slug) {
        router.push(`/${formSlug}/admin/settings`)
      } else {
        await loadSettings()
      }
    } else {
      toast.error(result.error || "Failed to save settings")
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 pb-6">
      {/* General */}
      <div className="border-b border-gray-200 bg-white p-6 space-y-6">
        <div className="space-y-8 max-w-xl">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Organisation Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Organisation"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of your organization..."
              rows={3}
            />
            <p className="text-sm text-gray-500">
              To help search engines find you
            </p>
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">Booking URL (Slug)</Label>
            <div className="flex items-center gap-0">
              <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 h-10 whitespace-nowrap">
                https://www.bookasession.org/
              </span>
              <div className="flex-1 relative">
                <Input
                  id="slug"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="my-organization"
                  className="rounded-l-none rounded-r-none pr-10"
                />
                {checkingSlug && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                )}
                {!checkingSlug && slugAvailable === true && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                )}
                {!checkingSlug && slugAvailable === false && formSlug !== settings?.slug && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-l-none h-10 w-10 border-l-0"
                onClick={() => {
                  navigator.clipboard.writeText(`https://www.bookasession.org/${formSlug}`)
                  toast.success("URL copied to clipboard")
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              This is the link to share with your visitors
            </p>
            {slugAvailable === false && formSlug !== settings?.slug && (
              <p className="text-sm text-red-600">
                This URL path is already taken or invalid.
              </p>
            )}
          </div>

          {/* Homepage */}
          <div className="space-y-2">
            <Label htmlFor="homepageUrl">Homepage (optional)</Label>
            <Input
              id="homepageUrl"
              type="url"
              value={homepageUrl}
              onChange={(e) => setHomepageUrl(e.target.value)}
              placeholder="https://www.example.com"
            />
            <p className="text-sm text-gray-500">
              Enter your main website URL. If provided, a Home link will appear on your booking page.
            </p>
          </div>

          {/* Social Links */}
          <div className="space-y-2">
            <Label>Social Links (optional)</Label>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                  </svg>
                  <Input
                    id="instagramUrl"
                    type="url"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    placeholder="https://instagram.com/yourpage"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                  </svg>
                  <Input
                    id="facebookUrl"
                    type="url"
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                    placeholder="https://facebook.com/yourpage"
                  />
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Social media links will be displayed as icons on your booking page header.
            </p>
          </div>
        </div>
      </div>

      {/* Emails */}
      <div className="border-b border-gray-200 bg-white p-6 space-y-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Emails</h3>
          <p className="text-sm text-gray-500 mt-1">
            Configure notification emails sent to your users automatically.
          </p>
        </div>
        <EmailTemplatesList
          templates={emailTemplates}
          types={['booking_confirmation', 'membership_confirmation', 'waiting_list']}
          orgName={settings?.name || ""}
          orgLogoUrl={settings?.logoUrl || null}
          brandColor={brandColor}
          brandTextColor={brandTextColor}
          adminNotificationEmail={adminNotificationEmail}
          onRefresh={handleEmailTemplatesRefresh}
        />
      </div>

      {/* Cancellations */}
      <div className="border-b border-gray-200 bg-white p-6 space-y-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Cancellations</h3>
          <p className="text-sm text-gray-500 mt-1">
            Control how far in advance users can cancel or change their booking.
          </p>
        </div>

        <div className="max-w-xl space-y-2">
          <Label htmlFor="cancellationWindow">Lock booking</Label>
          <div className="flex items-center gap-3 max-w-xs">
            <Input
              id="cancellationWindow"
              type="number"
              min={0}
              step={1}
              value={cancellationWindowHours}
              onChange={(e) => setCancellationWindowHours(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-32"
            />
            <span className="text-sm text-gray-500">hours before session</span>
          </div>
          <p className="text-sm text-gray-500">
            {cancellationWindowHours === 0
              ? "Users can cancel or change their booking up until the session starts."
              : `Users can cancel or change their booking up to ${cancellationWindowHours} hour${cancellationWindowHours === 1 ? "" : "s"} before the session. After that, changes are locked.`}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Cancellation emails</p>
          <EmailTemplatesList
            templates={emailTemplates}
            types={['booking_cancellation', 'booking_cancellation_notification', 'session_cancellation']}
            orgName={settings?.name || ""}
            orgLogoUrl={settings?.logoUrl || null}
            brandColor={brandColor}
            brandTextColor={brandTextColor}
            adminNotificationEmail={adminNotificationEmail}
            onRefresh={handleEmailTemplatesRefresh}
          />
        </div>
      </div>

      {/* Waivers */}
      <div className="border-b border-gray-200 bg-white p-6 space-y-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Waivers</h3>
        </div>
        <WaiversList
          waivers={waivers}
          onEdit={handleEditWaiver}
          onCreate={handleCreateWaiver}
          onRefresh={handleWaiverRefresh}
        />
      </div>

      <WaiverForm
        open={waiverFormOpen}
        onClose={() => {
          setWaiverFormOpen(false)
          setEditingWaiver(null)
        }}
        waiver={editingWaiver}
        onSuccess={handleWaiverRefresh}
      />

      {/* Community Survey */}
      <div className="border-b border-gray-200 bg-white p-6 space-y-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Surveys</h3>
        </div>
        <CommunitySurveySection
          enabled={communitySurveyEnabled}
          onToggle={handleToggleCommunitySurvey}
          onViewSurvey={() => setSurveyPreviewOpen(true)}
        />
      </div>

      <CommunityProfileOverlay
        isOpen={surveyPreviewOpen}
        onComplete={() => setSurveyPreviewOpen(false)}
        onSkip={() => setSurveyPreviewOpen(false)}
      />
    </div>
  )
}
