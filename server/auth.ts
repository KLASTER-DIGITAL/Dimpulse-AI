import { supabase } from './supabase';
import { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';
import { storage } from './storage';

// Функция для создания административного пользователя
export async function createAdminUser() {
  try {
    console.log('Creating admin user...');
    let adminUser = await storage.getUserByUsername('admin');
    
    if (!adminUser) {
      adminUser = await storage.createUser({
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123'
      });
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists');
    }
    return true;
  } catch (error) {
    console.error('Error creating admin user:', error);
    return false;
  }
}

/**
 * Аутентификация пользователя
 * @param username Имя пользователя
 * @param password Пароль
 * @returns Данные пользователя или null в случае ошибки
 */
export async function authenticateUser(username: string, password: string): Promise<{user: User, token: string} | null> {
  try {
    // Специальная обработка для пользователя admin
    if (username === 'admin') {
      // Проверяем пароль
      if (password !== 'admin123') {
        console.error('Неверный пароль для администратора');
        return null;
      }
      
      // Получаем пользователя из нашей таблицы
      let user = await storage.getUserByUsername('admin');
      
      // Если пользователя admin нет, создаем его
      if (!user) {
        console.log('Создаем пользователя admin в хранилище');
        user = await storage.createUser({
          username: 'admin',
          email: 'admin@example.com',
          password: 'admin123'
        });
        
        if (!user) {
          console.error('Не удалось создать пользователя admin');
          return null;
        }
      }
      
      // Генерируем простой токен
      const token = 'admin_token_' + Date.now();
      
      // Добавляем токен в список известных токенов
      adminTokens.add(token);
      
      return {
        user,
        token
      };
    }
    
    // Для остальных пользователей используем Supabase Auth
    try {
      // Проверяем, что Supabase настроен
      if (!supabase) {
        throw new Error('Supabase not configured');
      }
      
      // Пытаемся авторизоваться с помощью Supabase Auth
      // Проверяем, является ли username email-адресом
      const email = username.includes('@') ? username : `${username}@chatapp.example.com`;
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });
      
      if (error || !data.user) {
        console.error('Authentication error:', error);
        return null;
      }
      
      // Получаем пользователя из нашей БД или создаем его
      let user = await storage.getUserByUsername(username);
      
      if (!user) {
        // Создаем нового пользователя
        user = await storage.createUser({
          username,
          password: '********' // Не храним реальный пароль, он хранится в Supabase Auth
        });
        
        if (!user) {
          console.error('Не удалось создать пользователя в системе хранения');
          return null;
        }
      }
      
      return {
        user,
        token: data.session?.access_token || ''
      };
    } catch (error) {
      console.error('Supabase Auth error:', error);
      // Если проблема с Supabase, пользователь все равно может авторизоваться в локальной системе
      let user = await storage.getUserByUsername(username);
      
      if (user) {
        // Генерируем локальный токен
        const token = 'local_token_' + Date.now();
        // Сохраняем токен в карту локальных токенов
        localTokens.set(token, username);
        return { user, token };
      }
      
      return null;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

/**
 * Регистрация нового пользователя
 * @param username Имя пользователя
 * @param email Email пользователя
 * @param password Пароль
 * @returns Данные пользователя или null в случае ошибки
 */
export async function registerUser(username: string, email: string, password: string): Promise<User | null> {
  try {
    // Специальная обработка для admin
    if (username === 'admin') {
      // Проверяем, существует ли пользователь
      const existingUser = await storage.getUserByUsername('admin');
      if (existingUser) {
        console.error('Username admin already taken');
        return null;
      }
      
      // Создаем админа только в локальной системе хранения
      const user = await storage.createUser({
        username: 'admin',
        email: 'admin@example.com', // Добавляем email для админа
        password: 'admin123' // Для админа храним фиксированный пароль
      });
      
      return user;
    }
    
    // Для обычных пользователей
    // Проверяем, не занято ли имя пользователя
    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) {
      console.error('Username already taken');
      return null;
    }
    
    try {
      // Используем Supabase Auth для регистрации
      // Если email не передан, создаем его на основе имени пользователя
      const userEmail = email || `${username}@chatapp.example.com`;
      
      // Регистрируем пользователя в Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: userEmail,
        password: password
      });
      
      if (error) {
        console.error('Registration error in Supabase Auth:', error);
        // Если ошибка связана с Supabase, но не с валидацией пользователя,
        // создаем пользователя только в локальной системе
        if (error.status !== 422) {
          const user = await storage.createUser({
            username,
            email: userEmail,
            password: '********' // Не храним пароль в открытом виде
          });
          return user;
        }
        return null;
      }
      
      // Создаем пользователя в нашей локальной системе хранения
      const user = await storage.createUser({
        username,
        email: userEmail,
        password: '********' // Не храним пароль в открытом виде
      });
      
      return user;
    } catch (error) {
      console.error('Error during Supabase registration:', error);
      
      // В случае ошибки в Supabase, создаем пользователя только в локальной системе
      const userEmail = email || `${username}@chatapp.example.com`;
      const user = await storage.createUser({
        username,
        email: userEmail,
        password: '********' // Не храним пароль в открытом виде
      });
      
      return user;
    }
  } catch (error) {
    console.error('Registration error:', error);
    return null;
  }
}

