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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Loader2, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Membership, BillingPeriod } from "@/lib/db/schema"
import { createMembership, updateMembership, deleteMembership } from "@/app/actions/memberships"
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
  const [deleting, setDeleting] = useState(false)
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
  const [showOnMembershipPage, setShowOnMembershipPage] = useState(true)
  const [isActive, setIsActive] = useState(true)

  // Inline validation
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const clearError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next })
    }
  }

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
      setShowOnMembershipPage(membership.showOnMembershipPage ?? true)
      setIsActive(membership.isActive)
      setFieldErrors({})
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
      setShowOnMembershipPage(true)
      setIsActive(true)
      setFieldErrors({})
    }
  }, [membership, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Inline validation
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = "Name is required"
    if (!isFree && (!price || parseFloat(price) <= 0)) errors.price = "Price is required"
    if (
      memberPriceType === "discount" &&
      (!discountPercent || parseInt(discountPercent) <= 0 || parseInt(discountPercent) > 100)
    ) {
      errors.discountPercent = "Enter a percentage between 1 and 100"
    }
    if (memberPriceType === "fixed" && (!fixedPrice || parseFloat(fixedPrice) < 0)) {
      errors.fixedPrice = "Enter a valid fixed price"
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstKey = Object.keys(errors)[0]
      document.getElementById(firstKey)?.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    setFieldErrors({})

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

  async function handleDelete() {
    if (!membership) return
    setDeleting(true)

    const result = await deleteMembership(membership.id)

    if (result.success) {
      toast.success("Membership deleted")
      onSuccess()
      onClose()
    } else {
      toast.error(result.error || "Failed to delete membership")
    }

    setDeleting(false)
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[625px] overflow-y-auto p-0">
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b">
          <SheetHeader>
            <SheetTitle className="text-xl">
              {membership ? "Edit Membership" : "Create Membership"}
            </SheetTitle>
            <SheetDescription>
              {membership
                ? "Update the membership details below."
                : "Create a new membership tier for your organization."}
            </SheetDescription>
          </SheetHeader>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => { setName(e.target.value); clearError("name") }}
                placeholder="e.g., Monthly Membership"
                disabled={loading}
                className={cn(fieldErrors.name && "border-red-500 focus-visible:ring-red-500")}
              />
              {fieldErrors.name && <p className="text-sm text-red-500">{fieldErrors.name}</p>}
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
                onCheckedChange={(v) => { setIsFree(v); if (v) clearError("price") }}
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
                        onChange={(e) => { setPrice(e.target.value); clearError("price") }}
                        className={cn("pl-7", fieldErrors.price && "border-red-500 focus-visible:ring-red-500")}
                        disabled={loading}
                      />
                    </div>
                    {fieldErrors.price && <p className="text-sm text-red-500 mt-1">{fieldErrors.price}</p>}
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
              onValueChange={(v) => { setMemberPriceType(v as "discount" | "fixed"); clearError("discountPercent"); clearError("fixedPrice") }}
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
              <div className="ml-6">
                <div className="flex items-center gap-2">
                  <Input
                    id="discountPercent"
                    type="number"
                    min="1"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => { setDiscountPercent(e.target.value); clearError("discountPercent") }}
                    className={cn("w-24", fieldErrors.discountPercent && "border-red-500 focus-visible:ring-red-500")}
                    disabled={loading}
                  />
                  <span className="text-sm text-gray-600">% off drop-in price</span>
                </div>
                {fieldErrors.discountPercent && <p className="text-sm text-red-500 mt-1">{fieldErrors.discountPercent}</p>}
              </div>
            )}

            {memberPriceType === "fixed" && (
              <div className="ml-6">
                <div className="flex items-center gap-2">
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      £
                    </span>
                    <Input
                      id="fixedPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={fixedPrice}
                      onChange={(e) => { setFixedPrice(e.target.value); clearError("fixedPrice") }}
                      className={cn("pl-7", fieldErrors.fixedPrice && "border-red-500 focus-visible:ring-red-500")}
                      disabled={loading}
                    />
                  </div>
                  <span className="text-sm text-gray-600">per session</span>
                </div>
                {fieldErrors.fixedPrice && <p className="text-sm text-red-500 mt-1">{fieldErrors.fixedPrice}</p>}
              </div>
            )}
          </div>

          {/* Signing Up */}
          <div className="space-y-4 border-t pt-4">
            <div>
              <Label className="text-base font-medium">Signing Up</Label>
            </div>

            {/* Direct link — always shown for existing memberships */}
            {membership && slug && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
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
              </div>
            )}

            {/* On the members page toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="showOnMembershipPage" className="font-normal">
                    List on the members page
                  </Label>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Show publicly on the /members listing page
                  </p>
                </div>
                <Switch
                  id="showOnMembershipPage"
                  checked={showOnMembershipPage}
                  onCheckedChange={setShowOnMembershipPage}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Warning when not visible on members page */}
            {!showOnMembershipPage && (
              <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                This membership won&apos;t be visible on the members page. Users can still sign up via a direct link.
              </p>
            )}
          </div>

          {/* Status */}
          {membership && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="isActive" className="text-base font-medium">
                    Status
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

          {/* Delete */}
          {membership && (
            <div className="space-y-3 border-t pt-4">
              <Label className="text-base font-medium text-destructive">
                Delete Membership
              </Label>
              <p className="text-sm text-gray-500">
                Existing subscribers will keep their membership until it expires
                or is cancelled. New sign-ups will no longer be available.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className="text-destructive border-destructive hover:bg-destructive/10"
                    disabled={loading || deleting}
                  >
                    {deleting && (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    )}
                    Delete Membership
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete membership?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &ldquo;{name}&rdquo;.
                      Existing subscribers will keep their membership until it
                      expires. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Sticky Footer */}
          <div className="sticky bottom-0 bg-white border-t px-6 py-4 -mx-6 -mb-4">
            <div className="flex justify-between w-full">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary">
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {membership ? "Save Changes" : "Create Membership"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
