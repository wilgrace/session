"use client"

import { useEffect, useState } from "react";
import { UsersPage } from "@/components/admin/users-page";
import { Profile } from "@/types/profile";

export default function Page() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/users');
        const data = await response.json();
        if (data.error) {
          setError(data.error);
        } else {
          setUsers(data.users || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div>Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="text-red-500">Error loading users: {error}</div>
      </div>
    );
  }

  return <UsersPage initialUsers={users} />;
} 