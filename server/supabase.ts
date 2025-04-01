import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Получаем URL и ключ Supabase из переменных окружения
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qhmiunivgfwngggxijjy.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFobWl1bml2Z2Z3bmdnZ3hpamp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0ODY4NTUsImV4cCI6MjA1OTA2Mjg1NX0.pxYIqfEgrbudaFfh_ENu3U8GpNEexan2fkM8E_r-tJs';

// Переменная для хранения ссылки на Supabase клиент
let supabaseInstance: SupabaseClient | null = null;

// Создаем клиент Supabase
try {
  supabaseInstance = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
}

// Функция для получения инстанса Supabase
export const getSupabase = (): SupabaseClient | null => {
  return supabaseInstance;
};



export default supabaseInstance;

// Экспортируем клиент Supabase или dummy объект, если клиент не инициализирован
export const supabase: SupabaseClient = supabaseInstance || {
  from: () => ({ 
    select: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    insert: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    update: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    delete: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
  }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    signUp: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    signIn: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    signOut: () => Promise.resolve({ error: null }),
  },
} as unknown as SupabaseClient;

// Проверяем, настроен ли Supabase
export const isSupabaseConfigured = (): boolean => {
  // Проверяем наличие ключей Supabase или переменных окружения Vercel
  const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);
  const isVercel = process.env.VERCEL === '1';
  
  // Если запуск на Vercel, то считаем, что Supabase настроен
  if (isVercel) {
    console.log('Running on Vercel, assuming Supabase is configured');
    return true;
  }
  
  return hasSupabaseConfig && Boolean(supabaseInstance);
};

// Проверка подключения к Supabase
export const testSupabaseConnection = async () => {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase is not configured, skipping connection test');
    return { success: false, error: 'Клиент Supabase не инициализирован' };
  }

  try {
    // Проверяем подключение через аутентификацию
    const { data: authData, error: authError } = await supabase.auth.getSession();
    
    if (authError) {
      console.error('Error connecting to Supabase authentication:', authError);
      return { success: false, error: authError.message };
    }
    
    // Проверяем доступ к информационной схеме для проверки таблиц
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .limit(1);
    
    if (error) {
      console.error('Error connecting to Supabase tables:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error testing Supabase connection:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
};