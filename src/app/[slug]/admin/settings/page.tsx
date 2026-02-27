"use client"

import { Suspense, useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { usePageHeaderAction } from "@/hooks/use-page-header-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import Image from "next/image"
import {
  getOrganizationSettings,
  updateOrganizationSettings,
  checkSlugAvailability,
  toggleCommunitySurvey,
  applyDefaultImageToSessions,
  OrganizationSettings,
} from "@/app/actions/organization"
import { getWaivers } from "@/app/actions/waivers"
import { getEmailTemplates } from "@/app/actions/email-templates"
import { Loader2, Upload, X, Check, AlertCircle, Copy } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
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

  // Waivers state
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [waiverFormOpen, setWaiverFormOpen] = useState(false)
  const [editingWaiver, setEditingWaiver] = useState<Waiver | null>(null)

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

    // Get organization settings (org ID is retrieved from headers in the server action)
    const result = await getOrganizationSettings()

    if (result.success && result.data) {
      setSettings(result.data)
      // Initialize form state
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
      setCommunitySurveyEnabled(result.data.communitySurveyEnabled)

      // Load waivers and email templates in parallel
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

  // Waiver handlers
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

  // Community survey handlers
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

  // Check slug availability when it changes
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

    // Validate required fields
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
    })

    if (result.success) {
      // Backfill sessions that have no image with the new default
      if (defaultSessionImageUrl) {
        await applyDefaultImageToSessions(settings.id)
      }

      toast.success("Settings saved successfully")

      // If slug changed, redirect to new URL
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
      {/* Basic Information */}
      <div className="border-b border-gray-200 bg-white p-6 space-y-6">

        <div className="space-y-8 max-w-xl ">
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
          <div className="space-y-2 ">
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
          orgName={settings?.name || ""}
          orgLogoUrl={settings?.logoUrl || null}
          brandColor={brandColor}
          brandTextColor={brandTextColor}
          onRefresh={handleEmailTemplatesRefresh}
        />
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

      {/* Waiver Form Sheet */}
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
          <h3 className="text-lg font-medium text-gray-900">Community Survey</h3>
        </div>
        <CommunitySurveySection
          enabled={communitySurveyEnabled}
          onToggle={handleToggleCommunitySurvey}
          onViewSurvey={() => setSurveyPreviewOpen(true)}
        />
      </div>

      {/* Survey Preview Overlay */}
      <CommunityProfileOverlay
        isOpen={surveyPreviewOpen}
        onComplete={() => setSurveyPreviewOpen(false)}
        onSkip={() => setSurveyPreviewOpen(false)}
      />

      {/* Brand & Design */}
      <div className="border-b border-gray-200 bg-white p-6 space-y-6">
        <h3 className="text-lg font-medium text-gray-900">Brand & Design</h3>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Logo */}
          <BrandingImageUpload
            label="Logo"
            value={logoUrl}
            onChange={setLogoUrl}
            description="Displayed in the booking calendar header. Recommended: 200x200px"
            aspectRatio="square"
          />

          {/* Favicon */}
          <BrandingImageUpload
            label="Favicon"
            value={faviconUrl}
            onChange={setFaviconUrl}
            description="Browser tab icon. Recommended: 32x32px or 48x48px"
            aspectRatio="square"
          />
        </div>

      {/* Images */}

        <div className="space-y-6">
          {/* Header Image */}
          <BrandingImageUpload
            label="Header Image"
            value={headerImageUrl}
            onChange={setHeaderImageUrl}
            description="Banner at the top of your booking page. Recommended: 1600x300 (16:3 aspect ratio), max 2MB"
            aspectRatio="banner"
          />

          {/* Default Session Image */}
          <BrandingImageUpload
            label="Default Session Image"
            value={defaultSessionImageUrl}
            onChange={setDefaultSessionImageUrl}
            description="Used by default when creating new sessions. Recommended: 4:3 aspect ratio, max 2MB"
            aspectRatio="standard"
          />
        </div>

      {/* Brand Colors */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Button Color */}
          <div className="space-y-2">
            <Label htmlFor="brandColor">Brand Colour</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="brandColor"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
              />
              <Input
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                placeholder="#6c47ff"
                className="flex-1 font-mono"
              />
            </div>
            <p className="text-sm text-gray-500">
              Brand color used for buttons, links, and accents. Default: #6c47ff
            </p>
          </div>

          {/* Button Text Color */}
          <div className="space-y-2">
            <Label htmlFor="brandTextColor">Brand Text Colour</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="brandTextColor"
                value={brandTextColor}
                onChange={(e) => setBrandTextColor(e.target.value)}
                className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
              />
              <Input
                value={brandTextColor}
                onChange={(e) => setBrandTextColor(e.target.value)}
                placeholder="#ffffff"
                className="flex-1 font-mono"
              />
            </div>
            <p className="text-sm text-gray-500">
              Text color on brand-colored elements. Default: #ffffff (white)
            </p>
          </div>

        {/* Preview */}
        <div className="pt-1">
          <Label className="mb-3 block">Preview</Label>
          <Button
            style={{
              backgroundColor: brandColor,
              color: brandTextColor,
              borderColor: brandColor,
            }}
            className="hover:opacity-90"
          >
            Book Now
          </Button>
        </div>
      </div>
      </div>

    </div>
  )
}

// Image upload component for branding
interface BrandingImageUploadProps {
  label: string
  value: string
  onChange: (url: string) => void
  description: string
  aspectRatio: "square" | "wide" | "banner" | "standard"
}

function BrandingImageUpload({
  label,
  value,
  onChange,
  description,
  aspectRatio,
}: BrandingImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const aspectRatioClasses = {
    square: "aspect-square w-24",
    wide: "aspect-[3/1] w-48",
    banner: "aspect-[16/3] w-full max-w-lg",
    standard: "aspect-[4/3] w-48",
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || "Upload failed")
        return
      }

      if (result.url) {
        onChange(result.url)
      }
    } catch {
      setError("Failed to upload image")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRemove = () => {
    onChange("")
    setError(null)
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-sm text-gray-500">{description}</p>

      {value ? (
        <div className="relative">
          <div
            className={cn(
              "relative rounded-lg overflow-hidden border bg-gray-50",
              aspectRatioClasses[aspectRatio]
            )}
          >
            <Image
              src={value}
              alt={label}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 400px"
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-0 -right-0 h-6 w-6"
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
            "hover:border-primary hover:bg-primary/5",
            isUploading && "opacity-50 cursor-not-allowed",
            aspectRatioClasses[aspectRatio],
            "flex flex-col items-center justify-center"
          )}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          <Upload className="h-6 w-6 text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">
            {isUploading ? "Uploading..." : "Click to upload"}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
