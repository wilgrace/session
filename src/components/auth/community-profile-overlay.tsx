"use client"

import { useState } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { updateCurrentUserProfile } from "@/app/actions/user"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Loader2, Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CommunityProfileOverlayProps {
  isOpen: boolean
  onComplete: () => void
  onSkip: () => void
}

// Gender options
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "other", label: "Other" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
]

// Ethnicity options (UK Census categories)
const ETHNICITY_OPTIONS = [
  // White
  { value: "white-british", label: "White - English, Welsh, Scottish, Northern Irish or British" },
  { value: "white-irish", label: "White - Irish" },
  { value: "white-gypsy", label: "White - Gypsy or Irish Traveller" },
  { value: "white-other", label: "White - Any other White background" },
  // Mixed/Multiple ethnic groups
  { value: "mixed-white-black-caribbean", label: "Mixed - White and Black Caribbean" },
  { value: "mixed-white-black-african", label: "Mixed - White and Black African" },
  { value: "mixed-white-asian", label: "Mixed - White and Asian" },
  { value: "mixed-other", label: "Mixed - Any other Mixed or Multiple background" },
  // Asian/Asian British
  { value: "asian-indian", label: "Asian - Indian" },
  { value: "asian-pakistani", label: "Asian - Pakistani" },
  { value: "asian-bangladeshi", label: "Asian - Bangladeshi" },
  { value: "asian-chinese", label: "Asian - Chinese" },
  { value: "asian-other", label: "Asian - Any other Asian background" },
  // Black/African/Caribbean/Black British
  { value: "black-african", label: "Black - African" },
  { value: "black-caribbean", label: "Black - Caribbean" },
  { value: "black-other", label: "Black - Any other Black background" },
  // Other ethnic group
  { value: "other-arab", label: "Other - Arab" },
  { value: "other-any", label: "Other - Any other ethnic group" },
  // Prefer not to say
  { value: "prefer-not-to-say", label: "Prefer not to say" },
]

