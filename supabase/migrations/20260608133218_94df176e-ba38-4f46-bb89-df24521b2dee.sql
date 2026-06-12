
-- doctors
CREATE TABLE public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  working_days TEXT[] NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctors TO anon, authenticated;
GRANT ALL ON public.doctors TO service_role;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctors public read" ON public.doctors FOR SELECT USING (true);
CREATE POLICY "doctors public write" ON public.doctors FOR INSERT WITH CHECK (true);
CREATE POLICY "doctors public update" ON public.doctors FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "doctors public delete" ON public.doctors FOR DELETE USING (true);

-- patients
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patients_phone_idx ON public.patients (phone);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO anon, authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patients public read" ON public.patients FOR SELECT USING (true);
CREATE POLICY "patients public write" ON public.patients FOR INSERT WITH CHECK (true);
CREATE POLICY "patients public update" ON public.patients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "patients public delete" ON public.patients FOR DELETE USING (true);

-- appointments
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  sms_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Prevent double-booking: same doctor can't have two scheduled appts at the same slot
CREATE UNIQUE INDEX appointments_no_double_booking
  ON public.appointments (doctor_id, appointment_date, appointment_time)
  WHERE status = 'scheduled';
CREATE INDEX appointments_doctor_date_idx ON public.appointments (doctor_id, appointment_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO anon, authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments public read" ON public.appointments FOR SELECT USING (true);
CREATE POLICY "appointments public write" ON public.appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "appointments public update" ON public.appointments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "appointments public delete" ON public.appointments FOR DELETE USING (true);

-- Seed 10 doctors
INSERT INTO public.doctors (name, specialty, working_days, start_time, end_time) VALUES
('Dr. Aanya Kapoor',  'Cardiologist',      ARRAY['Mon','Tue','Wed','Thu','Fri'], '09:00', '17:00'),
('Dr. Rohan Mehta',   'Neurologist',       ARRAY['Mon','Wed','Fri'],             '10:00', '16:00'),
('Dr. Priya Sharma',  'Gynecologist',      ARRAY['Tue','Wed','Thu','Sat'],       '09:00', '15:00'),
('Dr. Arjun Verma',   'General Physician', ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'], '08:00', '18:00'),
('Dr. Neha Iyer',     'Radiologist',       ARRAY['Mon','Tue','Thu','Fri'],       '09:00', '17:00'),
('Dr. Vikram Singh',  'Orthopedic',        ARRAY['Mon','Wed','Fri','Sat'],       '10:00', '17:00'),
('Dr. Sara Khan',     'Dermatologist',     ARRAY['Tue','Wed','Thu','Fri'],       '11:00', '18:00'),
('Dr. Karan Patel',   'Pediatrician',      ARRAY['Mon','Tue','Wed','Thu','Fri'], '09:00', '16:00'),
('Dr. Meera Nair',    'ENT Specialist',    ARRAY['Mon','Wed','Thu','Sat'],       '09:00', '15:00'),
('Dr. Ishaan Gupta',  'Ophthalmologist',   ARRAY['Tue','Thu','Fri','Sat'],       '10:00', '17:00');
