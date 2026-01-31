"use client"

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Profile } from "@/types/profile";
import { UserForm } from "@/components/admin/user-form";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { deleteClerkUser } from "@/app/actions/clerk";

interface UsersPageProps {
  initialUsers: Profile[];
}

export function UsersPage({ initialUsers }: UsersPageProps) {
  const [users, setUsers] = useState(initialUsers);
  const [showUserForm, setShowUserForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null);

  const handleEdit = (user: Profile) => {
    setSelectedUser(user);
    setShowUserForm(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    const { error } = await deleteClerkUser(userToDelete.id);
    if (!error) {
      setUsers(users.filter(user => user.id !== userToDelete.id));
      setShowDeleteDialog(false);
      setUserToDelete(null);
    } else {
      alert("Error deleting user: " + error);
    }
  };

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      {!users || users.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No users found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email address</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow 
                    key={user.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      // Don't trigger if clicking on the action buttons
                      if ((e.target as HTMLElement).closest('button')) {
                        return;
                      }
                      handleEdit(user);
                    }}
                  >
                    <TableCell className="font-medium">{[user.first_name, user.last_name].filter(Boolean).join(" ")}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {user.roleLabel || 'User'}
                        {user.isMember && (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                            Member
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive/90 hover:bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUserToDelete(user);
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
                            handleEdit(user);
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
        </div>
      )}

      <UserForm
        open={showUserForm}
        onClose={() => {
          setShowUserForm(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onSuccess={() => {
          // Refresh the page to get new data
          window.location.reload();
        }}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user
              {userToDelete && ` ${[userToDelete.first_name, userToDelete.last_name].filter(Boolean).join(" ")}`}
              and all associated data.
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
    </div>
  );
} 