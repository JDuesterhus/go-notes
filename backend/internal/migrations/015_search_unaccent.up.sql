-- Search should match "Müller" for "muller" and "Straße" for "strasse".
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is STABLE, which cannot be used in an expression index. Wrap it
-- in an IMMUTABLE function so the GIN index can use the same expression.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
    SELECT public.unaccent('public.unaccent'::regdictionary, $1);
$$;

DROP INDEX IF EXISTS idx_notes_content_text;

CREATE INDEX IF NOT EXISTS idx_notes_content_text_unaccent
    ON notes USING gin (
        to_tsvector('english', immutable_unaccent(coalesce(content_text, '')))
    );