// Хранилище токенов администратора (в памяти)
const adminTokens = new Set<string>();

// Хранилище локальных токенов для обычных пользователей
const localTokens = new Map<string, string>();

/**
 * Middleware для проверки аутентификации
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Если метод OPTIONS, пропускаем (для CORS)
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  // Если путь начинается с /api/auth, пропускаем
  if (req.path.startsWith('/api/auth')) {
    return next();
  }
  
  // Получаем токен из заголовка Authorization
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }
  
  // Проверяем, является ли токен токеном администратора
  if (token.startsWith('admin_token_')) {
    // Добавляем токен админа в кэш
    adminTokens.add(token);
    
    // Добавляем данные пользователя в запрос
    (req as any).user = {
      id: 1,
      username: 'admin'
    };
    
    return next();
  }
  
  // Проверяем, является ли токен локальным токеном
  if (token.startsWith('local_token_')) {
    const username = localTokens.get(token);
    
    if (username) {
      // Добавляем данные пользователя в запрос
      (req as any).user = {
        username
      };
      
      return next();
    } else {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
  }
  
  // Пробуем проверить токен через Supabase Auth
  try {
    supabase.auth.getUser(token)
      .then(({ data, error }) => {
        if (error || !data.user) {
          return res.status(403).json({ message: 'Invalid or expired token' });
        }
        
        // Добавляем данные пользователя в запрос
        (req as any).user = {
          id: data.user.id,
          email: data.user.email
        };
        
        next();
      })
      .catch((error) => {
        console.error('Token verification error:', error);
        return res.status(500).json({ message: 'Authentication error' });
      });
  } catch (error) {
    console.error('Error in auth middleware:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Выход пользователя из системы
 * @param token Токен авторизации
 */
export async function logoutUser(token: string): Promise<boolean> {
  try {
    // Если это токен админа, удаляем его из нашего хранилища
    if (token.startsWith('admin_token_')) {
      adminTokens.delete(token);
      return true;
    }
    
    // Если это локальный токен, удаляем его из карты
    if (token.startsWith('local_token_')) {
      localTokens.delete(token);
      return true;
    }
    
    // Для пользователей Supabase
    try {
      // Проверяем, что Supabase настроен
      if (!supabase) {
        throw new Error('Supabase not configured');
      }
      
      // Выходим из Supabase Auth
      const { error } = await supabase.auth.signOut({
        scope: 'local'
      });
      
      if (error) {
        console.error('Supabase logout error:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Supabase logout error:', error);
      return true; // Возвращаем true, так как локальный выход всегда успешен
    }
  } catch (error) {
    console.error('Logout error:', error);
    return false;
  }
}

/**
 * Получение информации о пользователе по токену
 * @param token Токен авторизации
 * @returns Данные пользователя или null в случае ошибки
 */
export async function getUserByToken(token: string): Promise<User | null> {
  try {
    // Если это токен админа, возвращаем данные админа
    if (token.startsWith('admin_token_')) {
      // Добавляем токен в кэш, если его еще нет
      adminTokens.add(token);
      
      // Получаем пользователя admin
      const user = await storage.getUserByUsername('admin');
      
      // Если пользователя нет, создаем его
      if (!user) {
        console.log('Создаем пользователя admin в хранилище');
        const newUser = await storage.createUser({
          username: 'admin',
          email: 'admin@example.com',
          password: 'admin123'
        });
        return newUser || null;
      }
      
      return user || null;
    }
    
    try {
      // Для обычных пользователей используем Supabase Auth
      // Проверяем, что Supabase настроен
      if (!supabase) {
        throw new Error('Supabase not configured');
      }
      
      // Проверяем токен через Supabase Auth
      const { data: userData, error } = await supabase.auth.getUser(token);
      
      if (error || !userData.user) {
        console.error('Get user by token error:', error);
        return null;
      }
      
      // Извлекаем информацию о пользователе
      const email = userData.user.email || '';
      // Определяем имя пользователя из email сразу для дальнейшего использования
      const username = email ? email.split('@')[0] : 'user_' + userData.user.id.substring(0, 8);
      
      // Попробуем сначала найти пользователя по email (если он используется как username)
      let user = email ? await storage.getUserByUsername(email) : null;
      
      if (!user) {
        // Если не нашли, ищем по извлеченному имени
        user = await storage.getUserByUsername(username);
      }
      
      if (!user) {
        // Если пользователя нет в нашем хранилище, создаем его
        const usernameToStore = email || username;
        user = await storage.createUser({
          username: usernameToStore,
          email: email, // Добавляем email для согласованности
          password: '********' // Не храним реальный пароль
        });
        
        if (!user) {
          console.error('Failed to create user in storage');
          return null;
        }
      }
      
      return user;
    } catch (error) {
      // Если ошибка с Supabase Auth, но у нас токен админа, возвращаем админа
      if (token.startsWith('admin_token_')) {
        const adminUser = await storage.getUserByUsername('admin');
        return adminUser || null;
      }
      console.error('Error checking Supabase Auth:', error);
      return null;
    }
  } catch (error) {
    console.error('Get user by token error:', error);
    return null;
  }
}