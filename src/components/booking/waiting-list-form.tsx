"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle, Clock } from "lucide-react"
import { joinWaitingList, checkWaitingListEntry } from "@/app/actions/session"
import { cn } from "@/lib/utils"

interface WaitingListFormProps {
  sessionInstanceId: string
  sessionTemplateId: string
  organizationId: string
  sessionCapacity: number
  userEmail?: string
  userFirstName?: string
  isLoggedIn: boolean
}

type FormStatus = "idle" | "checking" | "submitting" | "joined" | "error"

export function WaitingListForm({
  sessionInstanceId,
  sessionTemplateId,
  organizationId,
  sessionCapacity,
  userEmail,
  userFirstName,
  isLoggedIn,
}: WaitingListFormProps) {
  const [email, setEmail] = useState(userEmail || "")
  const [firstName, setFirstName] = useState("")
  const [requestedSpots, setRequestedSpots] = useState(1)
  const [status, setStatus] = useState<FormStatus>("idle")
  const [position, setPosition] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  // On mount, check if the logged-in user is already on the list
  useEffect(() => {
    if (!userEmail || !sessionInstanceId) return
    setStatus("checking")
    checkWaitingListEntry(sessionInstanceId, userEmail).then((result) => {
      if (result.success && result.data) {
        setPosition(result.data.position)
        setRequestedSpots(result.data.requestedSpots)
        setStatus("joined")
      } else {
        setStatus("idle")
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionInstanceId, userEmail])

  const validateEmail = (value: string) => {
    if (!value) return "Email is required"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Please enter a valid email address"
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const effectiveEmail = isLoggedIn ? userEmail! : email
    const emailErr = validateEmail(effectiveEmail)
    if (emailErr) {
      setEmailError(emailErr)
      return
    }

    setStatus("submitting")
    setError(null)

    const result = await joinWaitingList({
      sessionInstanceId,
      sessionTemplateId,
      organizationId,
      email: effectiveEmail,
      firstName: isLoggedIn ? userFirstName : firstName || undefined,
      requestedSpots,
    })

    if (result.success && result.position != null) {
      setPosition(result.position)
      setStatus("joined")
    } else {
      setError(result.error || "Something went wrong. Please try again.")
      setStatus("error")
    }
  }

  const displayEmail = isLoggedIn ? userEmail : email
  const spotWord = requestedSpots === 1 ? "spot" : "spots"

  if (status === "checking") {
    return (
      <div className="space-y-6 pt-2">
        <div>
          <h2 className="text-xl font-semibold">This session is full</h2>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          Checking your status…
        </div>
      </div>
    )
  }

  if (status === "joined") {
    return (
      <div className="space-y-6 pt-2">
        <div>
          <h2 className="text-xl font-semibold">This session is full</h2>
        </div>
        <div className="rounded-xl bg-muted/50 p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <span className="font-semibold">You're on the waiting list</span>
          </div>
          <div className="flex items-start gap-2 text-muted-foreground text-sm">
            <Clock className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              You're{" "}
              <span className="font-medium text-foreground">
                #{position}
              </span>{" "}
              in line for {requestedSpots} {spotWord}. We'll email{" "}
              <span className="font-medium text-foreground">{displayEmail}</span>{" "}
              when {requestedSpots === 1 ? "a spot becomes" : `${requestedSpots} spots become`} available.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-2">
      <div>
        <h2 className="text-xl font-semibold">This session is full</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Join the waiting list and we'll email you if enough spots become available.
        </p>
      </div>

      {/* Spots picker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Spots needed</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => setRequestedSpots(Math.max(1, requestedSpots - 1))}
              disabled={requestedSpots <= 1}
            >
              <span className="text-lg">−</span>
            </Button>
            <span className="w-8 text-center text-xl font-bold">{requestedSpots}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => setRequestedSpots(Math.min(sessionCapacity, requestedSpots + 1))}
              disabled={requestedSpots >= sessionCapacity}
            >
              <span className="text-lg">+</span>
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          We'll only notify you when at least {requestedSpots} {spotWord}{" "}
          {requestedSpots === 1 ? "becomes" : "become"} available.
        </p>
      </div>

      {/* Guest fields */}
      {!isLoggedIn && (
        <>
          <div className="space-y-2">
            <Label htmlFor="wl-first-name" className="text-base font-semibold">
              First name <span className="text-muted-foreground font-normal text-sm">(optional)</span>
            </Label>
            <Input
              id="wl-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Alex"
              className="h-12 rounded-xl bg-muted/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-email" className="text-base font-semibold">
              Email address
            </Label>
            <Input
              id="wl-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setEmailError(null)
              }}
              onBlur={() => setEmailError(validateEmail(email))}
              placeholder="your@email.com"
              className={cn(
                "h-12 rounded-xl bg-muted/50",
                emailError && "border-destructive focus-visible:ring-destructive"
              )}
            />
            {emailError && (
              <p className="text-sm text-destructive">{emailError}</p>
            )}
          </div>
        </>
      )}

      {/* Logged-in user email (read-only) */}
      {isLoggedIn && userEmail && (
        <div className="space-y-2">
          <Label className="text-base font-semibold">Email address</Label>
          <Input
            type="email"
            value={userEmail}
            disabled
            className="h-12 rounded-xl bg-muted/50 opacity-70"
          />
        </div>
      )}

      {status === "error" && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-12 rounded-xl"
        disabled={status === "submitting" || (!isLoggedIn && !email)}
      >
        {status === "submitting" ? "Joining…" : "Join waiting list"}
      </Button>
    </form>
  )
}
