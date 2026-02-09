"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { EmbeddedCheckoutWrapper } from "./embedded-checkout"

interface CheckoutStepProps {
  clientSecret: string
  connectedAccountId?: string
  onBack: () => void
}

export function CheckoutStep({ clientSecret, connectedAccountId, onBack }: CheckoutStepProps) {
  return (
    <Card className="border-0 shadow-none p-0">
      <CardContent className="">

        {/* Stripe Embedded Checkout */}
        <EmbeddedCheckoutWrapper
          clientSecret={clientSecret}
          connectedAccountId={connectedAccountId}
        />
      </CardContent>
    </Card>
  )
}
