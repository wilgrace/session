import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { checkOnboardingStatus } from '@/app/actions/onboarding';
import { OnboardingClient } from './onboarding-client';

export const metadata = {
  title: 'Set up your organisation – Session',
  description: 'Create your booking page and start taking sessions.',
};

export default async function OnboardingPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-up');
  }

  const status = await checkOnboardingStatus();

  if (status.status === 'complete' && status.slug) {
    redirect(`/${status.slug}`);
  }

  if (status.status === 'customer' && status.slug) {
    redirect(`/${status.slug}`);
  }

  return <OnboardingClient />;
}
