"use client"

import { useMemo } from "react"
import { loadStripe } from "@stripe/stripe-js"
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js"

interface EmbeddedCheckoutWrapperProps {
  clientSecret: string
  connectedAccountId?: string // For subscriptions created on Connected Account
}

export function EmbeddedCheckoutWrapper({
  clientSecret,
  connectedAccountId,
}: EmbeddedCheckoutWrapperProps) {
  // Load Stripe with or without connected account
  // For subscriptions on Connected Account, we need to use their account
  const stripePromise = useMemo(() => {
    return loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
      connectedAccountId ? { stripeAccount: connectedAccountId } : undefined
    )
  }, [connectedAccountId])

  const options = { clientSecret }

  return (
    <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  )
}
