-- Функция для создания таблицы сообщений, если она не существует
CREATE OR REPLACE FUNCTION create_messages_table_if_not_exists()
RETURNS void AS $$
BEGIN
  -- Проверяем, существует ли расширение uuid-ossp
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  END IF;

  -- Создаем таблицу чатов, если она не существует
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chats') THEN
    CREATE TABLE public.chats (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE INDEX idx_chats_updated_at ON public.chats(updated_at);
  END IF;

  -- Создаем таблицу сообщений, если она не существует
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
    CREATE TABLE public.messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      file_url TEXT,
      file_name TEXT,
      file_type TEXT,
      file_size INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CONSTRAINT valid_role CHECK (role IN ('user', 'assistant'))
    );
    
    CREATE INDEX idx_messages_chat_id ON public.messages(chat_id);
  END IF;

  -- Создаем функцию для обновления updated_at
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $BODY$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $BODY$ LANGUAGE plpgsql';
  END IF;

  -- Создаем триггер для обновления updated_at в таблице chats
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chats') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'update_chats_updated_at' 
      AND tgrelid = 'public.chats'::regclass
    ) THEN
      EXECUTE 'CREATE TRIGGER update_chats_updated_at
      BEFORE UPDATE ON public.chats
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at()';
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
