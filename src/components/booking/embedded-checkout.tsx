"use client"

import { loadStripe } from "@stripe/stripe-js"
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
)

interface EmbeddedCheckoutWrapperProps {
  clientSecret: string
}

export function EmbeddedCheckoutWrapper({
  clientSecret,
}: EmbeddedCheckoutWrapperProps) {
  const options = { clientSecret }

  return (
    <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  )
}
