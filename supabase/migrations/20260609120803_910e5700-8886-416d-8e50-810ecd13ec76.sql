DROP POLICY IF EXISTS "patients public delete" ON public.patients;
DROP POLICY IF EXISTS "patients public read" ON public.patients;
DROP POLICY IF EXISTS "patients public update" ON public.patients;
DROP POLICY IF EXISTS "patients public write" ON public.patients;

DROP POLICY IF EXISTS "appointments public delete" ON public.appointments;
DROP POLICY IF EXISTS "appointments public read" ON public.appointments;
DROP POLICY IF EXISTS "appointments public update" ON public.appointments;
DROP POLICY IF EXISTS "appointments public write" ON public.appointments;

DROP POLICY IF EXISTS "doctors public delete" ON public.doctors;
DROP POLICY IF EXISTS "doctors public update" ON public.doctors;
DROP POLICY IF EXISTS "doctors public write" ON public.doctors;
