import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { users, chats, messages } from '../shared/schema';

// Загружаем переменные окружения
dotenv.config({ path: '.env.production' });

// Получаем URL и ключ Supabase из переменных окружения
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qhmiunivgfwngggxijjy.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Проверяем наличие ключей
if (!supabaseUrl || !supabaseKey) {
  console.error('Ошибка: Не найдены переменные окружения SUPABASE_URL и/или SUPABASE_KEY');
  process.exit(1);
}

// Создаем клиент Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Ожидаемая структура таблиц
const expectedTables = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'integer' },
      { name: 'username', type: 'text' },
      { name: 'email', type: 'text' },
      { name: 'password', type: 'text' },
      { name: 'last_active', type: 'timestamp' }
    ]
  },
  {
    name: 'chats',
    columns: [
      { name: 'id', type: 'text' },
      { name: 'title', type: 'text' },
      { name: 'user_id', type: 'integer' },
      { name: 'created_at', type: 'timestamp' },
      { name: 'last_active', type: 'timestamp' }
    ]
  },
  {
    name: 'messages',
    columns: [
      { name: 'id', type: 'integer' },
      { name: 'chat_id', type: 'text' },
      { name: 'role', type: 'text' },
      { name: 'content', type: 'text' },
      { name: 'created_at', type: 'timestamp' },
      { name: 'file_url', type: 'text' },
      { name: 'file_name', type: 'text' },
      { name: 'file_type', type: 'text' },
      { name: 'file_size', type: 'integer' }
    ]
  }
];

// Функция для проверки существования таблицы
async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    // Пробуем выполнить простой запрос к таблице
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    // Если ошибка содержит 'relation "public.tableName" does not exist', значит таблица не существует
    if (error && error.message.includes('does not exist')) {
      return false;
    }

    // Если нет ошибки или ошибка другого типа (например, нет прав доступа), считаем что таблица существует
    return true;
  } catch (e) {
    console.error(`Ошибка при проверке таблицы ${tableName}:`, e);
    return false;
  }
}

// Функция для проверки структуры таблицы
async function checkTableStructure(tableName: string, expectedColumns: any[]): Promise<{valid: boolean, missing: string[], extra: string[]}> {
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_schema', 'public')
    .eq('table_name', tableName);

  if (error) {
    console.error(`Ошибка при проверке структуры таблицы ${tableName}:`, error.message);
    return { valid: false, missing: [], extra: [] };
  }

  if (!data) {
    return { valid: false, missing: expectedColumns.map(col => col.name), extra: [] };
  }

  // Проверяем наличие всех ожидаемых колонок
  const actualColumns = data.map(col => ({ name: col.column_name, type: col.data_type }));
  const missingColumns = expectedColumns.filter(expected => 
    !actualColumns.some(actual => actual.name === expected.name)
  ).map(col => col.name);

  // Проверяем наличие лишних колонок
  const extraColumns = actualColumns.filter(actual => 
    !expectedColumns.some(expected => expected.name === actual.name)
  ).map(col => col.name);

  return {
    valid: missingColumns.length === 0,
    missing: missingColumns,
    extra: extraColumns
  };
}

// Главная функция проверки
async function checkDatabaseSchema() {
  console.log('Проверка схемы базы данных Supabase...');
  
  let allValid = true;
  
  for (const table of expectedTables) {
    const exists = await checkTableExists(table.name);
    
    if (!exists) {
      console.error(`❌ Таблица '${table.name}' не найдена в базе данных`);
      allValid = false;
      continue;
    }
    
    console.log(`✓ Таблица '${table.name}' существует`);
    
    const { valid, missing, extra } = await checkTableStructure(table.name, table.columns);
    
    if (!valid) {
      console.error(`❌ Структура таблицы '${table.name}' не соответствует ожидаемой`);
      if (missing.length > 0) {
        console.error(`   Отсутствуют колонки: ${missing.join(', ')}`);
      }
      allValid = false;
    } else {
      console.log(`✓ Структура таблицы '${table.name}' соответствует ожидаемой`);
    }
    
    if (extra.length > 0) {
      console.warn(`⚠️ Обнаружены дополнительные колонки в таблице '${table.name}': ${extra.join(', ')}`);
    }
  }
  
  if (allValid) {
    console.log('✅ Схема базы данных полностью соответствует ожидаемой структуре');
  } else {
    console.error('❌ Обнаружены несоответствия в схеме базы данных');
  }
}

// Запускаем проверку
checkDatabaseSchema()
  .catch(error => {
    console.error('Ошибка при проверке схемы базы данных:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
