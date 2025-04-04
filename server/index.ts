import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { WebSocketServer } from 'ws'; // Added import for WebSocketServer
import { migrateDatabase } from "./migration"; // Импорт функции миграции
import { createAdminUser } from "./auth"; // Импорт функции создания админа
import { isSupabaseConfigured, testSupabaseConnection } from "./supabase"; // Импорт функций для проверки Supabase
import { storage } from "./storage"; // Импорт хранилища данных

// Импортируем новые инструменты
import { setupSwagger } from "./swagger"; // Импорт Swagger для документации API
import { logger, requestLogger, initSentry } from "./logger"; // Импорт логгера и Sentry
import { setupSecurity } from "./security"; // Импорт настроек безопасности


const app = express();
// Увеличиваем лимит размера JSON-запроса для обработки больших файлов
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Добавляем ping/pong для WebSocket
const PING_INTERVAL = 30000; // 30 секунд

// Определяем режим запуска
const isVercelEnv = process.env.VERCEL === '1';
const isLocalMode = process.env.USE_LOCAL_STORAGE === 'true';

// Инициализируем Sentry для отслеживания ошибок
initSentry();

// Настраиваем безопасность приложения
setupSecurity(app);

// Используем middleware для логирования запросов
app.use(requestLogger);

app.use((req, res, next) => {
  // WebSocket ping/pong будет добавлен в обработчик подключения WebSocket

  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
      // Используем структурированное логирование
      logger.info(`API запрос: ${req.method} ${path}`, {
        method: req.method,
        path,
        statusCode: res.statusCode,
        duration,
        response: capturedJsonResponse
      });
    }
  });

  next();
});

(async () => {
  // Определяем среду запуска
  const isVercel = process.env.VERCEL === '1';
  const isLocalMode = process.env.USE_LOCAL_STORAGE === 'true';
  
  // Настраиваем окружение для Vercel
  if (isVercel && !isLocalMode) {
    console.log('Запуск на Vercel с интеграцией Supabase');
    // Не использовать локальный режим на Vercel
    process.env.USE_LOCAL_STORAGE = 'false';
  }
  
  // Запускаем миграцию базы данных и инициализацию сервера
  try {
    // Инициализируем базу данных в зависимости от среды
    await migrateDatabase();
    
    // Создаем администратора
    await createAdminUser();
    
  } catch (error) {
    console.error('Ошибка инициализации сервера:', error);
    // В случае ошибки переходим в локальный режим
    if (!isVercelEnv) {
      process.env.USE_LOCAL_STORAGE = 'true';
      console.log('Переход в локальный режим из-за ошибки');
    }
  }
  
  // Настраиваем обработку ошибок
  process.on('uncaughtException', (err) => {
    console.error('Необработанное исключение:', err);
    logger.error('Необработанное исключение', { error: err });
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Необработанное отклонение promise:', reason);
    logger.error('Необработанное отклонение promise', { reason, promise });
  });
  
  // Инициализируем сервер с обработкой ошибок
  const server = await registerRoutes(app).catch(error => {
    console.error('Ошибка запуска сервера:', error);
    logger.error('Ошибка запуска сервера', { error });
    
    // Создаем фиктивный сервер для предотвращения ошибок типизации
    return require('http').createServer();
  });
  
  // Проверяем, что сервер создан
  if (!server) {
    console.error('Не удалось создать сервер');
    process.exit(1);
  }

  // Настройка WebSocket сервера
  
  if (!isVercelEnv) {
    // Локальная настройка WebSocket
    const wss = new WebSocketServer({ server, clientTracking: true, path: '/ws' });
    
    // Хранение активных соединений
    const clients = new Set<any>();
    
    wss.on('connection', (ws) => {
      console.log('WebSocket подключение установлено');
      clients.add(ws);
      
      // Отправляем приветственное сообщение
      ws.send(JSON.stringify({ type: 'connection', message: 'Подключено к серверу' }));
      
      // Настраиваем интервал для ping/pong
      const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.ping();
        }
      }, PING_INTERVAL);
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('Получено сообщение:', data);
          
          // Обработка сообщений
          if (data.type === 'chat') {
            // Рассылаем сообщение всем клиентам
            clients.forEach((client) => {
              if (client.readyState === ws.OPEN) {
                client.send(JSON.stringify(data));
              }
            });
          }
        } catch (error) {
          console.error('Ошибка обработки сообщения:', error);
        }
      });
      
      ws.on('close', () => {
        console.log('WebSocket соединение закрыто');
        clients.delete(ws);
        clearInterval(pingInterval);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket ошибка:', error);
        clients.delete(ws);
        clearInterval(pingInterval);
      });
      
      ws.on('pong', () => {
        // Обработка pong ответа
        console.log('Получен pong от клиента');
      });
    });
  } else {
    console.log('WebSocket не инициализирован в среде Vercel');
  }



  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Используем порт из переменной окружения или 3003 по умолчанию
  // this serves both the API and the client.
  const port = process.env.PORT || 3003;
  console.log(`Используем порт: ${port}`);
  
  server.listen({
    port: Number(port),
    host: "0.0.0.0",
    family: 4,
  }, () => {
    log(`serving on port ${port}`);
  });
})();