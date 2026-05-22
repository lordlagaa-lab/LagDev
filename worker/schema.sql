-- Fluence Lead Scanner - D1 Schema
-- Run: wrangler d1 execute fluence-leads --file=./worker/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'rep' CHECK(role IN ('rep','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  show_id INTEGER,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  linkedin TEXT NOT NULL DEFAULT '',
  temperature TEXT NOT NULL DEFAULT '' CHECK(temperature IN ('','hot','warm','cold')),
  deal_size TEXT NOT NULL DEFAULT '',
  timeline TEXT NOT NULL DEFAULT '',
  products TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  assigned_to TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  show_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_show_id ON leads(show_id);
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company);

-- Seed default users (password: "fluence2024" hashed with bcrypt)
-- In production, users register or admin creates them
INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES
  ('Alex van der Berg', 'alex@fluence.com', '$2b$10$placeholder', 'rep'),
  ('Sophie Müller', 'sophie@fluence.com', '$2b$10$placeholder', 'rep'),
  ('James Okafor', 'james@fluence.com', '$2b$10$placeholder', 'rep'),
  ('Priya Sharma', 'priya@fluence.com', '$2b$10$placeholder', 'rep'),
  ('Admin', 'admin@fluence.com', '$2b$10$placeholder', 'admin');

-- Seed default show
INSERT OR IGNORE INTO shows (name) VALUES ('ISE 2026');
