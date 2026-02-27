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
import { Pencil, Plus, FileText } from "lucide-react"
import type { Waiver } from "@/lib/db/schema"
import { toggleWaiverActive } from "@/app/actions/waivers"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface WaiversListProps {
  waivers: Waiver[]
  onEdit: (waiver: Waiver) => void
  onCreate: () => void
  onRefresh: () => void
}

export function WaiversList({
  waivers,
  onEdit,
  onCreate,
  onRefresh,
}: WaiversListProps) {
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleToggleActive(waiver: Waiver) {
    setTogglingId(waiver.id)
    const result = await toggleWaiverActive(waiver.id, !waiver.isActive)

    if (result.success) {
      toast.success(waiver.isActive ? "Waiver deactivated" : "Waiver activated")
      onRefresh()
    } else {
      toast.error(result.error || "Failed to update waiver")
    }
    setTogglingId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            New users must agree to the active waiver when signing up.
          </p>
        </div>
        <Button onClick={onCreate} className="gap-2" variant="outline">
          <Plus className="h-4 w-4" />
          Create Waiver
        </Button>
      </div>

      {waivers.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">
            No waivers yet. Create your first waiver to require user agreement.
          </p>
          <Button onClick={onCreate} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Create Waiver
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waivers.map((waiver) => (
                <TableRow key={waiver.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{waiver.title}</p>
                      {waiver.summary && (
                        <p className="text-sm text-gray-500 truncate max-w-xs">
                          {waiver.summary}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {waiver.agreementType === "signature"
                        ? "Signature"
                        : "Checkbox"}
                    </Badge>
                  </TableCell>
                  <TableCell>v{waiver.version}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {formatDistanceToNow(new Date(waiver.updatedAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={waiver.isActive}
                        onCheckedChange={() => handleToggleActive(waiver)}
                        disabled={togglingId === waiver.id}
                      />
                      <Badge
                        variant={waiver.isActive ? "default" : "secondary"}
                        className={
                          waiver.isActive
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : ""
                        }
                      >
                        {waiver.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(waiver)}
                      className="h-8 w-8"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
