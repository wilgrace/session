"use client"

import { useState } from "react"
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
import { Button } from "@/components/ui/button"
import { Eye, Info } from "lucide-react"

interface CommunitySurveySectionProps {
  enabled: boolean
  onToggle: (enabled: boolean) => Promise<void>
  onViewSurvey: () => void
}

export function CommunitySurveySection({
  enabled,
  onToggle,
  onViewSurvey,
}: CommunitySurveySectionProps) {
  const [isToggling, setIsToggling] = useState(false)

  async function handleToggle() {
    setIsToggling(true)
    await onToggle(!enabled)
    setIsToggling(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-500">
          Community surveys collect optional demographic data from users when they sign up or from their profile menu.
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Survey</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <div>
                  <p className="font-medium">Cardiff Survey</p>
                  <p className="text-sm text-gray-500 truncate max-w-xs">
                    Collects location, age, gender, ethnicity, housing &amp; work situation
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">6 questions</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={enabled}
                    onCheckedChange={handleToggle}
                    disabled={isToggling}
                  />
                  <Badge
                    variant={enabled ? "default" : "secondary"}
                    className={
                      enabled
                        ? "bg-green-100 text-green-800 hover:bg-green-100"
                        : ""
                    }
                  >
                    {enabled ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onViewSurvey}
                  className="h-8 w-8"
                  title="View survey"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
        <p>Custom surveys coming soon — configure your own questions for your community.</p>
      </div>
    </div>
  )
}
