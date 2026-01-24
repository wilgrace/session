"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, X, Link as LinkIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  disabled?: boolean
}

export function ImageUpload({ value, onChange, disabled }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    } catch (err) {
      setError("Failed to upload image")
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim())
      setUrlInput("")
      setShowUrlInput(false)
    }
  }

  const handleRemove = () => {
    onChange("")
    setError(null)
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Session Image</Label>

      {value ? (
        <div className="relative">
          <div className="relative w-full h-40 rounded-lg overflow-hidden border">
            <Image
              src={value}
              alt="Session image"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 400px"
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8"
            onClick={handleRemove}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Upload area */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              "hover:border-primary hover:bg-primary/5",
              isUploading && "opacity-50 cursor-not-allowed",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !isUploading && !disabled && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading || disabled}
            />
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isUploading ? "Uploading..." : "Click to upload an image"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPEG, PNG, WebP, or GIF (max 5MB)
            </p>
          </div>

          {/* URL input toggle */}
          <div className="flex items-center justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowUrlInput(!showUrlInput)}
              disabled={disabled}
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              {showUrlInput ? "Hide URL input" : "Or use a URL"}
            </Button>
          </div>

          {/* URL input */}
          {showUrlInput && (
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={disabled}
              />
              <Button
                type="button"
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim() || disabled}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <p className="text-sm text-gray-500">
        Optional image displayed on the booking page for this session.
      </p>
    </div>
  )
}
