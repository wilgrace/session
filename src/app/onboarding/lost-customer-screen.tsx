'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { OnboardingClient } from './onboarding-client';

export function LostCustomerScreen() {
  const [slug, setSlug] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const router = useRouter();

  if (showWizard) {
    return <OnboardingClient />;
  }

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = slug.trim().toLowerCase().replace(/^\/+/, '');
    if (clean) router.push(`/${clean}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Looking to book a session?</CardTitle>
          <CardDescription>
            This page is for setting up a new booking service. If you&apos;re trying to book a session,
            enter your booking link below to find the right page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGo} className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">bookasession.org/</span>
              <Input
                placeholder="your-org-name"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={!slug.trim()}>
              Go to booking page
            </Button>
          </form>

          <div className="mt-6 border-t pt-5 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              Actually setting up a new booking service?
            </p>
            <Button variant="outline" onClick={() => setShowWizard(true)}>
              Continue to setup
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
