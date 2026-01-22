"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, isValid, parseISO, startOfDay } from "date-fns"
import { CalendarIcon, Plus, X, ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase"
import { useUser } from "@clerk/nextjs"
import { useAuth } from "@clerk/nextjs"
import { createClerkUser, getClerkUser } from "@/app/actions/clerk"
import { createSessionTemplate, createSessionInstance, createSessionSchedule, updateSessionTemplate, deleteSessionSchedules, deleteSessionInstances, deleteSessionTemplate, deleteSchedule } from "@/app/actions/session"
import { mapDayStringToInt, mapIntToDayString, convertDayFormat, isValidDayString } from "@/lib/day-utils"
import { formatInTimeZone } from 'date-fns-tz'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { SessionTemplate } from "@/types/session"
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/constants'
import { localToUTC, SAUNA_TIMEZONE } from '@/lib/time-utils'

async function generateInstances() {
  try {
    const response = await fetch('/functions/v1/generate-instances', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    })
    
    if (!response.ok) {
      // Don't throw, just log the warning
      return
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    // Don't throw, just log the warning
    return
  }
}

interface SessionFormProps {
  open: boolean
  onClose: () => void
  template: SessionTemplate | null
  initialTimeSlot?: { start: Date; end: Date } | null
  onSuccess: () => void
}

interface ScheduleItem {
  id: string
  time: string
  days: string[]
}

const daysOfWeek = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
]