// Work situation options
const WORK_SITUATION_OPTIONS = [
  { value: "full-time", label: "Full-time employed" },
  { value: "part-time", label: "Part-time employed" },
  { value: "student", label: "Student" },
  { value: "self-employed", label: "Self-employed" },
  { value: "looking-for-work", label: "Looking for work" },
  { value: "caregiver", label: "Caregiver / Home-maker" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
]

// Housing situation options
const HOUSING_SITUATION_OPTIONS = [
  { value: "renting", label: "Renting" },
  { value: "homeowner-mortgage", label: "Homeowner with mortgage" },
  { value: "homeowner-outright", label: "Homeowner outright" },
  { value: "social-housing", label: "Social / Subsidized housing" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
]

// Cardiff neighbourhoods
const CARDIFF_NEIGHBOURHOODS = [
  // South & Central
  "Adamsdown",
  "Butetown & Cardiff Bay",
  "Canton",
  "Cathays",
  "City Centre",
  "Grangetown",
  "Plasnewydd",
  "Pontcanna",
  "Riverside",
  "Roath",
  "Splott",
  "Tremorfa",
  // North & West
  "Birchgrove",
  "Coryton",
  "Gabalfa",
  "Heath",
  "Lisvane",
  "Llandaff",
  "Llandaff North",
  "Llanishen",
  "Radyr and Morganstown",
  "Rhiwbina",
  "Thornhill",
  "Tongwynlais",
  "Whitchurch",
  // East
  "Cardiff Gate",
  "Llanedeyrn",
  "Llanrumney",
  "Pentwyn",
  "Penylan",
  "Pontprennau",
  "Rumney",
  "St Mellons (including Old St Mellons)",
  "Trowbridge",
]

export function CommunityProfileOverlay({
  isOpen,
  onComplete,
  onSkip,
}: CommunityProfileOverlayProps) {
  const isMobile = useIsMobile()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [birthYear, setBirthYear] = useState<string>("")
  const [gender, setGender] = useState<string>("")
  const [ethnicity, setEthnicity] = useState<string>("")
  const [workSituation, setWorkSituation] = useState<string>("")
  const [housingSituation, setHousingSituation] = useState<string>("")
  const [livesInCardiff, setLivesInCardiff] = useState<boolean | null>(null)
  const [cardiffNeighbourhood, setCardiffNeighbourhood] = useState<string>("")
  const [neighbourhoodOpen, setNeighbourhoodOpen] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)

    try {
      await updateCurrentUserProfile({
        birthYear: birthYear ? parseInt(birthYear, 10) : null,
        gender: gender || null,
        ethnicity: ethnicity || null,
        workSituation: workSituation || null,
        housingSituation: housingSituation || null,
        livesInCardiff: livesInCardiff,
        cardiffNeighbourhood: livesInCardiff ? (cardiffNeighbourhood || null) : null,
      })
      onComplete()
    } catch (error) {
      console.error("Failed to update profile:", error)
      // Still complete even on error - this is optional data
      onComplete()
    } finally {
      setIsSubmitting(false)
    }
  }

  const content = (
    <div className="space-y-6">
      {/* Optional badge and skip button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium bg-muted px-2 py-1 rounded-full text-muted-foreground">
          Optional
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={isSubmitting}
        >
          Skip
        </Button>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          Help us understand our community
        </h2>
        <p className="text-sm text-muted-foreground">
          We ask a few optional questions to help make sessions more inclusive and reach underserved communities.
        </p>
      </div>

      {/* Form fields */}
      <div className="space-y-4">

        {/* Location Section */}
        <div className="space-y-4">
          {/* Cardiff Yes/No */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Do you live in Cardiff?
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={livesInCardiff === true ? "default" : "outline"}
                className={cn(
                  "flex-1 h-10 rounded-xl",
                  livesInCardiff === true && "bg-primary text-primary-foreground"
                )}
                onClick={() => setLivesInCardiff(true)}
              >
                Yes
              </Button>
              <Button
                type="button"
                variant={livesInCardiff === false ? "default" : "outline"}
                className={cn(
                  "flex-1 h-10 rounded-xl",
                  livesInCardiff === false && "bg-primary text-primary-foreground"
                )}
                onClick={() => {
                  setLivesInCardiff(false)
                  setCardiffNeighbourhood("") // Clear neighbourhood when switching away
                }}
              >
                No
              </Button>
            </div>
          </div>

          {/* Cardiff Neighbourhood (shown when livesInCardiff === true) */}
          {livesInCardiff === true && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Which neighbourhood?
              </Label>
              <Popover open={neighbourhoodOpen} onOpenChange={setNeighbourhoodOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={neighbourhoodOpen}
                    className="w-full h-10 justify-between rounded-xl bg-muted/50 font-normal"
                  >
                    {cardiffNeighbourhood || "Search neighbourhoods..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput placeholder="Search neighbourhoods..." />
                    <CommandList>
                      <CommandEmpty>No neighbourhood found.</CommandEmpty>
                      <CommandGroup>
                        {CARDIFF_NEIGHBOURHOODS.map((neighbourhood) => (
                          <CommandItem
                            key={neighbourhood}
                            value={neighbourhood}
                            onSelect={(value) => {
                              setCardiffNeighbourhood(value === cardiffNeighbourhood ? "" : value)
                              setNeighbourhoodOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                cardiffNeighbourhood === neighbourhood ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {neighbourhood}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

        </div>

                {/* Housing Situation */}
                <div className="space-y-2">
          <Label htmlFor="housing-situation" className="text-sm font-medium">
            Which best describes your current housing?
          </Label>
          <Select value={housingSituation} onValueChange={setHousingSituation}>
            <SelectTrigger className="h-10 rounded-xl bg-muted/50">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {HOUSING_SITUATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Work Situation */}
        <div className="space-y-2">
          <Label htmlFor="work-situation" className="text-sm font-medium">
            Which of these best describes your current work situation?
          </Label>
          <Select value={workSituation} onValueChange={setWorkSituation}>
            <SelectTrigger className="h-10 rounded-xl bg-muted/50">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {WORK_SITUATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Birth Year */}
        <div className="space-y-2">
          <Label htmlFor="birth-year" className="text-sm font-medium">
            In which year were you born?
          </Label>
          <input
            id="birth-year"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="e.g. 1990"
            value={birthYear}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "").slice(0, 4)
              setBirthYear(value)
            }}
            className={cn(
              "flex h-10 w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm",
              "ring-offset-background placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <Label htmlFor="gender" className="text-sm font-medium">
            Gender
          </Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="h-10 rounded-xl bg-muted/50">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Ethnicity */}
        <div className="space-y-2">
          <Label htmlFor="ethnicity" className="text-sm font-medium">
            Ethnicity
          </Label>
          <Select value={ethnicity} onValueChange={setEthnicity}>
            <SelectTrigger className="h-10 rounded-xl bg-muted/50">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {ETHNICITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Submit button */}
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full h-12 rounded-xl"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </div>
  )

  // Mobile: Bottom sheet
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onSkip()}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-2xl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Community Profile</SheetTitle>
            <SheetDescription>
              Optional demographic information
            </SheetDescription>
          </SheetHeader>
          <div className="pt-2">
            {content}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: Centered dialog
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Community Profile</DialogTitle>
          <DialogDescription>
            Optional demographic information
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}
