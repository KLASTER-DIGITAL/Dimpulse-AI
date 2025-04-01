-- Функция для выполнения произвольного SQL-запроса из API
CREATE OR REPLACE FUNCTION run_sql(sql_query TEXT)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  BEGIN
    EXECUTE sql_query;
    result := 'Query executed successfully';
  EXCEPTION WHEN OTHERS THEN
    result := 'Error: ' || SQLERRM;
  END;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Проверяем, существует ли таблица users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255), -- Добавляем поле email для поддержки Supabase Auth
  password VARCHAR(255) NOT NULL, -- Используется только для совместимости, не хранит реальные пароли
  last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Проверяем, существует ли таблица chats
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Проверяем, существует ли таблица messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Проверяем, существует ли таблица files
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(100) NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Проверяем, существует ли таблица settings
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  webhook_url TEXT,
  webhook_enabled BOOLEAN DEFAULT TRUE,
  iframe_enabled BOOLEAN DEFAULT FALSE,
  iframe_theme VARCHAR(20) DEFAULT 'dark',
  widget_enabled BOOLEAN DEFAULT TRUE,
  widget_position VARCHAR(10) DEFAULT 'left',
  widget_theme VARCHAR(20) DEFAULT 'dark',
  widget_font_size INTEGER DEFAULT 12,
  widget_width INTEGER DEFAULT 400,
  widget_height INTEGER DEFAULT 500,
  widget_text TEXT DEFAULT 'Чем еще могу помочь?',
  ui_enabled BOOLEAN DEFAULT FALSE,
  ui_color_primary VARCHAR(20) DEFAULT '#19c37d',
  ui_color_secondary VARCHAR(20) DEFAULT '#f9fafb',
  ui_color_accent VARCHAR(20) DEFAULT '#6366f1',
  ui_rounded_corners BOOLEAN DEFAULT TRUE,
  ui_shadows BOOLEAN DEFAULT TRUE,
  ui_animations BOOLEAN DEFAULT TRUE,
  db_enabled BOOLEAN DEFAULT TRUE,
  db_type VARCHAR(20) DEFAULT 'supabase',
  supabase_tables_messages VARCHAR(50) DEFAULT 'messages',
  supabase_tables_chats VARCHAR(50) DEFAULT 'chats',
  supabase_tables_users VARCHAR(50) DEFAULT 'users',
  supabase_tables_files VARCHAR(50) DEFAULT 'files',
  supabase_schema VARCHAR(50) DEFAULT 'public',
  supabase_auto_migrate BOOLEAN DEFAULT TRUE
);

-- Добавляем демо-данные, если таблица settings пуста
INSERT INTO settings (
  webhook_url,
  webhook_enabled,
  iframe_enabled,
  iframe_theme,
  widget_enabled,
  widget_position,
  widget_theme,
  widget_font_size,
  widget_width,
  widget_height,
  widget_text,
  ui_enabled,
  ui_color_primary,
  ui_color_secondary,
  ui_color_accent,
  ui_rounded_corners,
  ui_shadows,
  ui_animations,
  db_enabled,
  db_type
)
SELECT
  'https://n8n.klaster.digital/webhook-test/4a1fed67-dcfb-4eb8-a71b-d47b1d651509',
  TRUE,
  FALSE,
  'dark',
  TRUE,
  'left',
  'dark',
  12,
  400,
  500,
  'Чем еще могу помочь?',
  FALSE,
  '#19c37d',
  '#f9fafb',
  '#6366f1',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  'supabase'
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- Добавляем админского пользователя, если таблица users пуста
INSERT INTO users (username, email, password)
SELECT 'admin', 'admin@example.com', 'admin123'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

-- Создаем индексы для улучшения производительности
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_files_message_id ON files(message_id);

-- Функция для получения статистики использования системы
CREATE OR REPLACE FUNCTION get_usage_stats()
RETURNS JSON AS $$
DECLARE
  total_users INTEGER;
  total_chats INTEGER;
  total_messages INTEGER;
  active_users_24h INTEGER;
  active_chats_24h INTEGER;
  messages_per_day JSON;
  top_chats JSON;
BEGIN
  -- Общее количество пользователей
  SELECT COUNT(*) INTO total_users FROM users;
  
  -- Общее количество чатов
  SELECT COUNT(*) INTO total_chats FROM chats;
  
  -- Общее количество сообщений
  SELECT COUNT(*) INTO total_messages FROM messages;
  
  -- Активные пользователи за последние 24 часа
  SELECT COUNT(*) INTO active_users_24h 
  FROM users 
  WHERE last_active > NOW() - INTERVAL '24 hours';
  
  -- Активные чаты за последние 24 часа
  SELECT COUNT(*) INTO active_chats_24h 
  FROM chats 
  WHERE last_active > NOW() - INTERVAL '24 hours';
  
  -- Количество сообщений по дням (за последнюю неделю)
  SELECT json_agg(msg_stats) INTO messages_per_day
  FROM (
    SELECT 
      TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') as date,
      COUNT(*) as count
    FROM messages
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY DATE_TRUNC('day', created_at)
  ) as msg_stats;
  
  -- Топ-5 чатов по количеству сообщений
  SELECT json_agg(chat_stats) INTO top_chats
  FROM (
    SELECT 
      c.id as "chatId",
      c.title,
      COUNT(m.id) as "messageCount"
    FROM chats c
    JOIN messages m ON c.id = m.chat_id
    GROUP BY c.id, c.title
    ORDER BY COUNT(m.id) DESC
    LIMIT 5
  ) as chat_stats;
  
  -- Возвращаем статистику в формате JSON
  RETURN json_build_object(
    'totalUsers', total_users,
    'totalChats', total_chats,
    'totalMessages', total_messages,
    'activeUsersLast24h', active_users_24h,
    'activeChatsLast24h', active_chats_24h,
    'messagesPerDay', COALESCE(messages_per_day, '[]'::json),
    'topChats', COALESCE(top_chats, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггерная функция для обновления last_active в чате при добавлении сообщения
CREATE OR REPLACE FUNCTION update_chat_last_active()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chats
  SET last_active = CURRENT_TIMESTAMP
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для обновления last_active в чате
DROP TRIGGER IF EXISTS trigger_update_chat_last_active ON messages;
CREATE TRIGGER trigger_update_chat_last_active
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_chat_last_active();

-- Получение данных чата с учетом пагинации
CREATE OR REPLACE FUNCTION get_dialog_history(p_limit INTEGER DEFAULT 10, p_offset INTEGER DEFAULT 0)
RETURNS JSON AS $$
DECLARE
  chats_data JSON;
  total_count INTEGER;
BEGIN
  -- Получаем общее количество чатов
  SELECT COUNT(*) INTO total_count FROM chats;
  
  -- Получаем данные чатов с пагинацией
  SELECT json_agg(c) INTO chats_data
  FROM (
    SELECT 
      id,
      title,
      user_id as "userId",
      created_at as "createdAt",
      last_active as "lastActive"
    FROM chats
    ORDER BY last_active DESC
    LIMIT p_limit OFFSET p_offset
  ) c;
  
  -- Возвращаем результат
  RETURN json_build_object(
    'chats', COALESCE(chats_data, '[]'::json),
    'totalCount', total_count
  );
END;
$$ LANGUAGE plpgsql;
