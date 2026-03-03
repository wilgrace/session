'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Check, AlertCircle, ChevronLeft, ChevronRight, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createOrganizationForUser } from '@/app/actions/onboarding';
import { checkSlugAvailability } from '@/app/actions/organization';

type Step = 1 | 2;

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');

  // Step 2 fields
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [headerImageUrl, setHeaderImageUrl] = useState('');
  const [defaultSessionImageUrl, setDefaultSessionImageUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#6c47ff');
  const [brandTextColor, setBrandTextColor] = useState('#ffffff');

  // Slug availability state
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  // Auto-generate slug from name (until user manually edits the slug field)
  useEffect(() => {
    if (slugTouched) return;
    const generated = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    setSlug(generated);
  }, [name, slugTouched]);

  // Debounced slug availability check
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      return;
    }
    setCheckingSlug(true);
    const timeoutId = setTimeout(async () => {
      const result = await checkSlugAvailability(slug);
      setSlugAvailable(result.available ?? false);
      setCheckingSlug(false);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [slug]);

  function validateStep1(): string | null {
    if (!name.trim() || name.trim().length < 2) {
      return 'Organisation name must be at least 2 characters.';
    }
    if (!slug || slug.length < 3) {
      return 'Booking URL must be at least 3 characters.';
    }
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
      return 'Booking URL can only contain lowercase letters, numbers, and hyphens.';
    }
    if (slugAvailable === false) {
      return 'This booking URL is already taken. Please choose another.';
    }
    if (checkingSlug) {
      return 'Please wait while we check the booking URL availability.';
    }
    if (homepageUrl && !isValidUrl(homepageUrl)) {
      return 'Homepage must be a valid URL (e.g. https://example.com).';
    }
    if (instagramUrl && !isValidUrl(instagramUrl)) {
      return 'Instagram URL must be a valid URL.';
    }
    if (facebookUrl && !isValidUrl(facebookUrl)) {
      return 'Facebook URL must be a valid URL.';
    }
    return null;
  }

  function handleNextStep() {
    const validationError = validateStep1();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(skipBranding = false) {
    setSubmitting(true);
    setError(null);

    const result = await createOrganizationForUser({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      homepageUrl: homepageUrl.trim() || undefined,
      instagramUrl: instagramUrl.trim() || undefined,
      facebookUrl: facebookUrl.trim() || undefined,
      ...(skipBranding
        ? {}
        : {
            logoUrl: logoUrl.trim() || undefined,
            faviconUrl: faviconUrl.trim() || undefined,
            headerImageUrl: headerImageUrl.trim() || undefined,
            defaultSessionImageUrl: defaultSessionImageUrl.trim() || undefined,
            brandColor: brandColor || undefined,
            brandTextColor: brandTextColor || undefined,
          }),
    });

    if (!result.success || !result.slug) {
      setError(result.error || 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    // Use router.push rather than redirect() — middleware has a 1-min cache of
    // slug=null for this user, but client-side navigation bypasses that check.
    router.push(`/${result.slug}`);
  }

  return (
    <div className="min-h-screen flex items-start justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <StepDot active={step === 1} complete={step > 1} label="1" />
          <div className="h-px w-8 bg-gray-300" />
          <StepDot active={step === 2} complete={false} label="2" />
        </div>

        <Card>
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle>Set up your company</CardTitle>
                <CardDescription>
                  You can update all of this later from the settings page.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5 p-6 pt-0">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Organisation name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. The Sauna Club"
                    autoFocus
                  />
                </div>

                {/* Booking URL / slug */}
                <div className="space-y-1.5">
                  <Label htmlFor="slug">
                    Booking URL <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-center gap-0">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 h-10 whitespace-nowrap shrink-0">
                      bookasession.org/
                    </span>
                    <div className="flex-1 relative">
                      <Input
                        id="slug"
                        value={slug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                        }}
                        placeholder="my-organisation"
                        className="rounded-l-none pr-10"
                      />
                      {checkingSlug && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                      )}
                      {!checkingSlug && slugAvailable === true && (
                        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                      )}
                      {!checkingSlug && slugAvailable === false && (
                        <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                  {slugAvailable === false && (
                    <p className="text-xs text-red-600">This URL is already taken.</p>
                  )}
                  {slugAvailable === true && (
                    <p className="text-xs text-green-600">Available!</p>
                  )}
                  <p className="text-xs text-gray-500">
                    This is where you'll send your customers to book sessions.
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description <span className="text-gray-400">(optional)</span></Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell customers a bit about what you offer"
                    rows={3}
                  />
                </div>

                {/* Homepage */}
                <div className="space-y-1.5">
                  <Label htmlFor="homepageUrl">Homepage <span className="text-gray-400">(optional)</span></Label>
                  <Input
                    id="homepageUrl"
                    type="url"
                    value={homepageUrl}
                    onChange={(e) => setHomepageUrl(e.target.value)}
                    placeholder="https://www.example.com"
                  />
                  <p className="text-xs text-gray-500">
                    If provided, a link back to your website will be shown on your booking page.
                  </p>
                </div>

                {/* Social links */}
                <div className="space-y-2">
                  <Label>Social links <span className="text-gray-400">(optional)</span></Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <InstagramIcon />
                        <span className="text-sm text-gray-600">Instagram</span>
                      </div>
                      <Input
                        type="url"
                        value={instagramUrl}
                        onChange={(e) => setInstagramUrl(e.target.value)}
                        placeholder="https://instagram.com/..."
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FacebookIcon />
                        <span className="text-sm text-gray-600">Facebook</span>
                      </div>
                      <Input
                        type="url"
                        value={facebookUrl}
                        onChange={(e) => setFacebookUrl(e.target.value)}
                        placeholder="https://facebook.com/..."
                      />
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex items-center justify-between pt-4 border-t">
                <a
                  href="/sign-up"
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Back to sign up
                </a>
                <Button onClick={handleNextStep}>
                  Continue
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              </CardFooter>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle>Design your booking page</CardTitle>
                <CardDescription>
                  
                  Or skip this step and set up branding later.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5  p-6 pt-0">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Images */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <OnboardingImageUpload
                    label="Logo"
                    value={logoUrl}
                    onChange={setLogoUrl}
                    aspectRatio="square"
                    description="In your booking page header."
                  />
                  <OnboardingImageUpload
                    label="Icon"
                    value={faviconUrl}
                    onChange={setFaviconUrl}
                    aspectRatio="square"
                    description="In the browser tab and app icon."
                  />
                </div>
                <OnboardingImageUpload
                  label="Header image"
                  value={headerImageUrl}
                  onChange={setHeaderImageUrl}
                  aspectRatio="banner"
                  description="A wide image displayed at the top of your booking page."
                />
                <OnboardingImageUpload
                  label="Main image"
                  value={defaultSessionImageUrl}
                  onChange={setDefaultSessionImageUrl}
                  aspectRatio="standard"
                  description="Your best image, used on sessions and socials ."
                />

                {/* Brand colours */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="brandColor">Brand colour</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        id="brandColor"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
                      />
                      <Input
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        placeholder="#6c47ff"
                        className="flex-1 font-mono"
                      />
                    </div>
                    <p className="text-xs text-gray-500">Dark colour for buttons & links</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brandTextColor">Button text colour</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        id="brandTextColor"
                        value={brandTextColor}
                        onChange={(e) => setBrandTextColor(e.target.value)}
                        className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
                      />
                      <Input
                        value={brandTextColor}
                        onChange={(e) => setBrandTextColor(e.target.value)}
                        placeholder="#ffffff"
                        className="flex-1 font-mono"
                      />
                    </div>
                    <p className="text-xs text-gray-500">Light colour, usually white.</p>
                  </div>
                </div>

              </CardContent>

              <CardFooter className="flex items-center justify-between pt-4 border-t gap-2">
                <Button
                  variant="ghost"
                  onClick={() => { setError(null); setStep(1); window.scrollTo({ top: 0 }); }}
                  disabled={submitting}
                >
                  <ChevronLeft className="mr-1.5 h-4 w-4" />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleSubmit(true)}
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Skip for now'}
                  </Button>
                  <Button onClick={() => handleSubmit(false)} disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Setting up…
                      </>
                    ) : (
                      'Complete setup'
                    )}
                  </Button>
                </div>
              </CardFooter>
            </>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-gray-500">
          Step {step} of 2
        </p>
      </div>
    </div>
  );
}

