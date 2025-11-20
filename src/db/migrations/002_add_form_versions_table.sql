CREATE TABLE IF NOT EXISTS form_versions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    form_schema TEXT NOT NULL,
    created_at TEXT NOT NULL,
    is_active INTEGER NOT NULL,
    UNIQUE (form_id, version_number)
);