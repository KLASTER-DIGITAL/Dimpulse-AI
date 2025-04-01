import { supabase, isSupabaseConfigured } from './supabase';
import type { 
  IStorage,
  User,
  InsertUser,
  Chat,
  InsertChat,
  Message,
  InsertMessage,
  Settings,
  Stats
} from './storage';

/**
 * Реализация хранилища данных с использованием Supabase
 */
export class SupabaseStorage implements IStorage {
  private settings: Settings;
  private tableNames = {
    users: 'users',
    chats: 'chats',
    messages: 'messages',
    files: 'files'
  };

  constructor(settings?: Settings) {
    // Проверяем наличие конфигурации Supabase
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
    }
    
    this.settings = settings || {
      webhook: {
        url: 'https://n8n.klaster.digital/webhook-test/4a1fed67-dcfb-4eb8-a71b-d47b1d651509',
        enabled: true
      },
      integration: {
        iframe: {
          enabled: false,
          theme: 'dark'
        },
        widget: {
          enabled: true,
          position: 'left',
          theme: 'dark',
          fontSize: 12,
          width: 400,
          height: 500,
          text: 'Чем еще могу помочь?',
          buttonColor: '#4F46E5',
          pulsation: true
        }
      },
      ui: {
        enabled: false,
        colorSchemeEnabled: false,
        colors: {
          primary: '#19c37d',
          secondary: '#f9fafb',
          accent: '#6366f1'
        },
        elements: {
          roundedCorners: true,
          shadows: true,
          animations: true
        }
      },
      database: {
        enabled: true,
        type: 'supabase',
        supabase: {
          tables: {
            messages: 'messages',
            chats: 'chats',
            users: 'users',
            files: 'files'
          },
          schema: 'public',
          autoMigrate: true
        }
      }
    };

