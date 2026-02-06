"use client"

import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Profile } from "@/types/profile";
import { UserForm } from "@/components/admin/user-form";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type SortDirection = "asc" | "desc" | null;
type SortColumn = "name" | "email" | "role" | null;
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
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleEdit = (user: Profile) => {
    setSelectedUser(user);
    setShowUserForm(true);
  };

  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> off
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Sort users based on current sort state
  const sortedUsers = useMemo(() => {
    if (!sortColumn || !sortDirection) return users;

    return [...users].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case "name":
          aVal = [a.first_name, a.last_name].filter(Boolean).join(" ").toLowerCase();
          bVal = [b.first_name, b.last_name].filter(Boolean).join(" ").toLowerCase();
          break;
        case "email":
          aVal = a.email?.toLowerCase() || "";
          bVal = b.email?.toLowerCase() || "";
          break;
        case "role":
          aVal = a.roleLabel?.toLowerCase() || "user";
          bVal = b.roleLabel?.toLowerCase() || "user";
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [users, sortColumn, sortDirection]);

  // Sortable column header component
  const SortableHeader = ({ column, children, className }: { column: SortColumn; children: React.ReactNode; className?: string }) => {
    const isActive = sortColumn === column;
    return (
      <TableHead
        className={`cursor-pointer select-none hover:bg-muted/50 group ${className || ""}`}
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          {children}
          {isActive && sortDirection === "asc" && <ArrowUp className="h-3 w-3" />}
          {isActive && sortDirection === "desc" && <ArrowDown className="h-3 w-3" />}
          {!isActive && <ArrowUp className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />}
        </div>
      </TableHead>
    );
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
    <div className="flex flex-col h-full">
      {!users || users.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No users found.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader column="name">Name</SortableHeader>
                <SortableHeader column="email">Email address</SortableHeader>
                <SortableHeader column="role">Role</SortableHeader>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((user) => (
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