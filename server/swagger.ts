import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

// Опции для Swagger
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Dimpulse-AI API',
      version: '1.0.0',
      description: 'API документация для Dimpulse-AI',
    },
    servers: [
      {
        url: 'http://localhost:3002',
        description: 'Локальный сервер разработки',
      },
    ],
  },
  // Пути к файлам с комментариями JSDoc
  apis: ['./server/routes.ts', './server/*.ts'],
};

// Инициализация Swagger
const specs = swaggerJsdoc(options);

// Функция для подключения Swagger к Express приложению
export const setupSwagger = (app: Express) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
  console.log('Swagger документация доступна по адресу: /api-docs');
};
