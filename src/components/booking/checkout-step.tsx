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
      <CardContent className="p-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Checkout</h2>
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        {/* Stripe Embedded Checkout */}
        <EmbeddedCheckoutWrapper
          clientSecret={clientSecret}
          connectedAccountId={connectedAccountId}
        />
      </CardContent>
    </Card>
  )
}
