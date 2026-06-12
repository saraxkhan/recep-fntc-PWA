import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createPatient } from "@/lib/hospital.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

export function NewPatientDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const qc = useQueryClient();
  const createFn = useServerFn(createPatient);

  const create = useMutation({
    mutationFn: async () => createFn({ data: { name: name.trim(), phone: phone.trim() } }),
    onSuccess: (r) => {
      toast.success(r.existed ? "Patient already existed" : "Patient added");
      qc.invalidateQueries({ queryKey: ["patients"] });
      setOpen(false);
      setName(""); setPhone("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="w-4 h-4 mr-1" /> New patient</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a patient</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></div>
          <div><Label>Phone (E.164)</Label><Input className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15558675309" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim() || !phone.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Save patient"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
