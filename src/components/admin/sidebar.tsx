"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { CalendarCheck, CalendarDays, Users, CreditCard, Settings, ExternalLink, Menu, ChevronDown, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserButtonSection } from "./user-button-section"
import { getCurrentUserOrganizations } from "@/app/actions/user"
import type { UserOrgAssignment } from "@/lib/tenant-utils"

interface SidebarProps {
  slug: string
}

export function Sidebar({ slug }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [userOrgs, setUserOrgs] = useState<UserOrgAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch user's organization assignments from Supabase
  useEffect(() => {
    async function fetchOrgs() {
      setIsLoading(true)
      try {
        const result = await getCurrentUserOrganizations()
        if (result.success && result.data) {
          setUserOrgs(result.data)
        }
      } catch (error) {
        console.error('Failed to fetch organizations:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchOrgs()
  }, [])

  const navItems = [
    { href: `/${slug}/admin`, icon: CalendarCheck, label: "Bookings" },
    { href: `/${slug}/admin/sessions`, icon: CalendarDays, label: "Sessions" },
    { href: `/${slug}/admin/users`, icon: Users, label: "Users" },
    { href: `/${slug}/admin/billing`, icon: CreditCard, label: "Billing" },
    { href: `/${slug}/admin/settings`, icon: Settings, label: "Settings" },
  ]

  // Find current org from assignments
  const currentOrg = userOrgs.find(a => a.organization.slug === slug)
  const hasMultipleOrgs = userOrgs.length > 1

  // Navigate to a different org's admin
  const handleOrgSwitch = (newSlug: string) => {
    router.push(`/${newSlug}/admin`)
  }

  const OrgPicker = () => {
    if (isLoading) {
      return (
        <div className="px-3 py-2">
          <div className="h-9 bg-gray-100 rounded-md animate-pulse" />
        </div>
      )
    }

    if (!currentOrg) {
      return (
        <div className="flex items-center px-3 py-2 text-sm font-medium text-gray-500">
          <span className="truncate">Unknown Organization</span>
        </div>
      )
    }

    if (hasMultipleOrgs) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md text-gray-900 hover:bg-gray-50 transition-colors">
              <div className="flex items-center min-w-0">
                <span className="truncate">{currentOrg.organization.name}</span>
              </div>
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {userOrgs.map((assignment) => (
              <DropdownMenuItem
                key={assignment.organizationId}
                onClick={() => handleOrgSwitch(assignment.organization.slug)}
                className={cn(
                  "cursor-pointer flex items-center justify-between pt-4 pb-4",
                  assignment.organization.slug === slug && "bg-gray-100"
                )}
              >
                <div className="flex items-center">
                  <span>{assignment.organization.name}</span>
                </div>
                {assignment.role === 'superadmin' && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    <Shield className="h-3 w-3" />
                  </span>
                )}
                {assignment.role === 'admin' && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    Admin
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }

    return (
      <div className="flex items-center px-3 py-2 text-sm font-medium text-gray-900">        <span className="truncate">{currentOrg.organization.name}</span>
      </div>
    )
  }

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Org Picker at top */}
      <div className=" py-3 px-2 h-75">
        <OrgPicker />
      </div>

      <div className="flex flex-col flex-1 py-4">
        <nav className="space-y-2 px-2">
          {navItems.map((item) => {
            const isActive = item.href === `/${slug}/admin`
              ? pathname === `/${slug}/admin` || pathname === `/${slug}/admin/home`
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md",
                  isActive
                    ? "bg-gray-100 text-primary"
                    : "text-gray-800 hover:bg-gray-50 hover:text-gray-900",
                )}
              >
                <item.icon className="mr-3 h-5 w-5 opacity-50" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Bottom section with Booking Page link and User Avatar */}
      <div className="border-t border-gray-200">
        <div className="p-4 pb-2 border-b border-gray-200">
          <Link
            href={`/${slug}`}
            onClick={onNavigate}
            className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-primary hover:bg-primary/10"
          >
            <ExternalLink className="mr-3 h-5 w-5" />
            Booking Page
          </Link>
        </div>
        <UserButtonSection />
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar - Fixed position */}
      <div className="hidden md:block md:w-64 md:flex-shrink-0">
        <div className="fixed top-0 left-0 h-screen w-64 flex flex-col border-r border-gray-200 bg-gray-50">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile Sidebar Toggle */}
      <div className="md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-4 left-1 z-50"
          onClick={() => setIsMobileOpen(true)}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open sidebar</span>
        </Button>
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 [&>button:last-child]:hidden">
          <VisuallyHidden.Root>
            <SheetTitle>Navigation</SheetTitle>
          </VisuallyHidden.Root>
          <SidebarContent onNavigate={() => setIsMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
