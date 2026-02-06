"use client"

import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import type { Membership, BillingPeriod } from "@/lib/db/schema"
import { createMembership, updateMembership } from "@/app/actions/memberships"
import { ImageUpload } from "@/components/admin/image-upload"
import { useSlugOptional } from "@/lib/slug-context"

interface MembershipFormProps {
  open: boolean
  onClose: () => void
  membership: Membership | null
  onSuccess: () => void
  slug?: string
}

export function MembershipForm({
  open,
  onClose,
  membership,
  onSuccess,
  slug: propSlug,
}: MembershipFormProps) {
  const contextSlug = useSlugOptional()
  const slug = propSlug || contextSlug
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [price, setPrice] = useState("")
  const [isFree, setIsFree] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly")
  const [memberPriceType, setMemberPriceType] = useState<"discount" | "fixed">("discount")
  const [discountPercent, setDiscountPercent] = useState("")
  const [fixedPrice, setFixedPrice] = useState("")
  const [showOnBookingPage, setShowOnBookingPage] = useState(true)
  const [showOnMembershipPage, setShowOnMembershipPage] = useState(true)
  const [isActive, setIsActive] = useState(true)

  // Reset form when membership changes
  useEffect(() => {
    if (membership) {
      setName(membership.name)
      setDescription(membership.description || "")
      setImageUrl(membership.imageUrl || "")
      setPrice(membership.price > 0 ? (membership.price / 100).toString() : "")
      setIsFree(membership.price === 0)
      setBillingPeriod(membership.billingPeriod as BillingPeriod)
      setMemberPriceType(membership.memberPriceType as "discount" | "fixed")
      setDiscountPercent(membership.memberDiscountPercent?.toString() || "")
      setFixedPrice(
        membership.memberFixedPrice
          ? (membership.memberFixedPrice / 100).toString()
          : ""
      )
      setShowOnBookingPage(membership.showOnBookingPage ?? membership.displayToNonMembers)
      setShowOnMembershipPage(membership.showOnMembershipPage ?? true)
      setIsActive(membership.isActive)
    } else {
      // Reset for new membership
      setName("")
      setDescription("")
      setImageUrl("")
      setPrice("")
      setIsFree(false)
      setBillingPeriod("monthly")
      setMemberPriceType("discount")
      setDiscountPercent("20")
      setFixedPrice("")
      setShowOnBookingPage(true)
      setShowOnMembershipPage(true)
      setIsActive(true)
    }
  }, [membership, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validation
    if (!name.trim()) {
      toast.error("Please enter a membership name")
      return
    }

    if (!isFree && (!price || parseFloat(price) <= 0)) {
      toast.error("Please enter a valid price or mark as free")
      return
    }

    if (
      memberPriceType === "discount" &&
      (!discountPercent || parseInt(discountPercent) <= 0 || parseInt(discountPercent) > 100)
    ) {
      toast.error("Please enter a valid discount percentage (1-100)")
      return
    }

    if (memberPriceType === "fixed" && (!fixedPrice || parseFloat(fixedPrice) < 0)) {
      toast.error("Please enter a valid fixed price")
      return
    }

    setLoading(true)

    const priceInPence = isFree ? 0 : Math.round(parseFloat(price) * 100)
    const fixedPriceInPence =
      memberPriceType === "fixed" ? Math.round(parseFloat(fixedPrice) * 100) : undefined

    const params = {
      name: name.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl || undefined,
      price: priceInPence,
      billingPeriod,
      memberPriceType,
      memberDiscountPercent:
        memberPriceType === "discount" ? parseInt(discountPercent) : undefined,
      memberFixedPrice: fixedPriceInPence,
      showOnBookingPage,
      showOnMembershipPage,
      isActive,
    }

    let result
    if (membership) {
      result = await updateMembership({ id: membership.id, ...params })
    } else {
      result = await createMembership(params)
    }

    if (result.success) {
      toast.success(membership ? "Membership updated" : "Membership created")
      onSuccess()
      onClose()
    } else {
      toast.error(result.error || "Failed to save membership")
    }

    setLoading(false)
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {membership ? "Edit Membership" : "Create Membership"}
          </SheetTitle>
          <SheetDescription>
            {membership
              ? "Update the membership details below."
              : "Create a new membership tier for your organization."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Monthly Membership"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the benefits of this membership..."
                disabled={loading}
                rows={3}
              />
            </div>

            <ImageUpload
              value={imageUrl}
              onChange={setImageUrl}
              disabled={loading}
            />
          </div>

          {/* Pricing */}
          <div className="space-y-4 border-t pt-4">
            <Label className="text-base font-medium">Subscription Price</Label>

            <div className="flex items-center gap-3">
              <Switch
                id="isFree"
                checked={isFree}
                onCheckedChange={setIsFree}
                disabled={loading}
              />
              <Label htmlFor="isFree" className="font-normal cursor-pointer">
                Free membership
              </Label>
            </div>

            {!isFree && (
              <>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="price">Price *</Label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                        £
                      </span>
                      <Input
                        id="price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="pl-7"
                        placeholder="15.00"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <div className="w-40">
                    <Label>Billing Period</Label>
                    <Select
                      value={billingPeriod}
                      onValueChange={(v) => setBillingPeriod(v as BillingPeriod)}
                      disabled={loading}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                        <SelectItem value="one_time">One-time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Member Session Pricing */}
          <div className="space-y-4 border-t pt-4">
            <div>
              <Label className="text-base font-medium">
                Member Session Pricing
              </Label>
              <p className="text-sm text-gray-500 mt-1">
                How much do members pay for sessions?
              </p>
            </div>

            <RadioGroup
              value={memberPriceType}
              onValueChange={(v) => setMemberPriceType(v as "discount" | "fixed")}
              className="space-y-3"
              disabled={loading}
            >
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="discount" id="m-discount" />
                <Label htmlFor="m-discount" className="font-normal cursor-pointer">
                  Percentage discount off drop-in price
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="fixed" id="m-fixed" />
                <Label htmlFor="m-fixed" className="font-normal cursor-pointer">
                  Fixed price for all sessions
                </Label>
              </div>
            </RadioGroup>

            {memberPriceType === "discount" && (
              <div className="flex items-center gap-2 ml-6">
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  className="w-24"
                  placeholder="20"
                  disabled={loading}
                />
                <span className="text-sm text-gray-600">% off drop-in price</span>
              </div>
            )}

            {memberPriceType === "fixed" && (
              <div className="flex items-center gap-2 ml-6">
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    £
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={fixedPrice}
                    onChange={(e) => setFixedPrice(e.target.value)}
                    className="pl-7"
                    placeholder="5.00"
                    disabled={loading}
                  />
                </div>
                <span className="text-sm text-gray-600">per session</span>
              </div>
            )}
          </div>

          {/* Signing Up */}
          <div className="space-y-4 border-t pt-4">
            <div>
              <Label className="text-base font-medium">Signing Up</Label>
              <p className="text-sm text-gray-500 mt-0.5">
                How can customers find and sign up for this membership
              </p>
            </div>

            {/* Toggle 1: When booking a session */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="showOnBookingPage" className="font-normal">
                  When booking a session
                </Label>
                <p className="text-sm text-gray-500 mt-0.5">
                  Can be bought at the same time as booking a session
                </p>
              </div>
              <Switch
                id="showOnBookingPage"
                checked={showOnBookingPage}
                onCheckedChange={setShowOnBookingPage}
                disabled={loading}
              />
            </div>

            {/* Toggle 2: On a membership page */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="showOnMembershipPage" className="font-normal">
                    On a membership page
                  </Label>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Customers can sign up directly at a dedicated URL
                  </p>
                </div>
                <Switch
                  id="showOnMembershipPage"
                  checked={showOnMembershipPage}
                  onCheckedChange={setShowOnMembershipPage}
                  disabled={loading}
                />
              </div>

              {/* Show copyable URL when enabled and editing existing membership */}
              {showOnMembershipPage && membership && slug && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    readOnly
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/${slug}/membership/${membership.id}`}
                    className="text-sm bg-gray-50 text-gray-600"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      const url = `${window.location.origin}/${slug}/membership/${membership.id}`
                      await navigator.clipboard.writeText(url)
                      setCopied(true)
                      toast.success("URL copied to clipboard")
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    disabled={loading}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}

              {showOnMembershipPage && !membership && (
                <p className="text-sm text-gray-500 italic">
                  Save the membership to get the shareable URL
                </p>
              )}
            </div>

            {/* Warning when both are off */}
            {!showOnBookingPage && !showOnMembershipPage && (
              <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                This membership won&apos;t be visible anywhere. Only users who already have this membership will see it.
              </p>
            )}
          </div>

          {/* Status */}
          {membership && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="isActive" className="text-base font-medium">
                    Active
                  </Label>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Inactive memberships cannot be purchased
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {membership ? "Save Changes" : "Create Membership"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
