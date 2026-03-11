"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { usePageHeaderAction } from "@/hooks/use-page-header-action";
import { OrganisationForm } from "@/components/admin/organisation-form";
import type { OrgRow } from "@/app/actions/organisations";
import { deleteOrganisation } from "@/app/actions/organisations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrganisationsPageProps {
  initialOrganisations: OrgRow[];
}

export function OrganisationsPage({ initialOrganisations }: OrganisationsPageProps) {
  const router = useRouter();
  const [organisations, setOrganisations] = useState(initialOrganisations);
  const [showForm, setShowForm] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<OrgRow | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<OrgRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const setAction = usePageHeaderAction((s) => s.setAction);

  useEffect(() => {
    setOrganisations(initialOrganisations);
  }, [initialOrganisations]);

  useEffect(() => {
    setAction({ label: "Add Organisation", onClick: () => { setSelectedOrg(null); setShowForm(true); } });
    return () => setAction(null);
  }, [setAction]);

  const handleEdit = (org: OrgRow) => {
    setSelectedOrg(org);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!orgToDelete) return;
    setDeleting(true);
    const { error } = await deleteOrganisation(orgToDelete.id);
    setDeleting(false);
    if (!error) {
      setOrganisations((prev) => prev.filter((o) => o.id !== orgToDelete.id));
      setShowDeleteDialog(false);
      setOrgToDelete(null);
    } else {
      alert("Error deleting organisation: " + error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {organisations.length === 0 ? (
        <div className="text-center py-8 mt-8">
          <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Building2 className="h-6 w-6 text-gray-400" />
          </div>
          <h4 className="text-lg font-medium text-gray-900">No organisations yet</h4>
          <p className="text-gray-400 text-sm">Create an organisation to get started.</p>
          <Button className="mt-4" onClick={() => { setSelectedOrg(null); setShowForm(true); }}>
            + Add Organisation
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Booking Page</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organisations.map((org) => (
                <TableRow
                  key={org.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, a")) return;
                    handleEdit(org);
                  }}
                >
                  <TableCell>
                    {org.faviconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={org.faviconUrl} alt="" className="h-5 w-5 rounded object-cover" />
                    ) : org.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={org.logoUrl} alt="" className="h-5 w-5 rounded object-cover" />
                    ) : (
                      <div className="h-5 w-5 rounded bg-gray-200 flex items-center justify-center">
                        <span className="text-xs font-medium text-gray-500">
                          {org.name?.[0]?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>{org.userCount}</TableCell>
                  <TableCell>
                    <a
                      href={`/${org.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      /{org.slug}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell>
                    {org.stripeConnected ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        Connected
                      </Badge>
                    ) : (
                      <span className="text-gray-400 text-sm">No</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive/90 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOrgToDelete(org);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(org);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OrganisationForm
        open={showForm}
        onClose={() => { setShowForm(false); setSelectedOrg(null); }}
        org={selectedOrg}
        onSuccess={() => router.refresh()}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organisation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{orgToDelete?.name}</strong> and all associated sessions,
              bookings, and users. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
