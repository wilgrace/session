"use client"

import { Suspense, useEffect, useState, useRef } from "react"
import { usePageHeaderAction } from "@/hooks/use-page-header-action"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  getOrganizationSettings,
  updateOrganizationSettings,
  applyDefaultImageToSessions,
  OrganizationSettings,
} from "@/app/actions/organization"
import { Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { BrandingImageUpload } from "@/components/admin/branding-image-upload"

export default function DesignPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <DesignPageContent />
    </Suspense>
  )
}

function DesignPageContent() {
  const { setAction } = usePageHeaderAction()
  const handleSaveRef = useRef<() => void>(() => {})
  handleSaveRef.current = handleSave

  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [logoUrl, setLogoUrl] = useState("")
  const [faviconUrl, setFaviconUrl] = useState("")
  const [headerImageUrl, setHeaderImageUrl] = useState("")
  const [defaultSessionImageUrl, setDefaultSessionImageUrl] = useState("")
  const [brandColor, setBrandColor] = useState("#6c47ff")
  const [brandTextColor, setBrandTextColor] = useState("#ffffff")

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
      setLogoUrl(result.data.logoUrl || "")
      setFaviconUrl(result.data.faviconUrl || "")
      setHeaderImageUrl(result.data.headerImageUrl || "")
      setDefaultSessionImageUrl(result.data.defaultSessionImageUrl || "")
      setBrandColor(result.data.brandColor || "#6c47ff")
      setBrandTextColor(result.data.brandTextColor || "#ffffff")
    } else {
      setError(result.error || "Failed to load settings")
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!settings) return
    setSaving(true)

    const result = await updateOrganizationSettings({
      organizationId: settings.id,
      name: settings.name,
      description: settings.description || null,
      slug: settings.slug,
      logoUrl: logoUrl || null,
      faviconUrl: faviconUrl || null,
      headerImageUrl: headerImageUrl || null,
      defaultSessionImageUrl: defaultSessionImageUrl || null,
      brandColor: brandColor || null,
      brandTextColor: brandTextColor || null,
      homepageUrl: settings.homepageUrl || null,
      instagramUrl: settings.instagramUrl || null,
      facebookUrl: settings.facebookUrl || null,
    })

    if (result.success) {
      if (defaultSessionImageUrl) {
        await applyDefaultImageToSessions(settings.id)
      }
      toast.success("Design settings saved")
      await loadSettings()
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
      <div className="border-b border-gray-200 bg-white p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <BrandingImageUpload
            label="Logo"
            value={logoUrl}
            onChange={setLogoUrl}
            description="Displayed in the booking calendar header. Recommended: 200x200px"
            aspectRatio="square"
          />
          <BrandingImageUpload
            label="Icon"
            value={faviconUrl}
            onChange={setFaviconUrl}
            description="Browser tab icon. Recommended: 32x32px or 48x48px"
            aspectRatio="square"
          />
        </div>

        <div className="space-y-6">
          <BrandingImageUpload
            label="Header Image"
            value={headerImageUrl}
            onChange={setHeaderImageUrl}
            description="Banner at the top of your booking page. Recommended: 1600x300 (16:3 aspect ratio), max 2MB"
            aspectRatio="banner"
          />
          <BrandingImageUpload
            label="Default Session Image"
            value={defaultSessionImageUrl}
            onChange={setDefaultSessionImageUrl}
            description="Used by default when creating new sessions. Recommended: 4:3 aspect ratio, max 2MB"
            aspectRatio="standard"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
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
