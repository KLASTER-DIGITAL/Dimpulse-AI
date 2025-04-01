-- Полный набор SQL-функций для работы с данными в Supabase

-- Вспомогательные функции для статистики

-- Получение общего количества пользователей
CREATE OR REPLACE FUNCTION get_total_users()
RETURNS INTEGER AS $$
DECLARE
    total INTEGER;
BEGIN
    SELECT COUNT(*) INTO total FROM users;
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Получение общего количества чатов
CREATE OR REPLACE FUNCTION get_total_chats()
RETURNS INTEGER AS $$
DECLARE
    total INTEGER;
BEGIN
    SELECT COUNT(*) INTO total FROM chats;
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Получение общего количества сообщений
CREATE OR REPLACE FUNCTION get_total_messages()
RETURNS INTEGER AS $$
DECLARE
    total INTEGER;
BEGIN
    SELECT COUNT(*) INTO total FROM messages;
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Получение количества активных пользователей за последние 24 часа
CREATE OR REPLACE FUNCTION get_active_users_last_24h()
RETURNS INTEGER AS $$
DECLARE
    active_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO active_count 
    FROM users 
    WHERE last_active > NOW() - INTERVAL '24 hours';
    RETURN active_count;
END;
$$ LANGUAGE plpgsql;

-- Получение количества активных чатов за последние 24 часа
CREATE OR REPLACE FUNCTION get_active_chats_last_24h()
RETURNS INTEGER AS $$
DECLARE
    active_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO active_count 
    FROM chats 
    WHERE last_active > NOW() - INTERVAL '24 hours';
    RETURN active_count;
END;
$$ LANGUAGE plpgsql;

-- Получение количества сообщений по дням за указанный период
CREATE OR REPLACE FUNCTION get_messages_per_day(days_count INTEGER)
RETURNS TABLE(date TEXT, count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') as date,
        COUNT(*) as count
    FROM messages
    WHERE created_at > NOW() - (days_count || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY DATE_TRUNC('day', created_at);
END;
$$ LANGUAGE plpgsql;

-- Получение топ-N чатов по количеству сообщений
CREATE OR REPLACE FUNCTION get_top_chats(top_count INTEGER)
RETURNS TABLE("chatId" TEXT, title TEXT, "messageCount" BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as "chatId",
        c.title,
        COUNT(m.id) as "messageCount"
    FROM chats c
    JOIN messages m ON c.id = m.chat_id
    GROUP BY c.id, c.title
    ORDER BY COUNT(m.id) DESC
    LIMIT top_count;
END;
$$ LANGUAGE plpgsql;

-- Основные функции для работы с данными

-- Получение статистики
CREATE OR REPLACE FUNCTION get_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'totalUsers', get_total_users(),
        'totalChats', get_total_chats(),
        'totalMessages', get_total_messages(),
        'activeUsersLast24h', get_active_users_last_24h(),
        'activeChatsLast24h', get_active_chats_last_24h(),
        'messagesPerDay', (SELECT json_agg(row_to_json(t)) FROM get_messages_per_day(7) t),
        'topChats', (SELECT json_agg(row_to_json(t)) FROM get_top_chats(5) t)
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Получение чатов пользователя
CREATE OR REPLACE FUNCTION get_user_chats(user_id INTEGER)
RETURNS SETOF chats AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM chats 
    WHERE chats.user_id = user_id
    ORDER BY last_active DESC;
END;
$$ LANGUAGE plpgsql;

-- Получение всех чатов (для неавторизованных пользователей)
CREATE OR REPLACE FUNCTION get_anonymous_chats()
RETURNS SETOF chats AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM chats 
    WHERE chats.user_id IS NULL
    ORDER BY last_active DESC;
END;
$$ LANGUAGE plpgsql;

-- Получение сообщений чата
CREATE OR REPLACE FUNCTION get_chat_messages(chat_id_param TEXT)
RETURNS SETOF messages AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM messages 
    WHERE messages.chat_id = chat_id_param
    ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Обновление названия чата
CREATE OR REPLACE FUNCTION update_chat_title(chat_id_param TEXT, new_title TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE chats
    SET title = new_title, last_active = NOW()
    WHERE id = chat_id_param;
END;
$$ LANGUAGE plpgsql;

-- Получение диалогов с пагинацией
CREATE OR REPLACE FUNCTION get_dialog_history(limit_count INTEGER, offset_count INTEGER)
RETURNS TABLE(chats JSON, total_count BIGINT) AS $$
DECLARE
    total BIGINT;
BEGIN
    SELECT COUNT(*) INTO total FROM chats;
    
    RETURN QUERY
    SELECT 
        json_agg(row_to_json(c)) as chats,
        total as total_count
    FROM (
        SELECT * FROM chats 
        ORDER BY last_active DESC
        LIMIT limit_count OFFSET offset_count
    ) c;
END;
$$ LANGUAGE plpgsql;

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