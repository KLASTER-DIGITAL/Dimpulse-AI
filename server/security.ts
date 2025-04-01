import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Express } from 'express';
import { logger } from './logger';

// Настройка ограничения запросов
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много запросов с этого IP, пожалуйста, попробуйте позже',
  handler: (req, res, next, options) => {
    logger.warn(`Превышен лимит запросов: ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  },
});

// Настройка безопасности для Express
export const setupSecurity = (app: Express) => {
  // Базовые настройки безопасности
  app.use(helmet());
  
  // Настройка Content-Security-Policy
  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", process.env.SUPABASE_URL || ''],
      },
    })
  );
  
  // Ограничение количества запросов
  app.use('/api/', limiter);
  
  logger.info('Настройки безопасности применены');
};
