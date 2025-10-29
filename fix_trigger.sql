-- Drop the broken trigger
DROP TRIGGER IF EXISTS matchups_set_updated_at ON matchups;
DROP FUNCTION IF EXISTS set_updated_at();

-- Recreate it correctly
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER matchups_set_updated_at
BEFORE UPDATE ON matchups
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
