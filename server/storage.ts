import { messages, chats, users, type User, type InsertUser, type Message, type InsertMessage, type Chat, type InsertChat, type Settings, type Stats, settingsSchema, statsSchema } from "@shared/schema";
import { SupabaseStorage } from "./supabase-storage";
import { isSupabaseConfigured } from "./supabase";

// Экспортируем типы для доступа из других файлов
export type { User, InsertUser, Chat, InsertChat, Message, InsertMessage, Settings, Stats };

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Chat methods
  createChat(chat: InsertChat): Promise<Chat>;
  getChatById(id: string): Promise<Chat | undefined>;
  getChatsByUserId(userId: number | null): Promise<Chat[]>;
  updateChatTitle(id: string, title: string): Promise<void>;
  
  // Message methods
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByChatId(chatId: string): Promise<Message[]>;
  
  // Settings methods
  getSettings(): Promise<Settings>;
  updateSettings(settings: Settings): Promise<Settings>;
  updateWebhookUrl(url: string, enabled: boolean): Promise<Settings>;
  
  // Stats methods
  getStats(): Promise<Stats>;
  getDialogHistory(limit?: number, offset?: number): Promise<{chats: Chat[], totalCount: number}>;
}

// Экспортируем класс MemStorage для использования в других файлах
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private chats: Map<string, Chat>;
  private messages: Map<string, Message[]>;
  private currentUserId: number;
  private currentMessageId: number;
  private settings: Settings;

  private storageFile = 'chat_history.json';

  constructor() {
    this.users = new Map();
    this.chats = new Map();
    this.messages = new Map();
    this.currentUserId = 1;
    this.currentMessageId = 1;
    
    // Инициализация настроек по умолчанию
    this.settings = {
      webhook: {
        url: "https://n8n.klaster.digital/webhook-test/4a1fed67-dcfb-4eb8-a71b-d47b1d651509",
        enabled: true,
      },
      integration: {
        iframe: {
          enabled: false,
          theme: "dark",
        },
        widget: {
          enabled: false,
          position: "left",
          theme: "dark",
          fontSize: 16,
          width: 400,
          height: 500,
          text: "Чем могу помочь?",
          buttonColor: "#4b6cf7",
          pulsation: true,
        },
      },
      ui: {
        enabled: true,
        colorSchemeEnabled: false,
        colors: {
          primary: "#19c37d",
          secondary: "#f9fafb",
          accent: "#6366f1",
        },
        elements: {
          roundedCorners: true,
          shadows: true,
          animations: true,
        },
      },
      database: {
        enabled: false,
        type: "local",
        supabase: {
          tables: {
            messages: "messages",
            chats: "chats",
            users: "users",
            files: "files",
          },
          schema: "public",
          autoMigrate: true,
        }
      }
    };
    
    // Загружаем данные из файла при запуске (асинхронно)
    this.initializeStorage();
  }
  
  // Метод для асинхронной инициализации хранилища
  private async initializeStorage() {
    await this.loadFromFile();
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username || user.email === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    
    // Создаем новый объект пользователя с правильными типами
    const user: User = { 
      username: insertUser.username,
      password: insertUser.password,
      email: insertUser.email || null, // Устанавливаем null если email не предоставлен
      id,
      lastActive: new Date()
    };
    this.users.set(id, user);
    await this.saveToFile(); // Сохраняем изменения в файл
    return user;
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const newChat: Chat = {
      id: chat.id,
      title: chat.title,
      userId: chat.userId || null,
      createdAt: new Date(),
      lastActive: new Date()
    };
    this.chats.set(chat.id, newChat);
    this.messages.set(chat.id, []);
    this.saveToFile();
    return newChat;
  }

  async getChatById(id: string): Promise<Chat | undefined> {
    return this.chats.get(id);
  }

  async getChatsByUserId(userId: number | null): Promise<Chat[]> {
    if (userId === null) {
      return Array.from(this.chats.values()).sort((a, b) => 
        b.createdAt.getTime() - a.createdAt.getTime()
      );
    }
    
    return Array.from(this.chats.values())
      .filter(chat => chat.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateChatTitle(id: string, title: string): Promise<void> {
    const chat = this.chats.get(id);
    if (chat) {
      chat.title = title;
      this.chats.set(id, chat);
      await this.saveToFile(); // Сохраняем изменения в файл
    }
  }

  private async saveToFile() {
    const data = {
      users: Array.from(this.users.entries()),
      chats: Array.from(this.chats.entries()),
      messages: Array.from(this.messages.entries()),
      currentUserId: this.currentUserId,
      currentMessageId: this.currentMessageId,
      settings: this.settings // Сохраняем настройки в файл
    };
    
    try {
      const fs = await import('fs');
      fs.writeFileSync(this.storageFile, JSON.stringify(data));
      console.log('Data successfully saved to file');
    } catch (error) {
      console.error('Error saving data:', error);
      throw error; // Пробрасываем ошибку дальше для обработки
    }
  }

  private async loadFromFile() {
    try {
      const fs = await import('fs');
      if (fs.existsSync(this.storageFile)) {
        // Преобразование строковых дат обратно в объекты Date при загрузке
        const reviver = (key: string, value: any) => {
          // Если значение похоже на ISO дату, преобразуем его в объект Date
          if (typeof value === 'string' && 
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
            return new Date(value);
          }
          return value;
        };
        
        const data = JSON.parse(fs.readFileSync(this.storageFile, 'utf8'), reviver);
        
        // Исправление даты для пользователей
        this.users = new Map();
        if (data.users) {
          for (const [id, user] of data.users) {
            if (user.lastActive && !(user.lastActive instanceof Date)) {
              user.lastActive = new Date(user.lastActive);
            }
            this.users.set(Number(id), user);
          }
        }
        
        // Исправление даты для чатов
        this.chats = new Map();
        if (data.chats) {
          for (const [id, chat] of data.chats) {
            if (chat.createdAt && !(chat.createdAt instanceof Date)) {
              chat.createdAt = new Date(chat.createdAt);
            }
            if (chat.lastActive && !(chat.lastActive instanceof Date)) {
              chat.lastActive = new Date(chat.lastActive);
            }
            this.chats.set(id, chat);
          }
        }
        
        // Исправление даты для сообщений
        this.messages = new Map();
        if (data.messages) {
          for (const [chatId, messagesArray] of data.messages) {
            const fixedMessages = messagesArray.map((msg: any) => {
              if (msg.createdAt && !(msg.createdAt instanceof Date)) {
                msg.createdAt = new Date(msg.createdAt);
              }
              return msg;
            });
            this.messages.set(chatId, fixedMessages);
          }
        }
        
        this.currentUserId = data.currentUserId;
        this.currentMessageId = data.currentMessageId;
        
        // Загружаем сохраненные настройки, если они есть
        if (data.settings) {
          // Проверяем и загружаем настройки с сохранением структуры по умолчанию
          this.settings = {
            ...this.settings, // Сохраняем значения по умолчанию
            ...data.settings, // Перезаписываем сохраненными значениями
            // Убедимся что вложенные объекты тоже правильно объединены
            webhook: {
              ...this.settings.webhook,
              ...(data.settings.webhook || {})
            },
            integration: {
              ...this.settings.integration,
              ...(data.settings.integration || {}),
              iframe: {
                ...this.settings.integration.iframe,
                ...(data.settings.integration?.iframe || {})
              },
              widget: {
                ...this.settings.integration.widget,
                ...(data.settings.integration?.widget || {})
              }
            },
            ui: {
              ...this.settings.ui,
              ...(data.settings.ui || {}),
              colors: {
                ...this.settings.ui.colors,
                ...(data.settings.ui?.colors || {})
              },
              elements: {
                ...this.settings.ui.elements,
                ...(data.settings.ui?.elements || {})
              }
            }
          };
        }
        
        console.log('Data successfully loaded from file with dates converted properly');
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const id = this.currentMessageId++;
    const newMessage: Message = { 
      ...message, 
      id, 
      createdAt: new Date(),
      // Добавляем обязательные поля со значением null если их нет
      fileUrl: message.fileUrl || null,
      fileName: message.fileName || null,
      fileType: message.fileType || null,
      fileSize: message.fileSize || null
    };
    
    const chatMessages = this.messages.get(message.chatId) || [];
    chatMessages.push(newMessage);
    this.messages.set(message.chatId, chatMessages);
    await this.saveToFile(); // Добавляем await для корректного сохранения
    
    // Update chat title if it's the first user message
    if (message.role === 'user' && chatMessages.length <= 2) {
      const title = message.content.length > 30 
        ? message.content.substring(0, 30) + '...' 
        : message.content;
      this.updateChatTitle(message.chatId, title);
    }
    
    return newMessage;
  }

  async getMessagesByChatId(chatId: string): Promise<Message[]> {
    return this.messages.get(chatId) || [];
  }
  
  // Settings methods
  async getSettings(): Promise<Settings> {
    return this.settings;
  }
  
  async updateSettings(settings: Settings): Promise<Settings> {
    this.settings = settings;
    await this.saveToFile(); // Сохраняем изменения в файл
    return this.settings;
  }
  
  async updateWebhookUrl(url: string, enabled: boolean): Promise<Settings> {
    this.settings.webhook.url = url;
    this.settings.webhook.enabled = enabled;
    await this.saveToFile(); // Сохраняем изменения в файл
    return this.settings;
  }
  
  // Методы для работы со статистикой
  async getStats(): Promise<Stats> {
    // Текущая дата для расчета активности за последние 24 часа
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Получаем все сообщения для подсчета статистики
    const allMessages: Message[] = [];
    this.messages.forEach(messages => {
      allMessages.push(...messages);
    });
    
    // Считаем количество сообщений по дням
    const messagesPerDayMap = new Map<string, number>();
    allMessages.forEach(message => {
      const date = message.createdAt.toISOString().split('T')[0];
      messagesPerDayMap.set(date, (messagesPerDayMap.get(date) || 0) + 1);
    });
    
    // Преобразуем в массив с сортировкой по дате
    const messagesPerDay = Array.from(messagesPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Считаем чаты с наибольшим количеством сообщений
    const chatMessageCount = new Map<string, number>();
    this.messages.forEach((messages, chatId) => {
      chatMessageCount.set(chatId, messages.length);
    });
    
    // Получаем топ-5 чатов по количеству сообщений
    const topChats = Array.from(chatMessageCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([chatId, messageCount]) => {
        const chat = this.chats.get(chatId);
        return {
          chatId,
          title: chat ? chat.title : "Неизвестный чат",
          messageCount
        };
      });
    
    // Количество активных чатов за последние 24 часа
    const activeChatsLast24h = Array.from(this.chats.values())
      .filter(chat => {
        // Проверяем, есть ли сообщения в чате за последние 24 часа
        const chatMessages = this.messages.get(chat.id) || [];
        return chatMessages.some(message => message.createdAt >= yesterday);
      }).length;
    
    // Количество активных пользователей за последние 24 часа
    // Для упрощения считаем всех пользователей активными, так как в данной реализации
    // у нас нет отслеживания последней активности пользователя
    const activeUsersLast24h = this.users.size;
    
    return {
      totalUsers: this.users.size,
      totalChats: this.chats.size,
      totalMessages: allMessages.length,
      activeUsersLast24h,
      activeChatsLast24h,
      messagesPerDay,
      topChats
    };
  }
  
  async getDialogHistory(limit: number = 10, offset: number = 0): Promise<{chats: Chat[], totalCount: number}> {
    // Получаем все чаты, сортируем по дате создания (сначала новые)
    const allChats = Array.from(this.chats.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // Применяем пагинацию
    const paginatedChats = allChats.slice(offset, offset + limit);
    
    return {
      chats: paginatedChats,
      totalCount: allChats.length
    };
  }
}

// Создаем нужный тип хранилища в зависимости от настроек
let storageInstance: IStorage;

// Сначала используем MemStorage для загрузки настроек
const memStorage = new MemStorage();

// Асинхронно инициализируем хранилище
export async function initStorage() {
  // Загружаем настройки из MemStorage
  const settings = await memStorage.getSettings();
  
  // Проверяем режим запуска
  const isLocalMode = process.env.USE_LOCAL_STORAGE === 'true';
  
  if (isLocalMode) {
    console.log('Running in local mode, using in-memory storage');
    storageInstance = memStorage;
    return storageInstance;
  }
  
  // Проверяем настройки для определения типа хранилища и наличие Supabase ключей
  const supabaseEnabled = isSupabaseConfigured();

  // Выводим информацию о статусе Supabase
  if (!supabaseEnabled) {
    console.warn('Supabase configuration not found (SUPABASE_URL and SUPABASE_KEY environment variables required)');
    console.warn('Falling back to in-memory storage. Set SUPABASE_URL and SUPABASE_KEY for database persistence.');
  }

  if (settings.database?.enabled && 
      settings.database.type === 'supabase' && 
      supabaseEnabled) {
    console.log('Using Supabase storage');
    try {
      storageInstance = new SupabaseStorage(settings);
    } catch (error) {
      console.error('Failed to initialize Supabase storage:', error);
      console.log('Falling back to in-memory storage');
      storageInstance = memStorage;
    }
  } else {
    console.log('Using in-memory storage');
    storageInstance = memStorage;
  }
  
  return storageInstance;
}

// Экспортируем промис для ожидания инициализации хранилища
export const storagePromise = initStorage();

// Создаем прокси-объект, который перенаправляет обращения к инициализированному хранилищу
export const storage = new Proxy({} as IStorage, {
  get: (target, prop) => {
    // Возвращаем метод, который будет делегировать вызов на актуальное хранилище
    return (...args: any[]) => {
      // Получаем метод с таким же именем из фактического хранилища
      const method = (storageInstance as any)[prop];
      if (typeof method === 'function') {
        // Вызываем метод с переданными аргументами
        return method.apply(storageInstance, args);
      }
      
      throw new Error(`Method ${String(prop)} not found in storage`);
    };
  }
});
