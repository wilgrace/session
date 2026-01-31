"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Info } from "lucide-react"

interface ImportantInfoProps {
  instructions?: string | null
}

export function ImportantInfo({ instructions }: ImportantInfoProps) {
  if (!instructions) {
    return null
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-medium text-blue-900">Important Information</h4>
            <p className="text-sm text-blue-800 whitespace-pre-wrap">{instructions}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
