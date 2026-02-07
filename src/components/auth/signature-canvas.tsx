"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Eraser } from "lucide-react"

interface SignatureCanvasProps {
  onChange: (dataUrl: string | null) => void
  disabled?: boolean
}

export function SignatureCanvas({ onChange, disabled }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set up canvas for retina displays
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    // Style
    ctx.strokeStyle = "#000"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
  }, [])

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }

      const rect = canvas.getBoundingClientRect()

      if ("touches" in e) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        }
      }

      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    },
    []
  )

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (disabled) return

      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      if (!ctx) return

      const pos = getPos(e)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      setIsDrawing(true)
    },
    [disabled, getPos]
  )

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || disabled) return

      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      if (!ctx) return

      const pos = getPos(e)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      setHasSignature(true)
    },
    [isDrawing, disabled, getPos]
  )

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return
    setIsDrawing(false)

    const canvas = canvasRef.current
    if (canvas && hasSignature) {
      onChange(canvas.toDataURL("image/png"))
    }
  }, [isDrawing, hasSignature, onChange])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx || !canvas) return

    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    setHasSignature(false)
    onChange(null)
  }, [onChange])

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
          style={{ touchAction: "none" }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-gray-400">Sign here</p>
          </div>
        )}
      </div>
      {hasSignature && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={disabled}
          className="gap-2"
        >
          <Eraser className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
