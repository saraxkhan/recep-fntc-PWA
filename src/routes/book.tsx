import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bookAppointment, getBookedTimes } from "@/lib/hospital.functions";
import { useMemo, useState } from "react";
import { SPECIALTIES, generateSlots, dayNameFromDate, formatTime12h } from "@/lib/slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Calendar as CalIcon } from "lucide-react";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book an appointment · MediVoice" },
      { name: "description", content: "Pick a specialty, choose an open slot, and book — this is the same engine the AI receptionist uses on calls." },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [specialty, setSpecialty] = useState<string>(SPECIALTIES[0]);
  const [doctorId, setDoctorId] = useState<string>("");
  const [date, setDate] = useState<string>(today);
  const [slot, setSlot] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState<null | { date: string; time: string; doctor: string }>(null);

  const qc = useQueryClient();

  const fetchBooked = useServerFn(getBookedTimes);
  const bookFn = useServerFn(bookAppointment);

  const { data: doctors } = useQuery({
    queryKey: ["doctors-by-specialty", specialty],
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
    enabled: !!selectedDoctor && !!date,
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
          name: name.trim(),
          phone: phone.trim(),
          doctor_id: selectedDoctor.id,
          appointment_date: date,
          appointment_time: slot,
        },
      });
      return { doctor: selectedDoctor.name, time: slot, date };
    },
    onSuccess: (r) => {
      setDone(r);
      qc.invalidateQueries({ queryKey: ["booked"] });
      qc.invalidateQueries({ queryKey: ["appointments-all"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (done) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-success/15 text-success grid place-items-center mx-auto"><CheckCircle2 className="w-8 h-8" /></div>
        <h1 className="text-3xl font-semibold tracking-tight mt-5">You're booked.</h1>
        <p className="text-muted-foreground mt-2">
          {done.doctor} · {done.date} at {formatTime12h(done.time)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">A confirmation SMS has been sent to {phone}.</p>
        <Button className="mt-8" onClick={() => { setDone(null); setSlot(""); setName(""); setPhone(""); }}>Book another</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><CalIcon className="w-5 h-5" /></div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Book an appointment</h1>
          <p className="text-sm text-muted-foreground">Same engine the AI receptionist uses on calls.</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
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
          {selectedDoctor && (
            <p className="text-xs text-muted-foreground mt-1">
              Works: {selectedDoctor.working_days.join(", ")} · {selectedDoctor.start_time.slice(0,5)}–{selectedDoctor.end_time.slice(0,5)}
            </p>
          )}
        </div>

        <div>
          <Label>Available slots</Label>
          <div className="mt-2 flex flex-wrap gap-2 min-h-12">
            {availableSlots.length === 0 && (
              <p className="text-sm text-muted-foreground">No slots on this day. Try another date.</p>
            )}
            {availableSlots.map((s) => (
              <button
                key={s}
                onClick={() => setSlot(s)}
                className={`px-3 py-1.5 rounded-md text-sm border ${slot === s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
              >{formatTime12h(s)}</button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t">
          <div><Label>Your name</Label><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></div>
          <div><Label>Phone (E.164)</Label><Input className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15558675309" /></div>
        </div>

        <Button className="w-full" size="lg" disabled={!slot || !name || !phone || book.isPending} onClick={() => book.mutate()}>
          {book.isPending ? "Booking…" : "Confirm appointment"}
        </Button>
      </div>
    </div>
  );
}
