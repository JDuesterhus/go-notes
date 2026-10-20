DROP INDEX IF EXISTS idx_notes_public_id;
ALTER TABLE notes DROP COLUMN IF EXISTS public_id;