    // Обновляем имена таблиц из настроек
    if (settings?.database?.supabase?.tables) {
      this.tableNames = {
        users: settings.database.supabase.tables.users,
        chats: settings.database.supabase.tables.chats,
        messages: settings.database.supabase.tables.messages,
        files: settings.database.supabase.tables.files
      };
    }
  }

  /**
   * Инициализация таблиц в Supabase
   */
  private async initTables() {
    try {
      // Проверяем существование таблиц и создаем их при необходимости
      const { data: tableData, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

      if (tableError) {
        console.error('Error checking tables:', tableError);
        return;
      }

      const existingTables = tableData?.map(t => t.table_name) || [];

      // Создаем недостающие таблицы
      if (!existingTables.includes(this.tableNames.users)) {
        await supabase.rpc('run_sql', {
          sql_query: `
          CREATE TABLE ${this.tableNames.users} (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
          `
        });
      }

      if (!existingTables.includes(this.tableNames.chats)) {
        await supabase.rpc('run_sql', {
          sql_query: `
          CREATE TABLE ${this.tableNames.chats} (
            id UUID PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            user_id INTEGER REFERENCES ${this.tableNames.users}(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
          `
        });
      }

      if (!existingTables.includes(this.tableNames.messages)) {
        await supabase.rpc('run_sql', {
          sql_query: `
          CREATE TABLE ${this.tableNames.messages} (
            id UUID PRIMARY KEY,
            chat_id UUID REFERENCES ${this.tableNames.chats}(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            role VARCHAR(50) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
          `
        });
      }

      if (!existingTables.includes(this.tableNames.files)) {
        await supabase.rpc('run_sql', {
          sql_query: `
          CREATE TABLE ${this.tableNames.files} (
            id UUID PRIMARY KEY,
            message_id UUID REFERENCES ${this.tableNames.messages}(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            type VARCHAR(100) NOT NULL,
            size INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
          `
        });
      }

      console.log('Supabase tables initialized successfully');
    } catch (error) {
      console.error('Error initializing Supabase tables:', error);
    }
  }

  /**
   * Получение пользователя по ID
   */
  async getUser(id: number): Promise<User | undefined> {
    try {
      const { data, error } = await supabase
        .from(this.tableNames.users)
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        console.error('Error fetching user by id:', error);
        return undefined;
      }

      return this.mapUserFromSupabase(data);
    } catch (error) {
      console.error('Error fetching user by id:', error);
      return undefined;
    }
  }

  /**
   * Получение пользователя по имени пользователя
   */
  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const { data, error } = await supabase
        .from(this.tableNames.users)
        .select('*')
        .eq('username', username)
        .single();

      if (error || !data) {
        // Пользователь не найден или произошла ошибка
        return undefined;
      }

      return this.mapUserFromSupabase(data);
    } catch (error) {
      console.error('Error fetching user by username:', error);
      return undefined;
    }
  }

  /**
   * Создание нового пользователя
   */
  async createUser(user: InsertUser): Promise<User> {
    try {
      const { data, error } = await supabase
        .from(this.tableNames.users)
        .insert({
          username: user.username,
          password: user.password,
          last_active: new Date().toISOString()
        })
        .select()
        .single();

      if (error || !data) {
        console.error('Error creating user:', error);
        throw new Error('Failed to create user');
      }

      return this.mapUserFromSupabase(data);
    } catch (error) {
      console.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  }

  /**
   * Создание нового чата
   */
  async createChat(chat: InsertChat): Promise<Chat> {
    try {
      const { data, error } = await supabase
        .from(this.tableNames.chats)
        .insert({
          id: chat.id,
          title: chat.title,
          user_id: chat.userId,
          created_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        })
        .select()
        .single();

      if (error || !data) {
        console.error('Error creating chat:', error);
        throw new Error('Failed to create chat');
      }

      return this.mapChatFromSupabase(data);
    } catch (error) {
      console.error('Error creating chat:', error);
      throw new Error('Failed to create chat');
    }
  }

  /**
   * Получение чата по ID
   */
  async getChatById(id: string): Promise<Chat | undefined> {
    try {
      const { data, error } = await supabase
        .from(this.tableNames.chats)
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        // Чат не найден или произошла ошибка
        return undefined;
      }

      return this.mapChatFromSupabase(data);
    } catch (error) {
      console.error('Error fetching chat by id:', error);
      return undefined;
    }
  }

  /**
   * Получение списка чатов пользователя
   */
  async getChatsByUserId(userId: number | null): Promise<Chat[]> {
    try {
      let query = supabase
        .from(this.tableNames.chats)
        .select('*')
        .order('last_active', { ascending: false });
      
      if (userId !== null) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching chats by user id:', error);
        return [];
      }

      return (data || []).map(this.mapChatFromSupabase);
    } catch (error) {
      console.error('Error fetching chats by user id:', error);
      return [];
    }
  }

  /**
   * Обновление заголовка чата
   */
  async updateChatTitle(id: string, title: string): Promise<void> {
    try {
      const { error } = await supabase
        .from(this.tableNames.chats)
        .update({ title })
        .eq('id', id);

      if (error) {
        console.error('Error updating chat title:', error);
        throw new Error('Failed to update chat title');
      }
    } catch (error) {
      console.error('Error updating chat title:', error);
      throw new Error('Failed to update chat title');
    }
  }

  /**
   * Создание нового сообщения
   */
  async createMessage(message: InsertMessage): Promise<Message> {
    try {
      const { data, error } = await supabase
        .from(this.tableNames.messages)
        .insert({
          chat_id: message.chatId,
          content: message.content,
          role: message.role,
          created_at: new Date().toISOString(),
          file_url: message.fileUrl || null,
          file_name: message.fileName || null,
          file_type: message.fileType || null,
          file_size: message.fileSize || null
        })
        .select()
        .single();

      if (error || !data) {
        console.error('Error creating message:', error);
        throw new Error('Failed to create message');
      }

      // Обновляем last_active у чата
      await supabase
        .from(this.tableNames.chats)
        .update({ last_active: new Date().toISOString() })
        .eq('id', message.chatId);

      return this.mapMessageFromSupabase(data);
    } catch (error) {
      console.error('Error creating message:', error);
      throw new Error('Failed to create message');
    }
  }

  /**
   * Получение сообщений чата
   */
  async getMessagesByChatId(chatId: string): Promise<Message[]> {
    try {
      const { data, error } = await supabase
        .from(this.tableNames.messages)
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages by chat id:', error);
        return [];
      }

      return (data || []).map(this.mapMessageFromSupabase);
    } catch (error) {
      console.error('Error fetching messages by chat id:', error);
      return [];
    }
  }

  /**
   * Получение настроек
   */
  async getSettings(): Promise<Settings> {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .single();

      if (error || !data) {
        // Если настройки не найдены, возвращаем дефолтные
        return this.settings;
      }

      // Преобразуем данные из таблицы settings в нужный формат
      const settings: Settings = {
        webhook: {
          url: data.webhook_url || 'https://n8n.klaster.digital/webhook-test/4a1fed67-dcfb-4eb8-a71b-d47b1d651509',
          enabled: data.webhook_enabled !== undefined ? data.webhook_enabled : true
        },
        integration: {
          iframe: {
            enabled: data.iframe_enabled !== undefined ? data.iframe_enabled : false,
            theme: data.iframe_theme || 'dark'
          },
          widget: {
            enabled: data.widget_enabled !== undefined ? data.widget_enabled : true,
            position: data.widget_position || 'left',
            theme: data.widget_theme || 'dark',
            fontSize: data.widget_font_size || 12,
            width: data.widget_width || 400,
            height: data.widget_height || 500,
            text: data.widget_text || 'Чем еще могу помочь?',
            buttonColor: data.widget_button_color || '#4F46E5',
            pulsation: data.widget_pulsation !== undefined ? data.widget_pulsation : true
          }
        },
        ui: {
          enabled: data.ui_enabled !== undefined ? data.ui_enabled : false,
          colorSchemeEnabled: data.ui_color_scheme_enabled !== undefined ? data.ui_color_scheme_enabled : false,
          colors: {
            primary: data.ui_color_primary || '#19c37d',
            secondary: data.ui_color_secondary || '#f9fafb',
            accent: data.ui_color_accent || '#6366f1'
          },
          elements: {
            roundedCorners: data.ui_rounded_corners !== undefined ? data.ui_rounded_corners : true,
            shadows: data.ui_shadows !== undefined ? data.ui_shadows : true,
            animations: data.ui_animations !== undefined ? data.ui_animations : true
          }
        },
        database: {
          enabled: data.db_enabled !== undefined ? data.db_enabled : true,
          type: data.db_type || 'supabase',
          supabase: {
            tables: {
              messages: data.supabase_tables_messages || 'messages',
              chats: data.supabase_tables_chats || 'chats',
              users: data.supabase_tables_users || 'users',
              files: data.supabase_tables_files || 'files'
            },
            schema: data.supabase_schema || 'public',
            autoMigrate: data.supabase_auto_migrate !== undefined ? data.supabase_auto_migrate : true
          }
        }
      };

      return settings;
    } catch (error) {
      console.error('Error fetching settings:', error);
      return this.settings;
    }
  }

  /**
   * Обновление настроек
   */
  async updateSettings(settings: Settings): Promise<Settings> {
    try {
      // Преобразуем настройки в формат таблицы
      const updatedSettings = {
        webhook_url: settings.webhook.url,
        webhook_enabled: settings.webhook.enabled,
        iframe_enabled: settings.integration.iframe.enabled,
        iframe_theme: settings.integration.iframe.theme,
        widget_enabled: settings.integration.widget.enabled,
        widget_position: settings.integration.widget.position,
        widget_theme: settings.integration.widget.theme,
        widget_font_size: settings.integration.widget.fontSize,
        widget_width: settings.integration.widget.width,
        widget_height: settings.integration.widget.height,
        widget_text: settings.integration.widget.text,
        ui_enabled: settings.ui.enabled,
        ui_color_primary: settings.ui.colors.primary,
        ui_color_secondary: settings.ui.colors.secondary,
        ui_color_accent: settings.ui.colors.accent,
        ui_rounded_corners: settings.ui.elements.roundedCorners,
        ui_shadows: settings.ui.elements.shadows,
        ui_animations: settings.ui.elements.animations,
        db_enabled: settings.database.enabled,
        db_type: settings.database.type,
        supabase_tables_messages: settings.database.supabase.tables.messages,
        supabase_tables_chats: settings.database.supabase.tables.chats,
        supabase_tables_users: settings.database.supabase.tables.users,
        supabase_tables_files: settings.database.supabase.tables.files,
        supabase_schema: settings.database.supabase.schema,
        supabase_auto_migrate: settings.database.supabase.autoMigrate
      };

      // Проверяем, существуют ли уже настройки
      const { count, error: countError } = await supabase
        .from('settings')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Error checking settings count:', countError);
        throw new Error('Failed to update settings');
      }

      if (count === 0) {
        // Если настройки не существуют, создаем новую запись
        const { error } = await supabase
          .from('settings')
          .insert(updatedSettings);

        if (error) {
          console.error('Error creating settings:', error);
          throw new Error('Failed to create settings');
        }
      } else {
        // Если настройки существуют, обновляем их
        const { error } = await supabase
          .from('settings')
          .update(updatedSettings)
          .eq('id', 1);

        if (error) {
          console.error('Error updating settings:', error);
          throw new Error('Failed to update settings');
        }
      }

      // Обновляем имена таблиц, если они изменились
      this.tableNames = {
        users: settings.database.supabase.tables.users,
        chats: settings.database.supabase.tables.chats,
        messages: settings.database.supabase.tables.messages,
        files: settings.database.supabase.tables.files
      };

      // Обновляем локальную копию настроек
      this.settings = settings;

      return settings;
    } catch (error) {
      console.error('Error updating settings:', error);
      throw new Error('Failed to update settings');
    }
  }

  /**
   * Обновление URL вебхука
   */
  async updateWebhookUrl(url: string, enabled: boolean): Promise<Settings> {
    try {
      // Обновляем настройки вебхука
      const updatedSettings = { ...this.settings };
      updatedSettings.webhook.url = url;
      updatedSettings.webhook.enabled = enabled;

      // Сохраняем обновленные настройки
      return await this.updateSettings(updatedSettings);
    } catch (error) {
      console.error('Error updating webhook URL:', error);
      throw new Error('Failed to update webhook URL');
    }
  }

  /**
   * Получение статистики
   */
  async getStats(): Promise<Stats> {
    try {
      // Используем RPC для вызова хранимой функции
      const { data, error } = await supabase.rpc('get_usage_stats');

      if (error) {
        console.error('Error fetching stats:', error);
        // Возвращаем пустую статистику в случае ошибки
        return {
          totalUsers: 0,
          totalChats: 0,
          totalMessages: 0,
          activeUsersLast24h: 0,
          activeChatsLast24h: 0,
          messagesPerDay: [],
          topChats: []
        };
      }

      return data as Stats;
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Возвращаем пустую статистику в случае ошибки
      return {
        totalUsers: 0,
        totalChats: 0,
        totalMessages: 0,
        activeUsersLast24h: 0,
        activeChatsLast24h: 0,
        messagesPerDay: [],
        topChats: []
      };
    }
  }

  /**
   * Получение истории диалогов с пагинацией
   */
  async getDialogHistory(limit: number = 10, offset: number = 0): Promise<{chats: Chat[], totalCount: number}> {
    try {
      // Используем RPC для вызова хранимой функции
      const { data, error } = await supabase.rpc('get_dialog_history', {
        p_limit: limit,
        p_offset: offset
      });

      if (error) {
        console.error('Error fetching dialog history:', error);
        return { chats: [], totalCount: 0 };
      }

      return data;
    } catch (error) {
      console.error('Error fetching dialog history:', error);
      return { chats: [], totalCount: 0 };
    }
  }

  /**
   * Маппинг пользователя из Supabase формата
   */
  private mapUserFromSupabase(data: any): User {
    return {
      id: data.id,
      username: data.username,
      email: data.email || null,
      password: data.password || '********', // Скрываем пароль в возвращаемых данных
      lastActive: data.last_active
    };
  }

  /**
   * Маппинг чата из Supabase формата
   */
  private mapChatFromSupabase(data: any): Chat {
    return {
      id: data.id,
      title: data.title,
      userId: data.user_id,
      createdAt: data.created_at,
      lastActive: data.last_active
    };
  }

  /**
   * Маппинг сообщения из Supabase формата
   */
  private mapMessageFromSupabase(data: any): Message {
    return {
      id: data.id,
      chatId: data.chat_id,
      content: data.content,
      role: data.role,
      createdAt: data.created_at,
      fileUrl: data.file_url || null,
      fileName: data.file_name || null,
      fileType: data.file_type || null,
      fileSize: data.file_size || null
    };
  }
}