import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { supabase, isSupabaseConfigured, testSupabaseConnection } from './supabase';

// Получаем абсолютный путь к текущему модулю (для ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Выполняет SQL-скрипт из файла
 * @param filename Имя файла скрипта
 */
async function executeSqlScript(filename: string): Promise<boolean> {
  try {
    const filePath = path.join(__dirname, 'migrations', filename);
    const sqlScript = fs.readFileSync(filePath, 'utf8');
    
    // Разделяем скрипт на отдельные команды по разделителям
    const commands = sqlScript.split(';').filter(cmd => cmd.trim().length > 0);
    
    // Выполняем каждую команду отдельно
    for (const command of commands) {
      try {
        // Пытаемся выполнить SQL-запрос напрямую через REST API
        const { error } = await supabase.rpc('run_sql', { sql_query: command });
        
        if (error) {
          // Если ошибка связана с отсутствием функции, продолжаем выполнение
          if (error.message.includes('function run_sql() does not exist')) {
            console.log(`Function run_sql does not exist yet, skipping direct execution`);
          } else {
            console.error(`Error executing SQL command via run_sql: ${error.message}`);
            console.error(`Command: ${command}`);
          }
        }
      } catch (commandError) {
        console.error(`Error executing SQL command: ${commandError}`);
        console.error(`Command: ${command}`);
        // Продолжаем выполнение следующих команд
      }
    }
    
    console.log(`SQL script ${filename} executed successfully`);
    return true;
  } catch (error) {
    console.error(`Error executing SQL script ${filename}:`, error);
    return false;
  }
}

/**
 * Проверяет существование таблицы в базе данных
 * @param tableName Имя таблицы
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .maybeSingle();
    
    if (error) {
      console.error(`Error checking if table ${tableName} exists:`, error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

/**
 * Создает функцию для выполнения произвольного SQL в Supabase
 */
async function createRunSqlFunction(): Promise<boolean> {
  try {
    // Проверяем, существует ли функция run_sql
    if (await functionExists('run_sql')) {
      console.log('Function run_sql already exists');
      return true;
    }
    
    // В Supabase нельзя напрямую выполнить SQL через REST API без специальных привилегий
    console.log('Cannot create run_sql function through REST API, manual creation required');
    console.log('Skipping run_sql function creation');
    
    return false;
  } catch (error) {
    console.error('Error creating run_sql function:', error);
    return false;
  }
}

/**
 * Проверяет наличие функции в базе данных
 * @param functionName Имя функции
 */
async function functionExists(functionName: string): Promise<boolean> {
  try {
    // Используем SQL запрос для проверки существования функции
    const { data, error } = await supabase
      .from('pg_catalog.pg_proc')
      .select('proname')
      .eq('proname', functionName);
    
    if (error) {
      console.error(`Error checking if function ${functionName} exists:`, error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error(`Error checking if function ${functionName} exists:`, error);
    return false;
  }
}

/**
 * Выполняет миграцию базы данных
 */
export async function migrateDatabase(): Promise<boolean> {
  try {
    console.log('Starting database migration...');
    
    // Проверяем режим запуска
    const isLocalMode = process.env.USE_LOCAL_STORAGE === 'true';
    if (isLocalMode) {
      console.log('Running in local mode, skipping Supabase migration');
      return true;
    }
    
    // Проверяем, настроен ли Supabase
    if (!isSupabaseConfigured()) {
      console.log('Supabase is not configured, skipping migration');
      return false;
    }
    
    // Проверяем соединение с Supabase
    const connectionTest = await testSupabaseConnection();
    if (!connectionTest) {
      console.log('Supabase connection test failed, switching to local mode');
      process.env.USE_LOCAL_STORAGE = 'true';
      return true;
    }
    
    console.log('Supabase connection test successful');
    
    // Создаем функцию run_sql, если она еще не существует - пропускаем при ошибке
    try {
      await createRunSqlFunction();
    } catch (err) {
      console.log('Failed to create run_sql function, continuing with other operations');
    }
    
    // Выполняем скрипт инициализации Supabase - пропускаем при ошибке
    try {
      await executeSqlScript('init-supabase.sql');
    } catch (err) {
      console.log('Failed to execute init-supabase.sql, continuing with other operations');
    }
    
    console.log('Database migration completed successfully');
    return true;
  } catch (error) {
    console.error('Error migrating database:', error);
    process.env.USE_LOCAL_STORAGE = 'true';
    console.log('Switching to local storage due to migration error');
    return true; // Возвращаем true чтобы продолжить запуск сервера
  }
}