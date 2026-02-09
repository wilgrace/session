"use client"

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Profile } from "@/types/profile";
import { createClient } from "@supabase/supabase-js";
import { updateClerkUser, deleteClerkUser, createClerkUser } from "@/app/actions/clerk";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@clerk/nextjs";
import { ROLES, DB_ROLES } from "@/lib/auth-utils";
import { Protect } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface UserFormProps {
  open: boolean;
  onClose: () => void;
  user: Profile | null;
  onSuccess: () => void;
}

export function UserForm({ open, onClose, user, onSuccess }: UserFormProps) {
  const [form, setForm] = useState<Partial<Profile>>({});
  const [loading, setLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { user: currentUser } = useUser();

  // Inline validation
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next });
    }
  };

  // Define available roles based on current user's role
  const isSuperAdmin = currentUser?.organizationMemberships?.[0]?.role === ROLES.SUPER_ADMIN;
  const availableRoles = isSuperAdmin
    ? [
        { value: DB_ROLES.SUPER_ADMIN, label: "Super Admin" },
        { value: DB_ROLES.ADMIN, label: "Admin" },
        { value: DB_ROLES.USER, label: "User" }
      ]
    : [
        { value: DB_ROLES.ADMIN, label: "Admin" },
        { value: DB_ROLES.USER, label: "User" }
      ];

  useEffect(() => {
    if (user) {
      setForm({ ...user });
      setFieldErrors({});
    } else {
      setForm({
        email: "",
        first_name: "",
        last_name: "",
        organization_id: "",
        date_of_birth: "",
        gender: "",
        ethnicity: "",
        home_postal_code: "",
        role: DB_ROLES.USER
      });
      setFieldErrors({});
    }
  }, [user]);

  const handleChange = (field: keyof Profile, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    clearError(field);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (!form.email?.trim()) errors.email = "Email is required";
    if (!user && !form.clerk_user_id?.trim()) errors.clerk_user_id = "Clerk User ID is required";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0];
      document.getElementById(firstKey)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setFieldErrors({});

    setLoading(true);
    let result;
    if (user && user.id) {
      // Update via server action
      const { error } = await updateClerkUser(user.id, {
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        organization_id: form.organization_id,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        ethnicity: form.ethnicity || null,
        home_postal_code: form.home_postal_code || null,
        clerk_user_id: form.clerk_user_id || undefined,
        role: form.role
      });
      result = { error };
    } else {
      // Create via server action
      const { success, error } = await createClerkUser({
        email: form.email!,
        first_name: form.first_name || undefined,
        last_name: form.last_name || undefined,
        organization_id: form.organization_id || undefined,
        date_of_birth: form.date_of_birth || undefined,
        gender: form.gender || undefined,
        ethnicity: form.ethnicity || undefined,
        home_postal_code: form.home_postal_code || undefined,
        clerk_user_id: form.clerk_user_id || undefined,
        role: form.role
      } as any);
      result = { error: error || (success ? undefined : 'Unknown error') };
    }
    setLoading(false);
    if (!result.error) {
      onSuccess();
      onClose();
    } else {
      toast.error(result.error || "Failed to save user");
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    setLoading(true);
    // Delete via server action
    const { error } = await deleteClerkUser(user.id);
    setLoading(false);
    if (!error) {
      onSuccess();
      onClose();
    } else {
      toast.error(error || "Failed to delete user");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-md overflow-y-auto p-0">
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b">
          <SheetHeader>
            <SheetTitle className="text-xl">{user ? "Edit User" : "New User"}</SheetTitle>
            <SheetDescription>
              {user ? "Edit user details." : "Create a new user."}
            </SheetDescription>
          </SheetHeader>
        </div>
        <form onSubmit={handleSave} className="px-6 py-4 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              value={form.first_name || ""}
              onChange={(e) => handleChange("first_name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              value={form.last_name || ""}
              onChange={(e) => handleChange("last_name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={form.email || ""}
              onChange={(e) => handleChange("email", e.target.value)}
              className={cn(fieldErrors.email && "border-red-500 focus-visible:ring-red-500")}
            />
            {fieldErrors.email && <p className="text-sm text-red-500">{fieldErrors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization_id">Organization ID</Label>
            <Input
              id="organization_id"
              value={form.organization_id || ""}
              onChange={(e) => handleChange("organization_id", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_of_birth">Date of Birth</Label>
            <Input
              id="date_of_birth"
              type="date"
              value={form.date_of_birth || ""}
              onChange={(e) => handleChange("date_of_birth", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <Input
              id="gender"
              value={form.gender || ""}
              onChange={(e) => handleChange("gender", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ethnicity">Ethnicity</Label>
            <Input
              id="ethnicity"
              value={form.ethnicity || ""}
              onChange={(e) => handleChange("ethnicity", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="home_postal_code">Home Postal Code</Label>
            <Input
              id="home_postal_code"
              value={form.home_postal_code || ""}
              onChange={(e) => handleChange("home_postal_code", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clerk_user_id">Clerk User ID {!user && "*"}</Label>
            <Input
              id="clerk_user_id"
              value={form.clerk_user_id || ""}
              onChange={(e) => handleChange("clerk_user_id", e.target.value)}
              disabled={!!user}
              className={cn(fieldErrors.clerk_user_id && "border-red-500 focus-visible:ring-red-500")}
            />
            {fieldErrors.clerk_user_id && <p className="text-sm text-red-500">{fieldErrors.clerk_user_id}</p>}
          </div>
          <Protect
            role={ROLES.SUPER_ADMIN}
            fallback={
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={form.role || DB_ROLES.USER}
                  onValueChange={(value) => handleChange("role", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      { value: DB_ROLES.ADMIN, label: "Admin" },
                      { value: DB_ROLES.USER, label: "User" }
                    ].map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          >
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={form.role || DB_ROLES.USER}
                onValueChange={(value) => handleChange("role", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Protect>
          <div className="sticky bottom-0 bg-white border-t px-6 py-4 -mx-6 -mb-4">
            <div className="flex justify-between w-full">
              {user && (
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" type="button">
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the user and all associated data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <div className="ml-auto">
                <Button type="submit" className="bg-primary" disabled={loading}>
                  {loading ? "Saving..." : user ? "Save Changes" : "Create User"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
} 