export function SessionForm({ open, onClose, template, initialTimeSlot, onSuccess }: SessionFormProps) {
  const { toast } = useToast()
  const { user } = useUser()
  const { getToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [isOpen, setIsOpen] = useState(template?.is_open ?? true)
  const [scheduleType, setScheduleType] = useState(template?.is_recurring ? "repeat" : "once")
  const [duration, setDuration] = useState(template?.duration_minutes ? 
    `${Math.floor(template.duration_minutes / 60).toString().padStart(2, '0')}:${(template.duration_minutes % 60).toString().padStart(2, '0')}` : 
    "01:15"
  )
  const [name, setName] = useState(template?.name || "")
  const [description, setDescription] = useState(template?.description || "")
  const [capacity, setCapacity] = useState(template?.capacity?.toString() || "10")
  const [schedules, setSchedules] = useState<ScheduleItem[]>(
    template?.schedules || [{ id: "1", time: "09:00", days: ["mon", "thu", "fri"] }]
  )
  const [recurrenceStartDate, setRecurrenceStartDate] = useState<Date | undefined>(undefined)
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<Date | undefined>(undefined)
  const [generalExpanded, setGeneralExpanded] = useState(true)
  const [scheduleExpanded, setScheduleExpanded] = useState(true)
  const [paymentExpanded, setPaymentExpanded] = useState(true)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // Pricing state
  const [pricingType, setPricingType] = useState<'free' | 'paid'>(
    (template?.pricing_type as 'free' | 'paid') || 'free'
  )
  const [dropInPrice, setDropInPrice] = useState(
    template?.drop_in_price ? (template.drop_in_price / 100).toFixed(2) : ''
  )
  const [bookingInstructions, setBookingInstructions] = useState(
    template?.booking_instructions || ''
  )

  // Get the day of week in lowercase (e.g., "mon", "tue")
  const getDayOfWeek = (date: Date) => {
    return format(date, 'EEE').toLowerCase()
  }

  // Initialize dates after component mounts
  useEffect(() => {
    if (!template) {
      const today = new Date()
      setDate(startOfDay(today))
      setRecurrenceStartDate(startOfDay(today))
      // Default to recurring schedule for new sessions with current day
      setScheduleType("repeat")
      setSchedules([{ 
        id: "1", 
        time: "09:00", 
        days: [getDayOfWeek(today)] 
      }])
    }
  }, [template])

  // Update the date and time when initialTimeSlot changes
  useEffect(() => {
    if (initialTimeSlot) {
      // Set the date
      setDate(startOfDay(initialTimeSlot.start))
      setRecurrenceStartDate(startOfDay(initialTimeSlot.start))
      
      // Calculate duration in minutes
      const durationMs = initialTimeSlot.end.getTime() - initialTimeSlot.start.getTime()
      const durationMinutes = Math.floor(durationMs / (1000 * 60))
      const hours = Math.floor(durationMinutes / 60)
      const minutes = durationMinutes % 60
      setDuration(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`)
      
      // Set the time in the schedule and use the selected day
      const timeString = format(initialTimeSlot.start, 'HH:mm')
      setSchedules([{ 
        id: "1", 
        time: timeString, 
        days: [getDayOfWeek(initialTimeSlot.start)] 
      }])
      
      // Keep it as recurring schedule
      setScheduleType("repeat")
    }
  }, [initialTimeSlot])

  useEffect(() => {
    if (template) {

      setName(template.name)
      setDescription(template.description || "")
      setCapacity(template.capacity.toString())
      setDuration(template.duration_minutes ?
        `${Math.floor(template.duration_minutes / 60).toString().padStart(2, '0')}:${(template.duration_minutes % 60).toString().padStart(2, '0')}` :
        "01:15"
      )
      setIsOpen(template.is_open)
      setScheduleType(template.is_recurring ? "repeat" : "once")

      // Load pricing fields
      setPricingType((template.pricing_type as 'free' | 'paid') || 'free')
      setDropInPrice(template.drop_in_price ? (template.drop_in_price / 100).toFixed(2) : '')
      setBookingInstructions(template.booking_instructions || '')
      
      if (template.is_recurring) {
        if (template.schedules) {
          setSchedules(template.schedules.map((s: any) => ({
            id: s.id,
            time: s.time,
            days: s.days.map((day: string) => convertDayFormat(day, false))
          })))
        }
        if (template.recurrence_start_date) {
          const startDate = parseISO(template.recurrence_start_date)
          if (isValid(startDate)) {
            setRecurrenceStartDate(startOfDay(startDate))
          }
        }
        if (template.recurrence_end_date) {
          const endDate = parseISO(template.recurrence_end_date)
          if (isValid(endDate)) {
            setRecurrenceEndDate(startOfDay(endDate))
          }
        }
      } else {
        // Handle one-off session
        if (template.one_off_date) {
          const oneOffDate = parseISO(template.one_off_date)
          if (isValid(oneOffDate)) {
            setDate(startOfDay(oneOffDate))
          }
        }
        
        // Set the time from one_off_start_time
        if (template.one_off_start_time) {
          setSchedules([{ id: "1", time: template.one_off_start_time, days: [] }])
        } else {
          setSchedules([{ id: "1", time: "09:00", days: [] }])
        }
      }
    }
  }, [template])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!user) {
        throw new Error("You must be logged in to create a session");
      }

      // Convert duration from HH:mm to minutes
      const [hours, minutes] = duration.split(':').map(Number);
      const durationMinutes = hours * 60 + minutes;

      let templateId: string;

      if (template) {
        // Update existing template
        const result = await updateSessionTemplate({
          id: template.id,
          name,
          description,
          capacity: parseInt(capacity),
          duration_minutes: durationMinutes,
          is_open: isOpen,
          is_recurring: scheduleType === "repeat",
          one_off_start_time: scheduleType === "once" ? schedules[0]?.time : null,
          one_off_date: scheduleType === "once" && date ? format(date, 'yyyy-MM-dd') : null,
          recurrence_start_date: scheduleType === "repeat" && recurrenceStartDate ? format(recurrenceStartDate, 'yyyy-MM-dd') : null,
          recurrence_end_date: scheduleType === "repeat" && recurrenceEndDate ? format(recurrenceEndDate, 'yyyy-MM-dd') : null,
          // Pricing fields
          pricing_type: pricingType,
          drop_in_price: pricingType === 'paid' && dropInPrice ? Math.round(parseFloat(dropInPrice) * 100) : null,
          booking_instructions: bookingInstructions || null,
        });

        if (!result.success) {
          throw new Error(`Failed to update template: ${result.error}`);
        }

        templateId = template.id;

        // Delete existing schedules and instances
        await Promise.all([
          deleteSessionSchedules(templateId),
          deleteSessionInstances(templateId)
        ]);
      } else {
        // Create new template using server action
        const result = await createSessionTemplate({
          name,
          description,
          capacity: parseInt(capacity),
          duration_minutes: durationMinutes,
          is_open: isOpen,
          is_recurring: scheduleType === "repeat",
          one_off_start_time: scheduleType === "once" ? schedules[0]?.time : null,
          one_off_date: scheduleType === "once" && date ? format(date, 'yyyy-MM-dd') : null,
          recurrence_start_date: scheduleType === "repeat" && recurrenceStartDate ? format(recurrenceStartDate, 'yyyy-MM-dd') : null,
          recurrence_end_date: scheduleType === "repeat" && recurrenceEndDate ? format(recurrenceEndDate, 'yyyy-MM-dd') : null,
          created_by: user.id,
          // Pricing fields
          pricing_type: pricingType,
          drop_in_price: pricingType === 'paid' && dropInPrice ? Math.round(parseFloat(dropInPrice) * 100) : null,
          booking_instructions: bookingInstructions || null,
        });

        if (!result.success || !result.id) {
          throw new Error(`Failed to create template: ${result.error}`);
        }

        templateId = result.id;
      }

      if (scheduleType === "once" && date) {
        // Create single instance using the template's one_off_start_time and one_off_date
        const [hours, minutes] = (schedules[0]?.time || "09:00").split(':').map(Number);
        
        // Create dates in local time
        const localStartTime = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          hours,
          minutes,
          0,
          0
        );
        
        const localEndTime = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          hours,
          minutes + durationMinutes,
          0,
          0
        );

        // Convert to UTC using the timezone
        const instanceStartTimeUTC = localToUTC(localStartTime, SAUNA_TIMEZONE);
        const instanceEndTimeUTC = localToUTC(localEndTime, SAUNA_TIMEZONE);


        // Create the instance with the calculated times
        const instanceResult = await createSessionInstance({
          template_id: templateId,
          start_time: instanceStartTimeUTC.toISOString(),
          end_time: instanceEndTimeUTC.toISOString(),
          status: 'scheduled'
        });

        if (!instanceResult.success) {
          throw new Error(`Failed to create instance: ${instanceResult.error}`);
        }
      } else if (scheduleType === "repeat") {

        // Validate schedules before creating
        if (!schedules || schedules.length === 0) {
          throw new Error("No schedules provided for recurring template");
        }

        // Create recurring schedules
        const scheduleResults = await Promise.all(
          schedules.map(async (schedule) => {
            try {
              // Defensive: ensure days is always an array
              const mappedDays = (schedule.days || []).map(day => day.toLowerCase());
              if (mappedDays.length === 0) {
                throw new Error("No days selected for schedule.");
              }
              if (mappedDays.some(d => !isValidDayString(d))) {
                throw new Error("Invalid day selected in schedule.");
              }


              const result = await createSessionSchedule({
                session_template_id: templateId,
                time: schedule.time,
                days: mappedDays
              });

              return result;
            } catch (error) {
              throw error;
            }
          })
        );


        const errors = scheduleResults.filter(r => !r.success);
        if (errors.length > 0) {
          throw new Error(`Failed to create schedules: ${errors[0].error}`);
        }

        // Wait a moment to ensure database consistency
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Generate instances for recurring template
        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-instances`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            template_id_to_process: templateId
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          toast({
            title: "Warning",
            description: "Template created but instance generation failed. Instances will be generated by the scheduled job.",
            variant: "destructive",
          });
        } else {
        }
      }

      toast({
        title: "Success",
        description: template ? "Session updated successfully" : "Session created successfully",
      });

      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error("Session form error:", error);
      toast({
        title: "Error",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return

    setLoading(true)
    try {
      // Delete the template first
      const deleteTemplateResult = await deleteSessionTemplate(template.id)
      if (!deleteTemplateResult.success) {
        throw new Error(deleteTemplateResult.error || "Failed to delete template")
      }

      // The schedules and instances will be automatically deleted due to CASCADE
      // but we'll still try to delete them explicitly as a fallback
      try {
        await deleteSessionSchedules(template.id)
        await deleteSessionInstances(template.id)
      } catch (error) {
        // Don't throw here as the template was already deleted
      }

      toast({
        title: "Success",
        description: "Session deleted successfully",
      })

      onSuccess()
      onClose()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete session. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setIsDeleteDialogOpen(false)
    }
  }

  const addSchedule = () => {
    const newId = (schedules.length + 1).toString()
    setSchedules([...schedules, { id: newId, time: "09:00", days: [] }])
  }

  const removeSchedule = async (id: string) => {
    if (!template) {
      // For new templates, just remove from local state
      setSchedules(schedules.filter((schedule) => schedule.id !== id))
      return
    }

    try {
      // For existing templates, delete from database
      const result = await deleteSchedule(id)
      if (!result.success) {
        throw new Error(result.error || "Failed to delete schedule")
      }

      // Update local state
      setSchedules(schedules.filter((schedule) => schedule.id !== id))
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete schedule. Please try again.",
        variant: "destructive",
      })
    }
  }

  const updateScheduleTime = (id: string, time: string) => {
    setSchedules(schedules.map((schedule) => 
      schedule.id === id ? { ...schedule, time } : schedule
    ))
  }

  const toggleDay = (scheduleId: string, day: string) => {
    setSchedules(
      schedules.map((schedule) => {
        if (schedule.id === scheduleId) {
          const newDays = schedule.days.includes(day) ? schedule.days.filter((d) => d !== day) : [...schedule.days, day]
          return { ...schedule, days: newDays }
        }
        return schedule
      }),
    )
  }

  const handleScheduleTypeChange = (type: "repeat" | "once") => {
    setScheduleType(type)
    if (type === "once") {
      // Initialize with a single schedule for one-off sessions
      setSchedules([{ id: "1", time: "09:00", days: [] }])
    } else {
      // Initialize with default recurring schedule
      setSchedules([{ id: "1", time: "09:00", days: ["mon", "thu", "fri"] }])
    }
  }

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Allow partial input while typing
    if (value === "" || value.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)) {
      setDuration(value)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-md overflow-y-auto p-0">
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b">
          <SheetHeader>
            <SheetTitle className="text-xl">{template ? "Edit Session" : "New Session"}</SheetTitle>
            <SheetDescription>
              {template ? "Make changes to the existing session." : "Add a new session to your calendar."}
            </SheetDescription>
          </SheetHeader>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          {/* Schedule Section - Moved to top */}
          <div className="rounded-lg overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left font-medium bg-gray-50"
              onClick={() => setScheduleExpanded(!scheduleExpanded)}
            >
              <span>Schedule</span>
              {scheduleExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>

            {scheduleExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {/* Schedule Type */}
                <div className="space-y-2 py-4" >
                  <div className="grid grid-cols-2 gap-4">
                    <Card
                      className={cn(
                        "cursor-pointer border",
                        scheduleType === "repeat" ? "border-primary bg-primary/5" : "border-gray-200",
                      )}
                      onClick={() => handleScheduleTypeChange("repeat")}
                    >
                      <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                        {scheduleType === "repeat" && (
                          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </div>
                        )}
                        <span className="font-medium">Repeat</span>
                        <span className="text-sm text-gray-500 mt-1">Regular schedule</span>
                      </CardContent>
                    </Card>

                    <Card
                      className={cn(
                        "cursor-pointer border",
                        scheduleType === "once" ? "border-primary bg-primary/5" : "border-gray-200",
                      )}
                      onClick={() => handleScheduleTypeChange("once")}
                    >
                      <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                        {scheduleType === "once" && (
                          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </div>
                        )}
                        <span className="font-medium">Once</span>
                        <span className="text-sm text-gray-500 mt-1">Single occurrence</span>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {scheduleType === "once" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="date" className="text-sm font-medium">
                        Date <span className="text-red-500">*</span>
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !date && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar 
                            mode="single" 
                            selected={date} 
                            onSelect={(newDate) => newDate && setDate(startOfDay(newDate))} 
                            initialFocus 
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="time" className="text-sm font-medium">
                        Time <span className="text-red-500">*</span>
                      </Label>
                      <Input 
                        id="time" 
                        type="time" 
                        value={schedules[0]?.time || "09:00"} 
                        onChange={(e) => {
                          const newTime = e.target.value
                          if (schedules.length === 0) {
                            setSchedules([{ id: "1", time: newTime, days: [] }])
                          } else {
                            updateScheduleTime(schedules[0].id, newTime)
                          }
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Start Date <span className="text-red-500">*</span></Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !recurrenceStartDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {recurrenceStartDate ? format(recurrenceStartDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={recurrenceStartDate}
                            onSelect={(newDate) => newDate && setRecurrenceStartDate(startOfDay(newDate))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>End Date (Optional)</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !recurrenceEndDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {recurrenceEndDate ? format(recurrenceEndDate, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={recurrenceEndDate}
                            onSelect={(newDate) => newDate && setRecurrenceEndDate(startOfDay(newDate))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Schedule Items - Only show for repeat type */}
                    <div className="space-y-4">
                      {schedules.map((schedule) => (
                        <div key={schedule.id} className="border rounded-md p-4 space-y-3 relative">
                          {schedules.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6"
                              onClick={() => removeSchedule(schedule.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <div className="space-y-2">
                            <Label htmlFor={`time-${schedule.id}`} className="text-sm font-medium">
                              Time <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id={`time-${schedule.id}`}
                              type="time"
                              value={schedule.time}
                              onChange={(e) => updateScheduleTime(schedule.id, e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">
                              Days <span className="text-red-500">*</span>
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {daysOfWeek.map((day) => (
                                <button
                                  key={day.value}
                                  type="button"
                                  onClick={() => toggleDay(schedule.id, day.value)}
                                  className={cn(
                                    "px-3 py-1 rounded-md text-sm",
                                    schedule.days.includes(day.value)
                                      ? "bg-primary text-white"
                                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                                  )}
                                >
                                  {day.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="outline" className="w-full" onClick={addSchedule}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Another Time
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* General Section */}
          <div className="rounded-lg overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left font-medium bg-gray-50"
              onClick={() => setGeneralExpanded(!generalExpanded)}
            >
              <span>General</span>
              {generalExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>

            {generalExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="status" className="text-sm font-medium">
                    Session Status
                  </Label>
                  <div className="flex items-center space-x-2">
                    <Switch id="status" checked={isOpen} onCheckedChange={setIsOpen} />
                    <Label htmlFor="status" className="text-sm font-medium">
                      {isOpen ? "Open" : "Closed"}
                    </Label>
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Session Name
                    </Label>
                    <span className="text-sm text-gray-500">0</span>
                  </div>
                  <Input id="name" placeholder="e.g., Regular Sauna" defaultValue={name} onChange={(e) => setName(e.target.value)} />
                  <p className="text-sm text-gray-500">Give your session a short and clear name.</p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description" className="text-sm font-medium">
                      Description
                    </Label>
                    <span className="text-sm text-gray-500">0</span>
                  </div>
                  <Textarea
                    id="description"
                    placeholder="Describe the session..."
                    defaultValue={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <p className="text-sm text-gray-500">Provide details about what participants can expect.</p>
                </div>

                {/* Capacity */}
                <div className="space-y-2">
                  <Label htmlFor="capacity" className="text-sm font-medium">
                    Capacity <span className="text-red-500">*</span>
                  </Label>
                  <Input id="capacity" type="number" min="1" defaultValue={capacity} onChange={(e) => setCapacity(e.target.value)} />
                  <p className="text-sm text-gray-500">Maximum number of participants allowed.</p>
                </div>

                {/* Duration */}
                <div className="space-y-2">
                  <Label htmlFor="duration" className="text-sm font-medium">
                    Duration <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="duration"
                    type="time"
                    value={duration}
                    onChange={handleDurationChange}
                    step="60"
                  />
                  <p className="text-sm text-gray-500">Length of the session (hours:minutes).</p>
                </div>
              </div>
            )}
          </div>

          {/* Payment Section */}
          <div className="rounded-lg overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left font-medium bg-gray-50"
              onClick={() => setPaymentExpanded(!paymentExpanded)}
            >
              <span>Payment</span>
              {paymentExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>

            {paymentExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {/* Pricing Type Toggle */}
                <div className="space-y-2 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Card
                      className={cn(
                        "cursor-pointer border",
                        pricingType === "free" ? "border-primary bg-primary/5" : "border-gray-200",
                      )}
                      onClick={() => setPricingType("free")}
                    >
                      <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                        {pricingType === "free" && (
                          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </div>
                        )}
                        <span className="font-medium">Free</span>
                        <span className="text-sm text-gray-500 mt-1">Contact for details</span>
                      </CardContent>
                    </Card>

                    <Card
                      className={cn(
                        "cursor-pointer border",
                        pricingType === "paid" ? "border-primary bg-primary/5" : "border-gray-200",
                      )}
                      onClick={() => setPricingType("paid")}
                    >
                      <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                        {pricingType === "paid" && (
                          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </div>
                        )}
                        <span className="font-medium">Paid</span>
                        <span className="text-sm text-gray-500 mt-1">Stripe checkout</span>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {pricingType === "free" && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                    <p className="text-sm text-amber-800">
                      Free sessions are visible on the public calendar but cannot be booked online.
                      Visitors will see a &quot;Contact us for details&quot; message.
                    </p>
                  </div>
                )}

                {pricingType === "paid" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="dropInPrice" className="text-sm font-medium">
                        Price <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
                        <Input
                          id="dropInPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={dropInPrice}
                          onChange={(e) => setDropInPrice(e.target.value)}
                          className="pl-7"
                        />
                      </div>
                      <p className="text-sm text-gray-500">Price per person for this session.</p>
                    </div>
                  </div>
                )}

                {/* Booking Instructions - show for both paid and free */}
                <div className="space-y-2">
                  <Label htmlFor="bookingInstructions" className="text-sm font-medium">
                    Booking Instructions
                  </Label>
                  <Textarea
                    id="bookingInstructions"
                    placeholder="Instructions shown after booking (e.g., arrival time, what to bring)..."
                    value={bookingInstructions}
                    onChange={(e) => setBookingInstructions(e.target.value)}
                    rows={4}
                  />
                  <p className="text-sm text-gray-500">Displayed on the confirmation page after booking.</p>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="sticky bottom-0 bg-white border-t px-6 py-4 -mx-6 -mb-4">
            <div className="flex justify-between w-full">
              {template && (
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
                        This action cannot be undone. This will permanently delete the session
                        and all associated schedules and instances.
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
                  {loading ? "Saving..." : template ? "Save Changes" : "Create Session"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
