DROP INDEX IF EXISTS idx_notes_content_text_unaccent;

CREATE INDEX IF NOT EXISTS idx_notes_content_text
    ON notes USING gin (to_tsvector('english', content_text));

DROP FUNCTION IF EXISTS immutable_unaccent(text);
