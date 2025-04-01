FROM node:20-alpine as builder

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Второй этап для создания минимального образа
FROM node:20-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем только production зависимости
RUN npm ci --only=production

# Копируем собранное приложение из предыдущего этапа
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Создаем директорию для логов
RUN mkdir -p logs

# Экспортируем порт
EXPOSE 3002

# Запускаем приложение
CMD ["node", "dist/index.js"]
