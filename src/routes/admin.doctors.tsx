import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDoctors, toggleDoctorActive, updateDoctorSchedule } from "@/lib/hospital.functions";
import { DAY_NAMES } from "@/lib/slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Power } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/admin/doctors")({
  component: DoctorsPage,
});

type Doctor = {
  id: string; name: string; specialty: string;
  working_days: string[]; start_time: string; end_time: string; active: boolean;
};

function DoctorsPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listDoctors);
  const toggleFn = useServerFn(toggleDoctorActive);

  const { data, isLoading } = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => (await fetchAll()) as Doctor[],
  });

  const toggle = useMutation({
    mutationFn: async (d: Doctor) => {
      await toggleFn({ data: { id: d.id, active: !d.active } });
    },
    onSuccess: () => { toast.success("Doctor updated"); qc.invalidateQueries({ queryKey: ["doctors"] }); },
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {isLoading && <div className="text-muted-foreground">Loading…</div>}
      {data?.map((d) => (
        <div key={d.id} className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold">{d.name}</div>
              <div className="text-sm text-primary">{d.specialty}</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${d.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              {d.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            {d.working_days.join(", ")} · {d.start_time.slice(0,5)}–{d.end_time.slice(0,5)}
          </div>
          <div className="mt-4 flex gap-2">
            <EditDoctorDialog doctor={d} onSaved={() => qc.invalidateQueries({ queryKey: ["doctors"] })} />
            <Button variant="ghost" size="sm" onClick={() => toggle.mutate(d)}>
              <Power className="w-4 h-4 mr-1" /> {d.active ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EditDoctorDialog({ doctor, onSaved }: { doctor: Doctor; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<string[]>(doctor.working_days);
  const [start, setStart] = useState(doctor.start_time.slice(0, 5));
  const [end, setEnd] = useState(doctor.end_time.slice(0, 5));
  const updateFn = useServerFn(updateDoctorSchedule);

  const save = useMutation({
    mutationFn: async () => {
      await updateFn({ data: { id: doctor.id, working_days: days, start_time: start, end_time: end } });
    },
    onSuccess: () => { toast.success("Schedule updated"); setOpen(false); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="w-4 h-4 mr-1" /> Edit schedule</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{doctor.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Working days</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {DAY_NAMES.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                    className={`px-3 py-1.5 rounded-md text-sm border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
                  >{d}</button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>End</Label><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
