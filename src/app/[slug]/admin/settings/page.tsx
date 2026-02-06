"use client"

import { Suspense, useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import Image from "next/image"
import {
  getOrganizationSettings,
  updateOrganizationSettings,
  checkSlugAvailability,
  OrganizationSettings,
} from "@/app/actions/organization"
import { Loader2, Upload, X, Check, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

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
  const [buttonColor, setButtonColor] = useState("#6c47ff")
  const [buttonTextColor, setButtonTextColor] = useState("#ffffff")

  // Slug validation state
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [checkingSlug, setCheckingSlug] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

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
      setButtonColor(result.data.buttonColor || "#6c47ff")
      setButtonTextColor(result.data.buttonTextColor || "#ffffff")
    } else {
      setError(result.error || "Failed to load settings")
    }

    setLoading(false)
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
      buttonColor: buttonColor || null,
      buttonTextColor: buttonTextColor || null,
    })

    if (result.success) {
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
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Basic Information */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
        <h3 className="text-base font-medium text-gray-900">Basic Information</h3>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Organization"
            />
            <p className="text-sm text-gray-500">
              The name of your organization displayed to customers.
            </p>
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
              A brief description shown to customers on your booking page.
            </p>
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">URL Path (Slug)</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Input
                  id="slug"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="my-organization"
                  className="pr-10"
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
            </div>
            <p className="text-sm text-gray-500">
              Your booking page URL: <span className="font-mono">{`/${formSlug || "your-slug"}`}</span>
            </p>
            {slugAvailable === false && formSlug !== settings?.slug && (
              <p className="text-sm text-red-600">
                This URL path is already taken or invalid.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Logo & Favicon */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
        <h3 className="text-base font-medium text-gray-900">Logo & Favicon</h3>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Logo */}
          <BrandingImageUpload
            label="Logo"
            value={logoUrl}
            onChange={setLogoUrl}
            description="Displayed in the header. Recommended: 200x60px"
            aspectRatio="wide"
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
      </div>

      {/* Images */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
        <h3 className="text-base font-medium text-gray-900">Images</h3>

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
      </div>

      {/* Button Colors */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
        <h3 className="text-base font-medium text-gray-900">Button Colors</h3>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Button Color */}
          <div className="space-y-2">
            <Label htmlFor="buttonColor">Button Colour</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="buttonColor"
                value={buttonColor}
                onChange={(e) => setButtonColor(e.target.value)}
                className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
              />
              <Input
                value={buttonColor}
                onChange={(e) => setButtonColor(e.target.value)}
                placeholder="#6c47ff"
                className="flex-1 font-mono"
              />
            </div>
            <p className="text-sm text-gray-500">
              Primary button background color. Default: #6c47ff
            </p>
          </div>

          {/* Button Text Color */}
          <div className="space-y-2">
            <Label htmlFor="buttonTextColor">Button Text Colour</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="buttonTextColor"
                value={buttonTextColor}
                onChange={(e) => setButtonTextColor(e.target.value)}
                className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
              />
              <Input
                value={buttonTextColor}
                onChange={(e) => setButtonTextColor(e.target.value)}
                placeholder="#ffffff"
                className="flex-1 font-mono"
              />
            </div>
            <p className="text-sm text-gray-500">
              Primary button text color. Default: #ffffff (white)
            </p>
          </div>
        </div>

        {/* Preview */}
        <div className="pt-4 border-t">
          <Label className="mb-3 block">Preview</Label>
          <Button
            style={{
              backgroundColor: buttonColor,
              color: buttonTextColor,
              borderColor: buttonColor,
            }}
            className="hover:opacity-90"
          >
            Book Now
          </Button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Changes
        </Button>
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

      {value ? (
        <div className="relative inline-block">
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
            className="absolute -top-2 -right-2 h-6 w-6"
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
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  )
}
