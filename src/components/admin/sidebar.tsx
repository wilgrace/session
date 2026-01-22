"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { CalendarCheck, CalendarDays, Users, CreditCard, ExternalLink, Menu, X, Building2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useOrganizationList, useOrganization } from "@clerk/nextjs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserButtonSection } from "./user-button-section"

interface SidebarProps {
  slug: string
}

export function Sidebar({ slug }: SidebarProps) {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const { organization } = useOrganization()
  const { userMemberships, setActive, isLoaded } = useOrganizationList({
    userMemberships: { infinite: true }
  })

  const navItems = [
    { href: `/${slug}/admin`, icon: CalendarCheck, label: "Bookings" },
    { href: `/${slug}/admin/sessions`, icon: CalendarDays, label: "Sessions" },
    { href: `/${slug}/admin/users`, icon: Users, label: "Users" },
    { href: `/${slug}/admin/billing`, icon: CreditCard, label: "Billing" },
  ]

  const organizations = userMemberships?.data?.map(m => m.organization) ?? []
  const hasMultipleOrgs = organizations.length > 1

  const handleOrgSwitch = async (orgId: string) => {
    if (setActive) {
      await setActive({ organization: orgId })
    }
  }

  const OrgPicker = () => {
    if (!isLoaded) {
      return (
        <div className="px-3 py-2">
          <div className="h-9 bg-gray-100 rounded-md animate-pulse" />
        </div>
      )
    }

    if (!organization) {
      return null
    }

    if (hasMultipleOrgs) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md text-gray-900 hover:bg-gray-50 transition-colors">
              <div className="flex items-center min-w-0">
                <Building2 className="mr-3 h-5 w-5 flex-shrink-0 text-gray-500" />
                <span className="truncate">{organization.name}</span>
              </div>
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => handleOrgSwitch(org.id)}
                className={cn(
                  "cursor-pointer",
                  org.id === organization.id && "bg-gray-100"
                )}
              >
                <Building2 className="mr-2 h-4 w-4" />
                {org.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }

    return (
      <div className="flex items-center px-3 py-2 text-sm font-medium text-gray-900">
        <Building2 className="mr-3 h-5 w-5 text-gray-500" />
        <span className="truncate">{organization.name}</span>
      </div>
    )
  }

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Org Picker at top */}
      <div className="border-b border-gray-200 py-3 px-2">
        <OrgPicker />
      </div>

      <div className="flex flex-col flex-1 py-4">
        <nav className="space-y-1 px-2">
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
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Bottom section with Booking Page link and User Avatar */}
      <div className="border-t border-gray-200">
        <div className="p-4 pb-2">
          <Link
            href={`/${slug}`}
            onClick={onNavigate}
            className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
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
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64 border-r border-gray-200 bg-white">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile Sidebar Toggle */}
      <div className="md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 left-3 z-50"
          onClick={() => setIsMobileOpen(true)}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open sidebar</span>
        </Button>
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <Button variant="ghost" size="icon" className="absolute top-3 right-3" onClick={() => setIsMobileOpen(false)}>
            <X className="h-6 w-6" />
            <span className="sr-only">Close sidebar</span>
          </Button>
          <SidebarContent onNavigate={() => setIsMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
