import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, storagePromise, MemStorage, initStorage } from "./storage";
import { randomUUID } from "crypto";
import { insertChatSchema, insertMessageSchema, settingsSchema } from "@shared/schema";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from 'ws';
import { testSupabaseConnection, isSupabaseConfigured } from "./supabase";
import { authenticateUser, registerUser, logoutUser, authMiddleware, getUserByToken } from "./auth";

// Middleware для CORS
const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Предварительный запрос CORS
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Применяем middleware для CORS ко всем маршрутам
  app.use(corsMiddleware);
  
  // Аутентификация (логин)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      const result = await authenticateUser(username, password);
      
      if (!result) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      res.json({
        user: result.user,
        token: result.token
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });
  
  // Регистрация
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      // Валидация email для Supabase Auth
      if (!email || !email.includes('@')) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      
      // Проверка наличия пользователя с таким именем
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already taken" });
      }
      
      // Регистрация с использованием email
      const user = await registerUser(username, email, password);
      
      if (!user) {
        return res.status(500).json({ message: "Registration failed" });
      }
      
      res.status(201).json({ user });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });
  
  // Выход
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({ message: "Authentication token required" });
      }
      
      const result = await logoutUser(token);
      
      if (!result) {
        return res.status(500).json({ message: "Logout failed" });
      }
      
      res.json({ message: "Logout successful" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });
  
  // Маршрут для проверки соединения с Supabase
  app.get("/api/supabase/connection", async (req, res) => {
    try {
      const isConfigured = isSupabaseConfigured();
      if (!isConfigured) {
        return res.json({ 
          status: "not_configured",
          message: "Supabase is not configured in your environment"
        });
      }
      
      const isConnected = await testSupabaseConnection();
      
      if (!isConnected) {
        return res.json({ 
          status: "connection_failed",
          message: "Failed to connect to Supabase"
        });
      }
      
      return res.json({ 
        status: "connected",
        message: "Successfully connected to Supabase"
      });
    } catch (error) {
      console.error("Error checking Supabase connection:", error);
      res.status(500).json({ 
        status: "error",
        message: "An error occurred while checking Supabase connection"
      });
    }
  });
  
  // Проверка текущего пользователя по токену
  app.get("/api/auth/me", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({ message: "Authentication token required" });
      }
      
      // Получаем информацию о пользователе по токену
      const user = await getUserByToken(token);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      
      // Возвращаем информацию о пользователе
      return res.json({ user });
    } catch (error) {
      console.error("Auth check error:", error);
      res.status(500).json({ message: "Failed to check authentication" });
    }
  });
  
  // Добавляем middleware для авторизации после маршрутов аутентификации
  // app.use(authMiddleware);
  
  // Убрали отсюда обработчик для widget.js, так как он теперь определен ниже в более универсальном виде
  // Get all chats (for the sidebar)
  app.get("/api/chats", async (req, res) => {
    try {
      const chats = await storage.getChatsByUserId(null);
      res.json(chats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  // Create a new chat
  app.post("/api/chats", async (req, res) => {
    try {
      const chatId = randomUUID();
      const chatData = insertChatSchema.parse({
        id: chatId,
        title: "New Chat",
        userId: null,
      });

      const chat = await storage.createChat(chatData);
      
      // Больше не создаем автоматическое первое сообщение
      // Вместо этого, приветствие будет показываться на фронтенде
      
      res.status(201).json(chat);
    } catch (error) {
      res.status(400).json({ message: "Failed to create chat" });
    }
  });

  // Get a specific chat with its messages
  app.get("/api/chats/:chatId", async (req, res) => {
    try {
      const chatId = req.params.chatId;
      const chat = await storage.getChatById(chatId);
      
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }
      
      const messages = await storage.getMessagesByChatId(chatId);
      res.json({ chat, messages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chat" });
    }
  });



  // Send a message and get a response from the AI
  app.post("/api/chats/:chatId/messages", async (req, res) => {
    try {
      const chatId = req.params.chatId;
      const { content, audioData } = req.body;
      
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Create user message
      const userMessageData = insertMessageSchema.parse({
        chatId,
        role: "user",
        content,
      });
      
      await storage.createMessage(userMessageData);
      
      // Это значение будет использоваться, только если обнаружена ошибка 404 с сообщением о неактивном webhook
      // В других случаях будем ждать ответа от webhook
      let aiResponse = "";
      
      // Получаем настройки webhook из хранилища
      const settings = await storage.getSettings();
      const webhookUrl = settings.webhook.url;
      const webhookEnabled = settings.webhook.enabled;
      
      // Проверяем, включен ли webhook
      if (!webhookEnabled) {
        console.log("Webhook is disabled in settings");
        return res.status(201).json({
          id: -1,
          chatId,
          role: "assistant",
          content: "typing",
          createdAt: new Date().toISOString(),
          typing: true
        });
      }
      
      // Не выполняем предварительную активацию webhook, требуется ручная активация
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Подготовка данных для отправки на webhook
      const requestTime = new Date().toISOString();
      
      // Создаем уникальный идентификатор сессии для пользователя на основе chatId
      // Это позволит n8n сохранять историю диалогов для каждого пользователя
      const sessionId = chatId;
      
      const requestBody: any = { 
        message: content,
        // Добавляем структурированное сообщение с текстом и голосом
        message_data: {
          text: content,
          // voice будет null если нет аудиоданных
          voice: audioData || null
        },
        // Добавляем время запроса для аналитики
        timestamp: requestTime,
        request_time: requestTime,
        // Добавляем идентификатор сессии для работы памяти в n8n
        session_id: sessionId
      };
      
      // Если есть аудио данные, добавляем их также как отдельную переменную
      if (audioData) {
        requestBody.audio = audioData;
        console.log("Including audio data in webhook request (audio data length: " + (audioData?.length || 0) + " characters)");
      }
      
      // Если есть файл, добавляем его как отдельную переменную верхнего уровня (не вложенный объект)
      const fileData = req.body.fileData;
      if (fileData) {
        // Добавляем файл как отдельный параметр верхнего уровня для n8n
        requestBody.file = fileData.content;
        requestBody.file_name = fileData.name;
        requestBody.file_type = fileData.type;
        // Также добавим адрес сообщения с указанием, что к нему прикреплен файл
        requestBody.message = `${content} [с приложенным файлом: ${fileData.name}]`;
        console.log(`Including file data in webhook request (${fileData.name}, type: ${fileData.type})`);
      }
      
      // Если есть массив файлов, обрабатываем его
      const filesData = req.body.filesData;
      if (filesData && filesData.length > 0) {
        // Если файл еще не установлен (из fileData), используем первый файл как основной
        if (!fileData) {
          requestBody.file = filesData[0].content;
          requestBody.file_name = filesData[0].name;
          requestBody.file_type = filesData[0].type;
          // Также добавим адрес сообщения с указанием количества файлов
          requestBody.message = `${content} [с приложенными файлами (${filesData.length})]`;
        }
        
        // Также добавляем все файлы как массив для возможной обработки
        requestBody.files = filesData.map((f: { content: string, name: string, type: string, size?: number }) => ({
          content: f.content,
          name: f.name,
          type: f.type
        }));
        
        console.log(`Including multiple files (${filesData.length}) in webhook request`);
      }
      
      console.log("Sending webhook request:", {
        url: webhookUrl,
        body: { 
          message: content, 
          hasAudio: !!audioData,
          hasVoice: !!audioData,
          messageData: requestBody.message_data,
          sessionId: sessionId
        }
      });
      console.log("Request payload size:", JSON.stringify(requestBody).length, "bytes");
      
      try {
        // Отправляем событие "typing" через WebSocket сразу после отправки на webhook
        (app as any).notifyClientsInChat(chatId, {
          type: 'typing',
          chatId,
          status: 'started',
          timestamp: new Date().toISOString()
        });
        
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        console.log("Webhook response status:", response.status);
        
        // Пытаемся получить данные JSON
        try {
          const data = await response.json();
          console.log("Webhook response data:", JSON.stringify(data, null, 2));
          
          // Проверяем, получили ли мы ответ о незарегистрированном webhook
          if (response.status === 404 && data && typeof data === 'object' && 'message' in data && 
              (data as any).message.includes("webhook") && 
              (data as any).message.includes("not registered")) {
            console.log("Webhook not registered - returning typing status");
            
            // Отправляем статус через WebSocket
            (app as any).notifyClientsInChat(chatId, {
              type: 'typing',
              chatId,
              status: 'error',
              error: 'webhook_not_registered',
              timestamp: new Date().toISOString()
            });
            
            return res.status(201).json({
              id: -1,
              chatId,
              role: "assistant",
              content: "typing",
              createdAt: new Date().toISOString(),
              typing: true
            });
          }
          // Обработка всех возможных форматов ответа от webhook
          else if (data) {
            // Определяем тип данных для TypeScript
            const responseData = data as any;
            
            // Вариант 1: Массив объектов с форматированными данными
            if (Array.isArray(responseData)) {
              const item = responseData[0];
              if (item) {
                if (typeof item === 'string') {
                  aiResponse = item;
                } else if (typeof item === 'object') {
                  const objItem = item as any;
                  if (objItem.message && objItem.message.content) {
                    aiResponse = objItem.message.content;
                  } else if (objItem.output) {
                    aiResponse = objItem.output;
                  } else if (objItem.choices && objItem.choices[0] && objItem.choices[0].message && objItem.choices[0].message.content) {
                    aiResponse = objItem.choices[0].message.content;
                  } else if (objItem.text) {
                    aiResponse = objItem.text;
                  } else if (objItem.result) {
                    aiResponse = objItem.result;
                  }
                }
              }
            } 
            // Вариант 2: Объект в формате OpenAI API
            else if (responseData.choices && Array.isArray(responseData.choices) && responseData.choices[0]) {
              const choice = responseData.choices[0] as any;
              if (choice.message && choice.message.content) {
                aiResponse = choice.message.content;
              } else if (choice.text) {
                aiResponse = choice.text;
              }
            }
            // Вариант 3: Простой объект с ответом
            else if (responseData.response) {
              aiResponse = responseData.response;
            }
            // Вариант 4: Объект с полем text или content
            else if (responseData.text) {
              aiResponse = responseData.text;
            } else if (responseData.content) {
              aiResponse = responseData.content;
            }
            // Вариант 5: Объект с полем message (если это не сообщение об ошибке webhook)
            else if (responseData.message && typeof responseData.message === 'string' && 
                     !responseData.message.includes("webhook") && 
                     !responseData.message.includes("not registered")) {
              aiResponse = responseData.message;
            }
            // Вариант 6: Необработанный текст JSON
            else if (typeof responseData === 'string') {
              aiResponse = responseData;
            }
            
            // Если ответ не обработан ни одним из вариантов, но есть объект JSON
            if (aiResponse === "" && responseData) {
              // Преобразуем весь объект в строку как запасной вариант
              aiResponse = JSON.stringify(responseData);
            }
          }
        } catch (jsonError) {
          console.log("Error parsing JSON from webhook:", jsonError);
          // Пробуем получить текст ответа, если это не JSON
          try {
            const textResponse = await response.text();
            console.log("Webhook text response:", textResponse);
            if (textResponse && textResponse.length > 0) {
              aiResponse = textResponse;
            } else if (response.status === 200) {
              // Если статус 200, но ответ пустой, просто ждем ответа от webhook
              aiResponse = "typing";
              // Не создаем сообщение от ассистента, если нет ответа - вместо этого отправляем специальный статус
              return res.status(201).json({
                id: -1,
                chatId,
                role: "assistant",
                content: aiResponse,
                createdAt: new Date().toISOString(),
                typing: true
              });
            }
          } catch (textError) {
            console.log("Error getting text from webhook:", textError);
            // Если не можем получить текст, ждем ответа от webhook
            if (response.status === 200) {
              aiResponse = "typing";
              // Не создаем сообщение от ассистента, если нет ответа
              return res.status(201).json({
                id: -1,
                chatId,
                role: "assistant",
                content: aiResponse,
                createdAt: new Date().toISOString(),
                typing: true
              });
            }
          }
        }
      } catch (error) {
        console.log("Error contacting webhook:", error);
        // Оставляем сообщение по умолчанию
      }
      
      // Create AI message
      const aiMessageData = insertMessageSchema.parse({
        chatId,
        role: "assistant",
        content: aiResponse,
      });
      
      const aiMessage = await storage.createMessage(aiMessageData);
      
      // Отправляем событие об окончании набора текста через WebSocket
      (app as any).notifyClientsInChat(chatId, {
        type: 'typing',
        chatId,
        status: 'finished',
        messageId: aiMessage.id,
        timestamp: new Date().toISOString()
      });
      
      res.status(201).json(aiMessage);
    } catch (error) {
      console.error("Message error:", error);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  // Получение настроек
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // Обновление настроек
  app.put("/api/settings", async (req, res) => {
    try {
      const settings = settingsSchema.parse(req.body);
      const updatedSettings = await storage.updateSettings(settings);
      res.json(updatedSettings);
    } catch (error) {
      res.status(400).json({ message: "Failed to update settings" });
    }
  });

  // Обновление только URL вебхука
  app.put("/api/settings/webhook", async (req, res) => {
    try {
      const { url, enabled } = req.body;
      if (typeof url !== 'string') {
        return res.status(400).json({ message: "URL must be a string" });
      }
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "Enabled must be a boolean" });
      }
      
      const updatedSettings = await storage.updateWebhookUrl(url, enabled);
      res.json(updatedSettings);
    } catch (error) {
      res.status(400).json({ message: "Failed to update webhook URL" });
    }
  });
  
  // Обновление только настроек интеграции
  app.put("/api/settings/integration", async (req, res) => {
    try {
      const { integration } = req.body;
      if (!integration || typeof integration !== 'object') {
        return res.status(400).json({ message: "Integration settings must be an object" });
      }
      
      // Получаем текущие настройки
      const currentSettings = await storage.getSettings();
      
      // Обновляем только настройки интеграции
      const updatedSettings = {
        ...currentSettings,
        integration
      };
      
      const result = await storage.updateSettings(updatedSettings);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: "Failed to update integration settings" });
    }
  });
  
  // Обновление только настроек UI
  app.put("/api/settings/ui", async (req, res) => {
    try {
      const { ui } = req.body;
      if (!ui || typeof ui !== 'object') {
        return res.status(400).json({ message: "UI settings must be an object" });
      }
      
      // Получаем текущие настройки
      const currentSettings = await storage.getSettings();
      
      // Обновляем только настройки UI
      const updatedSettings = {
        ...currentSettings,
        ui
      };
      
      const result = await storage.updateSettings(updatedSettings);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: "Failed to update UI settings" });
    }
  });
  
  // Обновление только настроек базы данных
  app.put("/api/settings/database", async (req, res) => {
    try {
      const { database } = req.body;
      if (!database || typeof database !== 'object') {
        return res.status(400).json({ message: "Database settings must be an object" });
      }
      
      // Получаем текущие настройки
      const currentSettings = await storage.getSettings();
      
      // Обновляем только настройки базы данных
      const updatedSettings = {
        ...currentSettings,
        database
      };
      
      const result = await storage.updateSettings(updatedSettings);
      res.json(result);
    } catch (error) {
      console.error("Failed to update database settings:", error);
      res.status(400).json({ message: "Failed to update database settings" });
    }
  });
  
  // Маршрут для синхронизации настроек с Supabase
  app.post("/api/sync-supabase-settings", async (req, res) => {
    try {
      console.log("Получен запрос на синхронизацию настроек", req.body);
      
      // Проверяем, настроен ли Supabase
      if (!isSupabaseConfigured()) {
        return res.status(400).json({
          success: false,
          message: "Supabase не настроен. Установите переменные окружения SUPABASE_URL и SUPABASE_KEY."
        });
      }
      
      // Получаем текущие настройки
      const settings = await storage.getSettings();
      
      // Получаем настройки из запроса, если они есть
      if (req.body && req.body.settings && req.body.settings.database) {
        const clientSettings = req.body.settings;
        
        // Обновляем настройки базы данных из клиентских настроек
        settings.database = {
          ...settings.database,
          ...clientSettings.database,
          enabled: true,
          type: "supabase",
          supabase: {
            ...settings.database.supabase,
            ...clientSettings.database.supabase
          }
        };
      } else {
        // Если нет настроек в запросе, просто устанавливаем тип Supabase
        settings.database.enabled = true;
        settings.database.type = "supabase";
      }
      
      console.log("Обновленные настройки для сохранения:", settings);
      
      // Сохраняем обновленные настройки
      const updatedSettings = await storage.updateSettings(settings);
      
      // Перезагружаем хранилище для применения новых настроек
      await initStorage();
      
      res.json({
        success: true,
        message: "Настройки успешно синхронизированы с Supabase",
        settings: updatedSettings
      });
    } catch (error: any) {
      console.error("Ошибка при синхронизации настроек с Supabase:", error);
      res.status(500).json({
        success: false,
        message: "Произошла ошибка при синхронизации настроек: " + (error.message || "Неизвестная ошибка")
      });
    }
  });
  
  // Маршрут для проверки соединения с Supabase
  app.get("/api/test-supabase-connection", async (req, res) => {
    try {
      // Проверяем, настроен ли Supabase
      if (!isSupabaseConfigured()) {
        return res.json({
          connected: false,
          error: "Supabase URL и ключ не настроены. Установите переменные окружения SUPABASE_URL и SUPABASE_KEY."
        });
      }
      
      // Проверяем соединение
      const connected = await testSupabaseConnection();
      
      if (connected) {
        res.json({ connected: true });
      } else {
        res.json({
          connected: false,
          error: "Не удалось подключиться к Supabase. Проверьте URL и ключ API."
        });
      }
    } catch (error) {
      console.error("Ошибка при проверке соединения с Supabase:", error);
      res.status(500).json({
        connected: false,
        error: "Произошла ошибка при проверке соединения: " + (error instanceof Error ? error.message : String(error))
      });
    }
  });

  // Обработчик для widget.js - отдельный маршрут для доступа к виджету
  app.get('/widget.js', (req, res) => {
    try {
      const widgetPath = path.join(process.cwd(), 'client', 'public', 'widget.js');
      if (fs.existsSync(widgetPath)) {
        res.setHeader('Content-Type', 'application/javascript');
        res.sendFile(widgetPath);
      } else {
        console.error("Widget file not found at path:", widgetPath);
        res.status(404).send("Widget not found");
      }
    } catch (error) {
      console.error("Error serving widget.js:", error);
      res.status(500).send("Error serving widget");
    }
  });
  
  // Получение статистики использования
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });
  
  // Получение истории диалогов с пагинацией
  app.get("/api/dialogs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      
      const dialogHistory = await storage.getDialogHistory(limit, offset);
      res.json(dialogHistory);
    } catch (error) {
      console.error("Error fetching dialog history:", error);
      res.status(500).json({ message: "Failed to fetch dialog history" });
    }
  });
  
  // Получение сообщений конкретного чата
  app.get("/api/chat/:chatId/messages", async (req, res) => {
    try {
      const chatId = req.params.chatId;
      if (!chatId) {
        return res.status(400).json({ message: "Chat ID is required" });
      }
      
      const messages = await storage.getMessagesByChatId(chatId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });
  
  // Обработка URLs для клиентской маршрутизации (React Router)
  // Только для конкретных путей, чтобы не перехватывать запросы Vite в development
  app.get(['/login', '/cabinet', '/chat/*'], (req, res, next) => {
    // Важно: не перехватываем запросы к файлам для development-сервера
    if (req.path.includes('.') || req.path.startsWith('/src/') || req.path.startsWith('/node_modules/')) {
      return next();
    }
    
    // Находим путь к index.html в зависимости от окружения
    let indexPath;
    if (process.env.NODE_ENV === 'production') {
      indexPath = path.join(process.cwd(), 'dist/client/index.html');
    } else {
      indexPath = path.join(process.cwd(), 'client/index.html');
    }
    
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });

  // Дождемся инициализации хранилища данных
  const storageInstance = await storagePromise;
  console.log('Storage initialized:', storageInstance instanceof MemStorage ? 'MemStorage' : 'SupabaseStorage');
  
  const httpServer = createServer(app);
  
  // Создаем WebSocket сервер с улучшенной обработкой ошибок
  // Оптимизированная конфигурация WebSocketServer для деплоя на Replit
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    // Отключаем сложные настройки, которые могут конфликтовать с прокси Replit
    perMessageDeflate: false,
    // Устанавливаем разумные лимиты для сообщений
    maxPayload: 10 * 1024 * 1024 // 10MB max payload
  });
  
  // Хранилище для клиентов, организованное по чатам
  const clients = new Map<string, Set<WebSocket>>();
  
  // Обработка событий WebSocket с улучшенной поддержкой для Replit
  wss.on('connection', (ws, req) => {
    console.log('WebSocket connected', { 
      headers: { 
        host: req.headers.host,
        origin: req.headers.origin 
      } 
    });
    
    // Добавляем проверку жизни соединения через ping/pong для предотвращения обрыва соединения
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // проверка каждые 30 секунд
    
    // Отправляем сразу же статус соединения клиенту
    try {
      ws.send(JSON.stringify({ 
        type: 'connection_established', 
        timestamp: new Date().toISOString() 
      }));
    } catch (err) {
      console.error('Error sending init message:', err);
    }
    
    let currentChatId: string | null = null;
    
    // Обработка сообщений от клиента с более надежной обработкой ошибок
    ws.on('message', (message) => {
      try {
        // Преобразовываем сообщение в строку и проверяем, не пустое ли оно
        const messageStr = message.toString().trim();
        if (!messageStr) {
          console.warn('Received empty WebSocket message');
          return;
        }
        
        const data = JSON.parse(messageStr);
        console.log('Received WebSocket message:', data);
        
        // Обработка событий подключения к чату
        if (data.type === 'join' && data.chatId) {
          // Запоминаем текущий чат для данного соединения
          currentChatId = data.chatId;
          
          // Добавляем клиента в список для этого чата
          if (!clients.has(data.chatId)) {
            clients.set(data.chatId, new Set());
          }
          clients.get(data.chatId)?.add(ws);
          
          // Отправляем подтверждение
          ws.send(JSON.stringify({ 
            type: 'joined', 
            chatId: data.chatId,
            timestamp: new Date().toISOString()
          }));
          console.log(`Client joined chat: ${data.chatId}`);
        } else if (data.type === 'ping') {
          // Простой ответ на ping для проверки соединения
          ws.send(JSON.stringify({ 
            type: 'pong', 
            timestamp: new Date().toISOString() 
          }));
        }
        
        // Обработка других типов сообщений можно добавить здесь
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        
        // Отправляем сообщение об ошибке клиенту, чтобы он знал, что что-то пошло не так
        try {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Failed to process message',
            timestamp: new Date().toISOString()
          }));
        } catch (sendError) {
          console.error('Error sending error message:', sendError);
        }
      }
    });
    
    // Обработка ошибок WebSocket соединения
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearInterval(pingInterval);
    });
    
    // Обработка закрытия соединения
    ws.on('close', (code, reason) => {
      console.log(`WebSocket closed with code ${code}`, reason.toString());
      clearInterval(pingInterval);
      
      // Удаляем клиента из всех чатов, где он был подписан
      if (currentChatId && clients.has(currentChatId)) {
        clients.get(currentChatId)?.delete(ws);
        
        // Если чат остался без клиентов, удаляем его из Map
        if (clients.get(currentChatId)?.size === 0) {
          clients.delete(currentChatId);
        }
      }
    });
  });
  
  // Функция для отправки события всем клиентам в чате
  const notifyClientsInChat = (chatId: string, data: any) => {
    const chatClients = clients.get(chatId);
    if (chatClients) {
      console.log(`Notifying ${chatClients.size} clients in chat ${chatId}`);
      
      chatClients.forEach((client) => {
        // Проверяем, что соединение открыто
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  };
  
  // Экспортируем функцию для использования в других маршрутах
  (app as any).notifyClientsInChat = notifyClientsInChat;
  
  return httpServer;
}
