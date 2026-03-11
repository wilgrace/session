"use client"

import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { createOrganization } from "@/app/actions/user";
import { updateOrganisation, deleteOrganisation } from "@/app/actions/organisations";
import { checkSlugAvailability } from "@/app/actions/organization";
import type { OrgRow } from "@/app/actions/organisations";

interface OrganisationFormProps {
  open: boolean;
  onClose: () => void;
  org: OrgRow | null;
  onSuccess: () => void;
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function OrganisationForm({ open, onClose, org, onSuccess }: OrganisationFormProps) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(org?.name ?? "");
      setShortName(org?.shortName ?? "");
      setSlug(org?.slug ?? "");
      setSlugStatus("idle");
      setFieldErrors({});
    }
  }, [open, org]);

  // Auto-generate slug from name (create mode only)
  useEffect(() => {
    if (!org && name) {
      const generated = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 50);
      setSlug(generated);
    }
  }, [name, org]);

  const checkSlug = useCallback(
    async (value: string) => {
      if (!value) { setSlugStatus("idle"); return; }
      const slugRegex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
      if (!slugRegex.test(value)) { setSlugStatus("invalid"); return; }
      // Skip check if unchanged in edit mode
      if (org && value === org.slug) { setSlugStatus("available"); return; }
      setSlugStatus("checking");
      const { available } = await checkSlugAvailability(value, org?.id);
      setSlugStatus(available ? "available" : "taken");
    },
    [org]
  );

  useEffect(() => {
    const timeout = setTimeout(() => checkSlug(slug), 400);
    return () => clearTimeout(timeout);
  }, [slug, checkSlug]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required";
    if (!slug.trim()) errors.slug = "Slug is required";
    if (slugStatus === "taken") errors.slug = "This slug is already taken";
    if (slugStatus === "invalid") errors.slug = "Invalid slug format";
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setLoading(true);
    let result: { success: boolean; error?: string };

    if (org) {
      result = await updateOrganisation({ id: org.id, name: name.trim(), shortName: shortName.trim() || null, slug: slug.trim() });
    } else {
      const createResult = await createOrganization({ name: name.trim(), slug: slug.trim() });
      result = { success: createResult.success, error: createResult.error };
    }

    setLoading(false);
    if (result.success) {
      onSuccess();
      onClose();
    } else {
      toast.error(result.error ?? "Failed to save organisation");
    }
  };

  const handleDelete = async () => {
    if (!org) return;
    setLoading(true);
    const { error } = await deleteOrganisation(org.id);
    setLoading(false);
    if (!error) {
      onSuccess();
      onClose();
    } else {
      toast.error(error ?? "Failed to delete organisation");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-md overflow-y-auto p-0">
        <div className="sticky top-0 bg-white z-20 px-6 py-4 border-b pr-12">
          <SheetHeader>
            <SheetTitle className="text-xl">{org ? "Edit Organisation" : "New Organisation"}</SheetTitle>
            <SheetDescription>
              {org ? "Update organisation details." : "Create a new organisation."}
            </SheetDescription>
          </SheetHeader>
        </div>

        <form onSubmit={handleSave} className="px-6 py-4 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="org-name">Name *</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldErrors(p => ({ ...p, name: "" })); }}
              placeholder="My Organisation"
              className={cn(fieldErrors.name && "border-red-500 focus-visible:ring-red-500")}
            />
            {fieldErrors.name && <p className="text-sm text-red-500">{fieldErrors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-short-name">Short Name (optional)</Label>
            <Input
              id="org-short-name"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder={name || "My Org"}
              maxLength={12}
            />
            <p className="text-sm text-gray-500">Shown on the home screen when users install the app (max 12 chars).</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-slug">Booking URL *</Label>
            <div className="relative">
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); if (fieldErrors.slug) setFieldErrors(p => ({ ...p, slug: "" })); }}
                placeholder="my-organisation"
                className={cn(
                  "pr-8",
                  fieldErrors.slug && "border-red-500 focus-visible:ring-red-500",
                  slugStatus === "available" && "border-green-500 focus-visible:ring-green-500",
                  slugStatus === "taken" && "border-red-500 focus-visible:ring-red-500"
                )}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                {slugStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                {slugStatus === "available" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {(slugStatus === "taken" || slugStatus === "invalid") && <XCircle className="h-4 w-4 text-red-500" />}
              </div>
            </div>
            {slugStatus === "available" && !fieldErrors.slug && (
              <p className="text-sm text-green-600">/{slug} is available</p>
            )}
            {slugStatus === "taken" && <p className="text-sm text-red-500">This slug is already taken</p>}
            {slugStatus === "invalid" && <p className="text-sm text-red-500">Use lowercase letters, numbers, and hyphens (3–50 chars)</p>}
            {fieldErrors.slug && slugStatus !== "taken" && slugStatus !== "invalid" && (
              <p className="text-sm text-red-500">{fieldErrors.slug}</p>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t px-6 py-4 -mx-6 -mb-4">
            <div className="flex justify-between w-full">
              {org && (
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" type="button" disabled={loading}>
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete organisation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete <strong>{org.name}</strong> and all associated
                        sessions, bookings, and users. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete Organisation
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <div className="ml-auto">
                <Button type="submit" disabled={loading || slugStatus === "taken" || slugStatus === "invalid" || slugStatus === "checking"}>
                  {loading ? "Saving..." : org ? "Save Changes" : "Create Organisation"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
