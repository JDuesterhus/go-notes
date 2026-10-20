ALTER TABLE notes ADD COLUMN public_id VARCHAR(32);

UPDATE notes
SET public_id = md5(random()::text || clock_timestamp()::text || id::text)
WHERE public_id IS NULL;

ALTER TABLE notes ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX idx_notes_public_id ON notes(public_id);
