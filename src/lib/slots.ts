// Pure helpers for appointment slot logic. Safe to import anywhere.
export const SLOT_MINUTES = 30;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const SPECIALTIES = [
  "Cardiologist",
  "Neurologist",
  "Gynecologist",
  "General Physician",
  "Radiologist",
  "Orthopedic",
  "Dermatologist",
  "Pediatrician",
  "ENT Specialist",
  "Ophthalmologist",
] as const;

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function generateSlots(start: string, end: string): string[] {
  const out: string[] = [];
  const startM = timeToMinutes(start);
  const endM = timeToMinutes(end);
  for (let m = startM; m + SLOT_MINUTES <= endM; m += SLOT_MINUTES) {
    out.push(minutesToTime(m));
  }
  return out;
}

export function dayNameFromDate(dateStr: string): string {
  // dateStr "YYYY-MM-DD"
  const d = new Date(dateStr + "T00:00:00");
  return DAY_NAMES[d.getDay()];
}

export function formatTime12h(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${period}`;
}
