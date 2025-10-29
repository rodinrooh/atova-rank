-- Fix the updated_at trigger issue

-- Drop ALL existing triggers and functions that might conflict
DROP TRIGGER IF EXISTS matchups_set_updated_at ON public.matchups;
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.matchups;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- Recreate the trigger function with correct syntax
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER matchups_set_updated_at
  BEFORE UPDATE ON public.matchups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
