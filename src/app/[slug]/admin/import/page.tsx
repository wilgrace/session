"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useParams } from "next/navigation"
import Papa from "papaparse"
import { format, parseISO } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { Upload, FileText, AlertCircle, CheckCircle2, ArrowRight, Loader2, X, Clock, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  validateHeaders,
  parseAcuityRows,
  REQUIRED_HEADERS,
  type AcuityRow,
  type AcuitySlot,
  type ImportWarning,
} from "@/lib/acuity-csv"
import {
  getSessionInstancesForImport,
  importFromAcuity,
  type SessionInstanceForMapping,
  type ImportSummary,
} from "@/app/actions/import"

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

type Step = "upload" | "map" | "confirm" | "done"
type ImportSource = "acuity" | "periode" | "wix" | "other"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const params = useParams()
  const slug = params.slug as string

  const [activeTab, setActiveTab] = useState<ImportSource>("acuity")
  const [step, setStep] = useState<Step>("upload")
  const [csvRows, setCsvRows] = useState<AcuityRow[]>([])
  const [slots, setSlots] = useState<AcuitySlot[]>([])
  const [warnings, setWarnings] = useState<ImportWarning[]>([])
  const [instances, setInstances] = useState<SessionInstanceForMapping[]>([])
  const [instancesLoading, setInstancesLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // Mapping: slotKey → instanceId
  const [slotMapping, setSlotMapping] = useState<Record<string, string>>({})
  const [switchDate, setSwitchDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [sendNotifications, setSendNotifications] = useState(false)

  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load session instances when we enter the map step
  useEffect(() => {
    if (step !== "map" || instances.length > 0) return
    setInstancesLoading(true)
    getSessionInstancesForImport().then(result => {
      if (result.success && result.data) {
        setInstances(result.data)
        // Auto-match: try to find an instance at the same UTC start time
        const autoMap: Record<string, string> = {}
        for (const slot of slots) {
          const match = result.data.find(
            inst => new Date(inst.startTime).getTime() === new Date(slot.startTimeUTC).getTime()
          )
          if (match) autoMap[slot.slotKey] = match.id
        }
        setSlotMapping(autoMap)
      }
      setInstancesLoading(false)
    })
  }, [step, instances.length, slots])

  // ---------------------------------------------------------------------------
  // Step 1: CSV upload
  // ---------------------------------------------------------------------------

  const handleFile = useCallback((file: File) => {
    setParseError(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? []
        const headerError = validateHeaders(headers)
        if (headerError) {
          setParseError(headerError)
          return
        }

        const { rows, slots: parsedSlots, warnings: parsedWarnings } = parseAcuityRows(results.data)
        if (rows.length === 0) {
          setParseError("No valid rows found in the CSV.")
          return
        }

        setCsvRows(rows)
        setSlots(parsedSlots)
        setWarnings(parsedWarnings)
        setStep("map")
      },
      error(err) {
        setParseError(`Failed to parse CSV: ${err.message}`)
      },
    })
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const mappedSlotCount = Object.keys(slotMapping).length
  const mappedBookings = csvRows.filter(r => r.email && slotMapping[r.slotKey]).length
  const skippedBookings = csvRows.length - mappedBookings

  const newEmails = new Set(csvRows.filter(r => r.email && slotMapping[r.slotKey]).map(r => r.email))
  const upcomingCount = csvRows.filter(r => {
    if (!r.email || !slotMapping[r.slotKey]) return false
    return new Date(r.startTimeUTC) >= new Date(switchDate + "T00:00:00Z")
  }).length

  // ---------------------------------------------------------------------------
  // Step 4: Run import
  // ---------------------------------------------------------------------------

  async function handleImport() {
    setImporting(true)
    setImportError(null)
    try {
      const result = await importFromAcuity({
        rows: csvRows,
        slotMapping,
        switchDate,
        sendNotifications,
      })
      if (result.success && result.summary) {
        setSummary(result.summary)
        setStep("done")
      } else {
        setImportError(result.error ?? "Import failed")
      }
    } catch (err: any) {
      setImportError(err.message ?? "Import failed")
    } finally {
      setImporting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Switching from another platform</h1>
          <p className="text-sm text-gray-500 mt-1">Migrating to Session is a lot easier than it may seem.</p>
        </div>

        {/* Tab nav */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex gap-6">
            {(["acuity", "periode", "wix", "other"] as ImportSource[]).map(tab => {
              const labels: Record<ImportSource, string> = {
                acuity: "Acuity Scheduling",
                periode: "Periode",
                wix: "Wix",
                other: "Other",
              }
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "pb-3 text-sm font-medium border-b-2 transition-colors",
                    activeTab === tab
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  {labels[tab]}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab: Acuity Scheduling */}
        {activeTab === "acuity" && (
          <>
            <div className="mb-8">
              <ol className="flex flex-col gap-4 text-sm">
                <li><span className="font-medium text-base">Billing</span><br/>If you're already using Stripe, then simply connect Session to the same account. If using Square or Paypal, you'll need to recreate Coupons and Gift Certificates in Stripe in order to honour them.</li>
                <li><span className="font-medium text-base">Bookings</span><br/>Make the transition seamless for your customers by exporting bookings and users from <b>Reports / Import/Export</b> and following the steps below</li>
              </ol>
            </div>

            <StepIndicator current={step} />

            {step === "upload" && (
              <UploadStep
                fileInputRef={fileInputRef}
                onFile={handleFile}
                onDrop={handleDrop}
                parseError={parseError}
              />
            )}

            {step === "map" && (
              <MapStep
                slots={slots}
                instances={instances}
                instancesLoading={instancesLoading}
                slotMapping={slotMapping}
                setSlotMapping={setSlotMapping}
                switchDate={switchDate}
                setSwitchDate={setSwitchDate}
                sendNotifications={sendNotifications}
                setSendNotifications={setSendNotifications}
                warnings={warnings}
                onNext={() => setStep("confirm")}
                onBack={() => setStep("upload")}
                mappedSlotCount={mappedSlotCount}
              />
            )}

            {step === "confirm" && (
              <ConfirmStep
                mappedBookings={mappedBookings}
                skippedBookings={skippedBookings}
                newEmailCount={newEmails.size}
                upcomingCount={upcomingCount}
                sendNotifications={sendNotifications}
                switchDate={switchDate}
                warnings={warnings}
                onBack={() => setStep("map")}
                onImport={handleImport}
                importing={importing}
                importError={importError}
              />
            )}

            {step === "done" && summary && (
              <DoneStep summary={summary} slug={slug} />
            )}
          </>
        )}

        {/* Tab: Periode */}
        {activeTab === "periode" && <ComingSoonTab />}

        {/* Tab: Wix */}
        {activeTab === "wix" && <ComingSoonTab />}

        {/* Tab: Other */}
        {activeTab === "other" && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
              <MessageCircle className="h-6 w-6 text-gray-400" />
            </div>
            <h4 className="text-lg font-medium text-gray-900">Not seeing your platform?</h4>
            <p className="text-gray-400 text-sm max-w-xs">
              Get in touch via chat and we&apos;ll help you switch over — we can often handle the migration for you.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map sessions" },
  { id: "confirm", label: "Confirm" },
  { id: "done", label: "Done" },
]

function StepIndicator({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex(s => s.id === current)
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const isComplete = i < currentIndex
        const isActive = step.id === current
        return (
          <div key={step.id} className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1.5 text-sm font-medium",
              isActive ? "text-gray-900" : isComplete ? "text-green-600" : "text-gray-400"
            )}>
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                isActive ? "bg-gray-900 text-white" : isComplete ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
              )}>
                {isComplete ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              {step.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-px bg-gray-200" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Upload
// ---------------------------------------------------------------------------

function UploadStep({
  fileInputRef,
  onFile,
  onDrop,
  parseError,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFile: (f: File) => void
  onDrop: (e: React.DragEvent) => void
  parseError: string | null
}) {
  return (
    <div>
      <div
        className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">Drop your Acuity CSV here</p>
        <p className="text-xs text-gray-500 mt-1">or click to browse</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
        />
      </div>

      {parseError && (
        <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-2">Export from Acuity: <strong>Reports → Import/Export</strong></p>
        <p className="mt-2 text-xs">
        Expected columns: 
        </p>
        <p className="text-xs font-mono bg-gray-50 rounded px-3 py-2 border border-gray-100">
          {REQUIRED_HEADERS.join(", ")}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Map
// ---------------------------------------------------------------------------

function MapStep({
  slots,
  instances,
  instancesLoading,
  slotMapping,
  setSlotMapping,
  switchDate,
  setSwitchDate,
  sendNotifications,
  setSendNotifications,
  warnings,
  onNext,
  onBack,
  mappedSlotCount,
}: {
  slots: AcuitySlot[]
  instances: SessionInstanceForMapping[]
  instancesLoading: boolean
  slotMapping: Record<string, string>
  setSlotMapping: (m: Record<string, string>) => void
  switchDate: string
  setSwitchDate: (d: string) => void
  sendNotifications: boolean
  setSendNotifications: (v: boolean) => void
  warnings: ImportWarning[]
  onNext: () => void
  onBack: () => void
  mappedSlotCount: number
}) {
  function setMapping(slotKey: string, instanceId: string) {
    setSlotMapping({ ...slotMapping, [slotKey]: instanceId })
  }
  function clearMapping(slotKey: string) {
    const next = { ...slotMapping }
    delete next[slotKey]
    setSlotMapping(next)
  }

  // Group instances by template name for the dropdown
  const instancesByTemplate = instances.reduce<Record<string, SessionInstanceForMapping[]>>(
    (acc, inst) => {
      const key = inst.templateName
      acc[key] = acc[key] ?? []
      acc[key].push(inst)
      return acc
    },
    {}
  )

  function formatInstanceOption(inst: SessionInstanceForMapping) {
    const start = parseISO(inst.startTime)
    const tz = inst.timezone ?? "Europe/London"
    return formatInTimeZone(start, tz, "EEE d MMM, HH:mm")
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-6">
        Found <strong>{slots.length}</strong> unique time slot{slots.length !== 1 ? "s" : ""} across{" "}
        <strong>{csvRows_count(slots)}</strong> appointment type{csvRows_count(slots) !== 1 ? "s" : ""} in the CSV.
        For each Acuity slot, select the Session instance it maps to.
        Unmapped slots will be skipped.
      </p>

      {instancesLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading your sessions…
        </div>
      ) : instances.length === 0 ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 mb-6">
          <p className="font-medium mb-1">No sessions found</p>
          <p>
            You need to create session templates and instances in{" "}
            <a href="../admin/sessions" className="underline">Sessions</a>{" "}
            before you can map bookings.
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Acuity slot</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Bookings</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Session instance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slots.map(slot => {
                const mapped = slotMapping[slot.slotKey]
                const tz = slot.timezone ?? "Europe/London"
                const startDate = parseISO(slot.startTimeUTC)
                const label = `${slot.normalizedType} — ${formatInTimeZone(startDate, tz, "EEE d MMM, HH:mm")}`
                return (
                  <tr key={slot.slotKey} className={cn(!mapped && "bg-amber-50/50")}>
                    <td className="px-4 py-3 text-gray-800">
                      <div className="font-medium">{slot.normalizedType}</div>
                      <div className="text-xs text-gray-500">
                        {formatInTimeZone(startDate, tz, "EEEE d MMMM yyyy, HH:mm")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{slot.bookingCount}</td>
                    <td className="px-4 py-3">
                      {mapped ? (
                        <div className="flex items-center gap-2">
                          <select
                            className="flex-1 text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                            value={mapped}
                            onChange={e => setMapping(slot.slotKey, e.target.value)}
                          >
                            {Object.entries(instancesByTemplate).map(([tmpl, insts]) => (
                              <optgroup key={tmpl} label={tmpl}>
                                {insts.map(inst => (
                                  <option key={inst.id} value={inst.id}>
                                    {formatInstanceOption(inst)}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <button
                            onClick={() => clearMapping(slot.slotKey)}
                            className="text-gray-400 hover:text-gray-600"
                            title="Remove mapping"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <select
                          className="w-full text-sm border border-amber-300 rounded-md px-2 py-1.5 bg-amber-50 text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          value=""
                          onChange={e => {
                            if (e.target.value) setMapping(slot.slotKey, e.target.value)
                          }}
                        >
                          <option value="" disabled>— select a session —</option>
                          {Object.entries(instancesByTemplate).map(([tmpl, insts]) => (
                            <optgroup key={tmpl} label={tmpl}>
                              {insts.map(inst => (
                                <option key={inst.id} value={inst.id}>
                                  {formatInstanceOption(inst)}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Notification settings */}
      <div className="border border-gray-200 rounded-lg p-4 mb-6 space-y-4">
        <div>
          <Label htmlFor="switchDate" className="text-sm font-medium text-gray-700">
            Switch date
          </Label>
          <p className="text-xs text-gray-500 mb-2">
            Users with sessions on or after this date will receive a notification email.
          </p>
          <Input
            id="switchDate"
            type="date"
            value={switchDate}
            onChange={e => setSwitchDate(e.target.value)}
            className="w-48"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            id="sendNotifications"
            type="checkbox"
            checked={sendNotifications}
            onChange={e => setSendNotifications(e.target.checked)}
            className="rounded border-gray-300"
          />
          <Label htmlFor="sendNotifications" className="text-sm text-gray-700 cursor-pointer">
            Send notification emails to users with upcoming bookings
          </Label>
        </div>
      </div>

      {warnings.length > 0 && (
        <WarningList warnings={warnings} />
      )}

      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button
          onClick={onNext}
          disabled={mappedSlotCount === 0}
        >
          Preview import
          <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

function csvRows_count(slots: AcuitySlot[]): number {
  return new Set(slots.map(s => s.normalizedType)).size
}

// ---------------------------------------------------------------------------
// Step 3: Confirm
// ---------------------------------------------------------------------------

function ConfirmStep({
  mappedBookings,
  skippedBookings,
  newEmailCount,
  upcomingCount,
  sendNotifications,
  switchDate,
  warnings,
  onBack,
  onImport,
  importing,
  importError,
}: {
  mappedBookings: number
  skippedBookings: number
  newEmailCount: number
  upcomingCount: number
  sendNotifications: boolean
  switchDate: string
  warnings: ImportWarning[]
  onBack: () => void
  onImport: () => void
  importing: boolean
  importError: string | null
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Bookings to import" value={mappedBookings} />
        {sendNotifications && (
          <StatCard
            label={`Notification emails (from ${format(new Date(switchDate), "d MMM")})`}
            value={upcomingCount}
          />
        )}
        <StatCard label="New user accounts" value={newEmailCount} description="Placeholder accounts, claimed on sign-up" />
        {skippedBookings > 0 && (
          <StatCard label="Bookings skipped" value={skippedBookings} muted />
        )}
      </div>

      {warnings.length > 0 && (
        <WarningList warnings={warnings} />
      )}

      {importError && (
        <div className="mb-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={importing}>Back</Button>
        <Button onClick={onImport} disabled={importing || mappedBookings === 0}>
          {importing ? (
            <>
              <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              Importing…
            </>
          ) : (
            "Run import"
          )}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Done
// ---------------------------------------------------------------------------

function DoneStep({ summary, slug }: { summary: ImportSummary; slug: string }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">Import complete</h2>
          <p className="text-sm text-gray-500">Bookings and users have been created.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Bookings created" value={summary.bookingsCreated} />
        <StatCard label="New users" value={summary.usersCreated} />
        <StatCard label="Existing users matched" value={summary.usersMatched} />
        {summary.emailsSent > 0 && (
          <StatCard label="Notification emails sent" value={summary.emailsSent} />
        )}
        {summary.bookingsSkipped > 0 && (
          <StatCard label="Bookings skipped" value={summary.bookingsSkipped} muted />
        )}
      </div>

      {summary.errors.length > 0 && (
        <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
          <p className="font-medium">Some items failed:</p>
          {summary.errors.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button asChild variant="outline">
          <a href={`/${slug}/admin/sessions`}>View sessions</a>
        </Button>
        <Button asChild>
          <a href={`/${slug}/admin/users`}>View users</a>
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  description,
  muted,
}: {
  label: string
  value: number
  description?: string
  muted?: boolean
}) {
  return (
    <div className={cn(
      "rounded-lg border p-4",
      muted ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white"
    )}>
      <div className={cn("text-2xl font-bold", muted ? "text-gray-400" : "text-gray-900")}>
        {value}
      </div>
      <div className={cn("text-sm mt-0.5", muted ? "text-gray-400" : "text-gray-600")}>
        {label}
      </div>
      {description && (
        <div className="text-xs text-gray-400 mt-0.5">{description}</div>
      )}
    </div>
  )
}

function ComingSoonTab() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
        <Clock className="h-6 w-6 text-gray-400" />
      </div>
      <h4 className="text-lg font-medium text-gray-900">Coming soon</h4>
      <p className="text-gray-400 text-sm">We're working on this import. Check back soon.</p>
    </div>
  )
}

function WarningList({ warnings }: { warnings: ImportWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-sm font-medium text-amber-800">{warnings.length} warning{warnings.length !== 1 ? "s" : ""}</p>
      </div>
      <ul className="space-y-1">
        {warnings.slice(0, 10).map((w, i) => (
          <li key={i} className="text-xs text-amber-700">{w.message}</li>
        ))}
        {warnings.length > 10 && (
          <li className="text-xs text-amber-600 font-medium">…and {warnings.length - 10} more</li>
        )}
      </ul>
    </div>
  )
}
