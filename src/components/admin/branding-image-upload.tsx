"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface BrandingImageUploadProps {
  label: string
  value: string
  onChange: (url: string) => void
  description: string
  aspectRatio: "square" | "wide" | "banner" | "standard"
}

export function BrandingImageUpload({
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
