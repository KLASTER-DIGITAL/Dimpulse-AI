-- Функция для выполнения SQL-запросов
CREATE OR REPLACE FUNCTION run_sql(sql_query text)
RETURNS void AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
