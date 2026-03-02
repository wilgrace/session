"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Sheet, SheetContent, SheetClose, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"
import { inviteUser } from "@/app/actions/clerk"
import { DB_ROLES, ROLES } from "@/lib/auth-utils"
import { useUser } from "@clerk/nextjs"
import { cn } from "@/lib/utils"

interface InviteUserSheetProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

type Mode = "invite" | "password"

export function InviteUserSheet({ open, onClose, onSuccess }: InviteUserSheetProps) {
  const { user: currentUser } = useUser()
  const isSuperAdmin = currentUser?.organizationMemberships?.[0]?.role === ROLES.SUPER_ADMIN

  const availableRoles = isSuperAdmin
    ? [
        { value: DB_ROLES.SUPER_ADMIN, label: "Super Admin" },
        { value: DB_ROLES.ADMIN, label: "Admin" },
        { value: DB_ROLES.USER, label: "User" },
      ]
    : [
        { value: DB_ROLES.ADMIN, label: "Admin" },
        { value: DB_ROLES.USER, label: "User" },
      ]

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<string>(DB_ROLES.USER)
  const [mode, setMode] = useState<Mode>("invite")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const clearError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next })
    }
  }

  const reset = () => {
    setFirstName("")
    setLastName("")
    setEmail("")
    setRole(DB_ROLES.USER)
    setMode("invite")
    setPassword("")
    setShowPassword(false)
    setFieldErrors({})
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!email.trim()) errors.email = "Email is required"
    if (mode === "password") {
      if (!password) errors.password = "Password is required"
      else if (password.length < 8) errors.password = "Password must be at least 8 characters"
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    setLoading(true)
    const result = await inviteUser({
      email: email.trim(),
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      role,
      mode,
      password: mode === "password" ? password : undefined,
    })
    setLoading(false)

    if (result.success) {
      toast.success(mode === "invite" ? "Invite sent" : "User created")
      reset()
      onSuccess()
      onClose()
    } else {
      toast.error(result.error || "Something went wrong")
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-md overflow-y-auto p-0">
        <div className="sticky top-0 bg-white z-20 px-6 py-4 border-b flex items-start justify-between pr-12">
          <SheetHeader>
            <SheetTitle className="text-xl">Add User</SheetTitle>
            <SheetDescription>
              {mode === "invite"
                ? "Send an invite email — the user sets their own password."
                : "Create an account and set a password on their behalf."}
            </SheetDescription>
          </SheetHeader>
          <SheetClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5">
          {/* Mode toggle */}
          <div className="space-y-2">
            <Label>Account setup</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="invite" id="mode-invite" />
                <Label htmlFor="mode-invite" className="font-normal cursor-pointer">Send invite email</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="password" id="mode-password" />
                <Label htmlFor="mode-password" className="font-normal cursor-pointer">Set password</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Name fields */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError("email") }}
              autoComplete="off"
              className={cn(fieldErrors.email && "border-red-500 focus-visible:ring-red-500")}
            />
            {fieldErrors.email && <p className="text-sm text-red-500">{fieldErrors.email}</p>}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Password (conditional) */}
          {mode === "password" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError("password") }}
                  autoComplete="new-password"
                  className={cn("pr-10", fieldErrors.password && "border-red-500 focus-visible:ring-red-500")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && <p className="text-sm text-red-500">{fieldErrors.password}</p>}
            </div>
          )}

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t pt-4 pb-2 -mx-6 px-6 -mb-4">
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : mode === "invite" ? "Send Invite" : "Create User"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
