"use client";

import { SessionDetails } from "@/components/booking/session-details";
import { CheckCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/components/booking/price-display";
import SignUpPanel from "./SignUpPanel";

interface ConfirmationClientProps {
  session: any;
  startTime: Date | string;
  signUpInitialValues: {
    emailAddress?: string;
    firstName?: string;
    lastName?: string;
  };
  bookingDetails?: {
    number_of_spots?: number;
    amount_paid?: number | null;
  };
  slug: string;
}

export default function ConfirmationClient({
  session,
  startTime,
  signUpInitialValues,
  bookingDetails,
  slug,
}: ConfirmationClientProps) {
  // Ensure startTime is a Date or undefined
  const parsedStartTime =
    typeof startTime === "string"
      ? new Date(startTime)
      : startTime;

  const hasInstructions = session?.booking_instructions;
  const amountPaid = bookingDetails?.amount_paid;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Left: Booking Details */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-7 w-7 text-green-500" />
            <span className="text-lg font-semibold text-green-700">
              Booking Confirmed!
            </span>
          </div>
          <SessionDetails session={session} startTime={parsedStartTime || undefined} />

          {/* Payment Summary */}
          {amountPaid && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span className="text-lg font-semibold">
                    {formatPrice(amountPaid)}
                  </span>
                </div>
                {bookingDetails?.number_of_spots && bookingDetails.number_of_spots > 1 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    for {bookingDetails.number_of_spots} spots
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Booking Instructions */}
          {hasInstructions && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-600" />
                  Important Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap text-sm">{session.booking_instructions}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Clerk SignUp + Benefits */}
        <div className="flex flex-col items-center justify-center h-full w-full">
          <SignUpPanel initialValues={signUpInitialValues} slug={slug} />
        </div>
      </div>
    </div>
  );
} 