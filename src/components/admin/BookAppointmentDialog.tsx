import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bookAppointment, getBookedTimes } from "@/lib/hospital.functions";
import { SPECIALTIES, generateSlots, dayNameFromDate, formatTime12h } from "@/lib/slots";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";

export function BookAppointmentDialog() {
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [specialty, setSpecialty] = useState<string>(SPECIALTIES[0]);
  const [doctorId, setDoctorId] = useState<string>("");
  const [date, setDate] = useState<string>(today);
  const [slot, setSlot] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const qc = useQueryClient();
  const fetchBooked = useServerFn(getBookedTimes);
  const bookFn = useServerFn(bookAppointment);

  const { data: doctors } = useQuery({
    queryKey: ["doctors-by-specialty", specialty],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("doctors")
        .select("*").eq("specialty", specialty).eq("active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedDoctor = useMemo(
    () => doctors?.find((d: any) => d.id === doctorId) ?? doctors?.[0],
    [doctors, doctorId]
  );

  const { data: booked } = useQuery({
    queryKey: ["booked", selectedDoctor?.id, date],
    enabled: open && !!selectedDoctor && !!date,
    queryFn: async () => {
      const times = await fetchBooked({ data: { doctor_id: selectedDoctor!.id, date } });
      return new Set(times);
    },
  });

  const availableSlots = useMemo(() => {
    if (!selectedDoctor) return [];
    const dayName = dayNameFromDate(date);
    if (!selectedDoctor.working_days.includes(dayName)) return [];
    const all = generateSlots(selectedDoctor.start_time.slice(0, 5), selectedDoctor.end_time.slice(0, 5));
    return all.filter((s) => !booked?.has(s));
  }, [selectedDoctor, date, booked]);

  const book = useMutation({
    mutationFn: async () => {
      if (!selectedDoctor || !slot) throw new Error("Pick a slot first");
      if (!name.trim() || !phone.trim()) throw new Error("Name and phone are required");
      await bookFn({
        data: {
          name: name.trim(), phone: phone.trim(),
          doctor_id: selectedDoctor.id,
          appointment_date: date,
          appointment_time: slot,
        },
      });
    },
    onSuccess: () => {
      toast.success("Appointment booked");
      qc.invalidateQueries({ queryKey: ["appointments-all"] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["booked"] });
      setOpen(false);
      setSlot(""); setName(""); setPhone("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><CalendarPlus className="w-4 h-4 mr-1" /> Book appointment</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Book an appointment</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Specialty</Label>
              <Select value={specialty} onValueChange={(v) => { setSpecialty(v); setDoctorId(""); setSlot(""); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Doctor</Label>
              <Select value={selectedDoctor?.id ?? ""} onValueChange={(v) => { setDoctorId(v); setSlot(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>{doctors?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Date</Label>
            <Input className="mt-1" type="date" min={today} value={date} onChange={(e) => { setDate(e.target.value); setSlot(""); }} />
          </div>
          <div>
            <Label>Available slots</Label>
            <div className="mt-2 flex flex-wrap gap-2 min-h-12">
              {availableSlots.length === 0 && (
                <p className="text-sm text-muted-foreground">No slots on this day.</p>
              )}
              {availableSlots.map((s) => (
                <button
                  key={s} type="button"
                  onClick={() => setSlot(s)}
                  className={`px-3 py-1.5 rounded-md text-sm border ${slot === s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
                >{formatTime12h(s)}</button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t">
            <div><Label>Patient name</Label><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></div>
            <div><Label>Phone (E.164)</Label><Input className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15558675309" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!slot || !name || !phone || book.isPending} onClick={() => book.mutate()}>
            {book.isPending ? "Booking…" : "Confirm booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
