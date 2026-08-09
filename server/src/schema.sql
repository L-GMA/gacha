CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('admin', 'default', 'custom')),
  permissions JSONB NOT NULL DEFAULT '{"invite":false,"manage_channels":false,"manage_roles":false}',
  color TEXT,
  highlight BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login TEXT UNIQUE NOT NULL,
  nickname TEXT,
  avatar TEXT,
  bio TEXT,
  banned BOOLEAN NOT NULL DEFAULT false,
  password_hash TEXT NOT NULL,
  token_version INT NOT NULL DEFAULT 0,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_by UUID REFERENCES users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'voice')),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_permissions (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_send BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (channel_id, role_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'dm' CHECK (kind IN ('group', 'dm')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  closed_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_messages_channel_time ON channel_messages(channel_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pass_voice_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  password_hash TEXT,
  max_participants INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pass_voice_channel_roles (
  channel_id UUID NOT NULL REFERENCES pass_voice_channels(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, role_id)
);

CREATE TABLE IF NOT EXISTS pass_voice_presence (
  channel_id UUID NOT NULL REFERENCES pass_voice_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

DO $$
BEGIN
  IF (SELECT count(*) FROM categories) = 0 THEN
    INSERT INTO categories (name, position) VALUES ('Текстовые', 0);
    INSERT INTO categories (name, position) VALUES ('Голосовые', 1);
    INSERT INTO channels (category_id, name, type, position)
      SELECT id, 'общий', 'text', 0 FROM categories WHERE name = 'Текстовые';
    INSERT INTO channels (category_id, name, type, position)
      SELECT id, 'Общий', 'voice', 0 FROM categories WHERE name = 'Голосовые';
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS join_sound_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS leave_sound_url TEXT;
