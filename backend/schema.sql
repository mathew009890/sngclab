CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS semesters (
  id SMALLINT PRIMARY KEY CHECK (id > 0),
  name TEXT NOT NULL
);
INSERT INTO semesters (id, name) SELECT g, 'Semester ' || g FROM generate_series(1,6) g ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS labs (
  id SERIAL PRIMARY KEY,
  semester_id SMALLINT NOT NULL REFERENCES semesters(id),
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS labs_semester_idx ON labs(semester_id);
CREATE TABLE IF NOT EXISTS programs (
  id SERIAL PRIMARY KEY,
  lab_id INT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  exercise_no INT NOT NULL CHECK (exercise_no > 0),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  language TEXT NOT NULL DEFAULT 'text',
  aim TEXT NOT NULL DEFAULT '',
  algorithm TEXT NOT NULL DEFAULT '',
  source_code TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lab_id, exercise_no),
  search tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(aim,'') || ' ' || coalesce(source_code,''))
  ) STORED
);
CREATE INDEX IF NOT EXISTS programs_lab_idx ON programs(lab_id, exercise_no);
CREATE INDEX IF NOT EXISTS programs_search_idx ON programs USING GIN(search);
CREATE TABLE IF NOT EXISTS program_files (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_program_idx ON program_files(program_id);
CREATE TABLE IF NOT EXISTS session (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session(expire);
