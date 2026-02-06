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
import { Pencil, GripVertical, Plus, Copy, Check } from "lucide-react"
import type { Membership } from "@/lib/db/schema"
import { updateMembership } from "@/app/actions/memberships"
import { useParams } from "next/navigation"
import { toast } from "sonner"

interface MembershipsListProps {
  memberships: Membership[]
  onEdit: (membership: Membership) => void
  onCreate: () => void
  onRefresh: () => void
}

export function MembershipsList({
  memberships,
  onEdit,
  onCreate,
  onRefresh,
}: MembershipsListProps) {
  const params = useParams()
  const slug = params.slug as string
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function formatPrice(priceInPence: number): string {
    if (priceInPence === 0) return "Free"
    return `£${(priceInPence / 100).toFixed(2)}`
  }

  function formatBillingPeriod(period: string): string {
    switch (period) {
      case "monthly":
        return "/mo"
      case "yearly":
        return "/yr"
      case "one_time":
        return " once"
      default:
        return ""
    }
  }

  function formatMemberPrice(membership: Membership): string {
    if (membership.memberPriceType === "fixed" && membership.memberFixedPrice) {
      return `£${(membership.memberFixedPrice / 100).toFixed(2)}/session`
    }
    if (membership.memberPriceType === "discount" && membership.memberDiscountPercent) {
      return `${membership.memberDiscountPercent}% off`
    }
    return "—"
  }

  async function handleToggleActive(membership: Membership) {
    setTogglingId(membership.id)
    const result = await updateMembership({
      id: membership.id,
      isActive: !membership.isActive,
    })

    if (result.success) {
      toast.success(
        membership.isActive ? "Membership deactivated" : "Membership activated"
      )
      onRefresh()
    } else {
      toast.error(result.error || "Failed to update membership")
    }
    setTogglingId(null)
  }

  function handleCopyLink(membershipId: string) {
    const url = `${window.location.origin}/${slug}/membership/${membershipId}`
    navigator.clipboard.writeText(url)
    setCopiedId(membershipId)
    toast.success("Link copied to clipboard")
    setTimeout(() => setCopiedId(null), 2000)
  }

  function getSignUpDisplay(membership: Membership): string {
    const { showOnBookingPage, showOnMembershipPage } = membership
    if (showOnBookingPage && showOnMembershipPage) return "Session & Direct"
    if (showOnBookingPage) return "Session"
    if (showOnMembershipPage) return "Direct"
    return "Hidden"
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Create membership tiers to offer subscribers discounted session pricing.
          </p>
        </div>
        <Button onClick={onCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Membership
        </Button>
      </div>

      {memberships.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
          <p className="text-sm text-gray-500 mb-4">
            No memberships yet. Create your first membership tier.
          </p>
          <Button onClick={onCreate} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Create Membership
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Member Session Price</TableHead>
                <TableHead>Sign Up</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((membership) => (
                <TableRow key={membership.id}>
                  <TableCell>
                    <GripVertical className="h-4 w-4 text-gray-400 cursor-grab" />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{membership.name}</p>
                      {membership.description && (
                        <p className="text-sm text-gray-500 truncate max-w-xs">
                          {membership.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {formatPrice(membership.price)}
                    </span>
                    <span className="text-gray-500">
                      {formatBillingPeriod(membership.billingPeriod)}
                    </span>
                  </TableCell>
                  <TableCell>{formatMemberPrice(membership)}</TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {getSignUpDisplay(membership)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={membership.isActive}
                        onCheckedChange={() => handleToggleActive(membership)}
                        disabled={togglingId === membership.id}
                      />
                      <Badge
                        variant={membership.isActive ? "default" : "secondary"}
                        className={
                          membership.isActive
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : ""
                        }
                      >
                        {membership.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {membership.showOnMembershipPage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyLink(membership.id)}
                          className="h-8 w-8"
                          title="Copy membership link"
                        >
                          {copiedId === membership.id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(membership)}
                        className="h-8 w-8"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
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
