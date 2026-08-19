-- Manual migration: organizational structure (Branch → Department → Section)
-- Run this against the PRODUCTION database before/with the next publish.
-- (Development already has these applied.)

CREATE TABLE IF NOT EXISTS branches (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  head_id integer,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id serial PRIMARY KEY,
  branch_id integer NOT NULL,
  name text NOT NULL,
  description text,
  head_id integer,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sections (
  id serial PRIMARY KEY,
  department_id integer NOT NULL,
  name text NOT NULL,
  type text NOT NULL, -- Laboratory | Office | Core
  description text,
  head_id integer,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE scientists ADD COLUMN IF NOT EXISTS department_id integer;
ALTER TABLE scientists ADD COLUMN IF NOT EXISTS section_id integer;