function StepDot({ active, complete, label }: { active: boolean; complete: boolean; label: string }) {
  return (
    <div
      className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
        complete
          ? 'bg-green-500 text-white'
          : active
          ? 'bg-primary text-primary-foreground'
          : 'bg-gray-200 text-gray-500'
      }`}
    >
      {complete ? <Check className="h-4 w-4" /> : label}
    </div>
  );
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

interface OnboardingImageUploadProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  aspectRatio: 'square' | 'banner' | 'standard';
  description: string;
}

function OnboardingImageUpload({ label, value, onChange, aspectRatio, description }: OnboardingImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aspectRatioClasses = {
    square: 'aspect-square w-24',
    banner: 'aspect-[16/3] w-full max-w-lg',
    standard: 'aspect-[4/3] w-48',
  };

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/onboarding', { method: 'POST', body: formData });
      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Upload failed');
        return;
      }

      if (result.url) onChange(result.url);
    } catch {
      setError('Failed to upload image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-sm text-gray-500">{description}</p>

      {value ? (
        <div className="relative inline-block">
          <div className={cn('relative rounded-lg overflow-hidden border bg-gray-50', aspectRatioClasses[aspectRatio])}>
            <Image src={value} alt={label} fill className="object-cover" sizes="(max-width: 768px) 100vw, 400px" />
          </div>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6"
            onClick={() => { onChange(''); setError(null); }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
            'hover:border-primary hover:bg-primary/5',
            isUploading && 'opacity-50 cursor-not-allowed',
            aspectRatioClasses[aspectRatio],
            'flex flex-col items-center justify-center',
          )}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          <Upload className="h-6 w-6 text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">{isUploading ? 'Uploading…' : 'Click to upload'}</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
