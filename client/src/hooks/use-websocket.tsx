import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../lib/queryClient';

// Эмуляция статусов WebSocket для обратной совместимости с остальным кодом
type WebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

interface UseWebSocketOptions {
  onMessage?: (data: any) => void;
  onStatusChange?: (status: WebSocketStatus) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketResult {
  status: WebSocketStatus;
  sendMessage: (data: any) => void;
  joinChat: (chatId: string) => void;
}

// Гибридная реализация: пробуем сначала WebSocket, а потом при необходимости fallback на polling
export const useWebSocket = (
  chatId: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketResult => {
  // Сохраняем совместимость с остальным кодом
  const [status, setStatus] = useState<WebSocketStatus>('closed');
  
  // Интервал опроса для эмуляции WebSocket
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Последний полученный timestamp для предотвращения дубликатов
  const lastMessageTimestamp = useRef<string | null>(null);
  
  // Активный chatId
  const activeChatIdRef = useRef<string | null>(null);
  
  // Счетчик попыток переподключения WebSocket
  const reconnectCountRef = useRef<number>(0);
  
  // WebSocket соединение
  const wsRef = useRef<WebSocket | null>(null);
  
  // Режим работы: "websocket" или "polling"
  const modeRef = useRef<'websocket' | 'polling'>('websocket');
  
  const {
    onMessage,
    onStatusChange,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options;
  
  // Опрос сервера для получения обновлений для текущего чата
  const pollForUpdates = useCallback(async () => {
    if (!activeChatIdRef.current) {
      return;
    }
    
    try {
      // Делаем запрос к API для получения обновлений для текущего чата
      // Обычно это будет маршрут /api/chats/:chatId/messages с параметром since=timestamp
      const timestamp = lastMessageTimestamp.current || new Date().toISOString();
      const response = await apiRequest(`/api/chats/${activeChatIdRef.current}?t=${Date.now()}`);
      
      // Если чат обновился с момента последнего опроса, обрабатываем обновления
      if (response && response.messages) {
        // Проверяем, есть ли новые сообщения
        const messages = response.messages;
        if (messages.length > 0) {
          // Обновляем последний timestamp
          lastMessageTimestamp.current = new Date().toISOString();
          
          // Эмулируем событие typing для совместимости с остальным кодом
          onMessage?.({  
            type: 'typing',
            chatId: activeChatIdRef.current,
            status: 'started',
            timestamp: new Date().toISOString()
          });
          
          // Для каждого сообщения от ассистента имитируем событие typing finished
          messages.forEach((message: { role: string, id: string }) => {
            if (message.role === 'assistant') {
              onMessage?.({  
                type: 'typing',
                chatId: activeChatIdRef.current,
                status: 'finished',
                messageId: message.id,
                timestamp: new Date().toISOString()
              });
            }
          });
        }
      }
    } catch (error) {
      console.error('Error polling for updates:', error);
      // Не меняем статус при ошибке опроса, просто логируем
    }
  }, [onMessage]);
  
  // Функция запуска polling режима
  const startPolling = useCallback(() => {
    console.log('Starting polling as fallback');
    setStatus('open');
    onStatusChange?.('open');
    
    // Отправляем сообщение о соединении для совместимости
    onMessage?.({  
      type: 'connection_established',
      timestamp: new Date().toISOString()
    });
    
    // Запускаем интервальный опрос
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    pollIntervalRef.current = setInterval(pollForUpdates, reconnectInterval);
  }, [onMessage, onStatusChange, pollForUpdates, reconnectInterval]);
  
  // Эмуляция подключения к чату
  const joinChat = useCallback((newChatId: string) => {
    console.log(`Joining chat ${newChatId} via polling API`);
    activeChatIdRef.current = newChatId;
    
    // Уведомляем о "подключении"
    setStatus('open');
    onStatusChange?.('open');
    
    // Имитируем сообщение о подключении к чату
    onMessage?.({
      type: 'joined',
      chatId: newChatId,
      timestamp: new Date().toISOString()
    });
  }, [onMessage, onStatusChange]);
  
  // Гибридная функция отправки сообщения через WebSocket или HTTP API
  const sendMessage = useCallback((data: any) => {
    if (!activeChatIdRef.current) {
      console.warn('Cannot send message, not connected to any chat');
      return;
    }
    
    // Обработка ping сообщений
    if (data.type === 'ping') {
      if (modeRef.current === 'websocket' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Отправляем ping через WebSocket
        wsRef.current.send(JSON.stringify(data));
      } else {
        // В режиме polling эмулируем получение pong
        console.log('Emulating pong response in polling mode');
        setTimeout(() => {
          onMessage?.({
            type: 'pong',
            timestamp: new Date().toISOString()
          });
        }, 50);
      }
      return;
    }
    
    // Обработка join сообщений
    if (data.type === 'join') {
      // Через WebSocket отправляем join, в режиме polling обрабатываем локально
      if (modeRef.current === 'websocket' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
      } else {
        // В polling режиме join уже обрабатывается в функции joinChat
        console.log('Join message handled by joinChat in polling mode');
      }
      return;
    }
    
    // Для других типов сообщений
    if (modeRef.current === 'websocket' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Отправляем через WebSocket если соединение открыто
      console.log('Sending message via WebSocket:', data);
      try {
        wsRef.current.send(JSON.stringify(data));
      } catch (error) {
        console.error('Error sending message via WebSocket:', error);
        // При ошибке отправки через WebSocket переключаемся на HTTP API
        console.log('Fallback to HTTP API after WebSocket send error');
        
        apiRequest(`/api/chats/${activeChatIdRef.current}/ws-message`, {
          method: 'POST',
          data: data
        }).catch((apiError: Error) => {
          console.error('Error sending message via HTTP API fallback:', apiError);
          setStatus('error');
          onStatusChange?.('error');
        });
      }
    } else {
      // В режиме polling или если WebSocket не доступен - используем HTTP API
      console.log('Sending message via HTTP API:', data);
      
      apiRequest(`/api/chats/${activeChatIdRef.current}/ws-message`, {
        method: 'POST',
        data: data
      }).catch((error: Error) => {
        console.error('Error sending message via HTTP API:', error);
        setStatus('error');
        onStatusChange?.('error');
      });
    }
  }, [onMessage, onStatusChange]);
  
  // Используем уже определенную выше функцию pollForUpdates
  
  // Создание нового WebSocket соединения с улучшенной обработкой ошибок
  const createWebSocket = useCallback(() => {
    // Если уже есть соединение, закрываем его
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }
    
    try {
      console.log(`Connecting to WebSocket at ${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`);
      setStatus('connecting');
      onStatusChange?.('connecting');
      
      // Создаем WebSocket соединение
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket status changed: open');
        setStatus('open');
        onStatusChange?.('open');
        
        // Сбрасываем счетчик попыток переподключения при успешном соединении
        reconnectCountRef.current = 0;
        
        // Если есть активный чат, присоединяемся к нему
        if (activeChatIdRef.current) {
          ws.send(JSON.stringify({
            type: 'join',
            chatId: activeChatIdRef.current
          }));
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          onMessage?.(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      ws.onerror = (event) => {
        // Уменьшаем уровень логирования ошибок
        if (reconnectCountRef.current === 0) {
          console.error('WebSocket error:', event);
        } else if (reconnectCountRef.current === 1) {
          // Ограничиваем логи после первой ошибки
          console.warn('WebSocket reconnection issue, will try again once');
        }
        
        setStatus('error');
        onStatusChange?.('error');
        
        // Предотвращаем повторные попытки подключения при ошибке на стороне клиента
        reconnectCountRef.current += 1;
        if (reconnectCountRef.current >= 2) {
          console.log('Switching to polling mode after multiple WebSocket errors');
          modeRef.current = 'polling';
          
          // Запускаем polling как fallback при ошибке соединения
          if (!pollIntervalRef.current) {
            startPolling();
          }
        }
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket status changed: closed', event.code, event.reason);
        setStatus('closed');
        onStatusChange?.('closed');
        
        // Увеличиваем счетчик попыток переподключения
        reconnectCountRef.current += 1;
        
        // Пробуем переподключиться, если не превысили лимит попыток
        if (reconnectCountRef.current <= maxReconnectAttempts) {
          console.log(`Attempting to reconnect (${reconnectCountRef.current}/${maxReconnectAttempts})`);
          setTimeout(createWebSocket, reconnectInterval);
        } else {
          console.log(`Max reconnect attempts (${maxReconnectAttempts}) reached, switching to polling mode`);
          modeRef.current = 'polling';
          
          // Запускаем polling как fallback
          if (!pollIntervalRef.current) {
            console.log('Starting polling as fallback');
            // Небольшая задержка перед началом polling
            setTimeout(() => {
              setStatus('open');
              onStatusChange?.('open');
              
              // Отправляем сообщение о соединении для сохранения совместимости 
              onMessage?.({
                type: 'connection_established',
                timestamp: new Date().toISOString()
              });
              
              // Запускаем интервальный опрос
              pollIntervalRef.current = setInterval(pollForUpdates, reconnectInterval);
            }, 500);
          }
        }
      };
      
      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      // Переключаемся в режим polling при ошибке создания WebSocket
      modeRef.current = 'polling';
      
      // Запускаем polling как основной метод
      if (!pollIntervalRef.current) {
        // Имитируем подключение установкой статуса
        setStatus('open');
        onStatusChange?.('open');
        
        // Отправляем начальное сообщение, имитирующее соединение
        onMessage?.({
          type: 'connection_established',
          timestamp: new Date().toISOString()
        });
        
        // Запускаем интервальный опрос
        pollIntervalRef.current = setInterval(pollForUpdates, reconnectInterval);
      }
    }
  }, [maxReconnectAttempts, onMessage, onStatusChange, pollForUpdates, reconnectInterval, startPolling]);
  
  // Запуск WebSocket или polling при монтировании компонента
  useEffect(() => {
    // Проверяем, доступен ли WebSocket сервер
    // Для локальной разработки начинаем сразу с polling
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('Обнаружена локальная разработка - используем polling по умолчанию');
      modeRef.current = 'polling';
      
      // Имитируем "подключение" установкой статуса
      setStatus('open');
      onStatusChange?.('open');
      
      // Отправляем начальное сообщение, имитирующее соединение
      onMessage?.({
        type: 'connection_established',
        timestamp: new Date().toISOString()
      });
      
      // Запускаем интервальный опрос
      pollIntervalRef.current = setInterval(pollForUpdates, reconnectInterval);
    } else if (modeRef.current === 'websocket') {
      // В режиме WebSocket пытаемся установить соединение
      createWebSocket();
    } else {
      // В режиме polling запускаем опрос
      console.log('Starting in polling mode');
      
      // Имитируем "подключение" установкой статуса
      setStatus('open');
      onStatusChange?.('open');
      
      // Отправляем начальное сообщение, имитирующее соединение
      onMessage?.({
        type: 'connection_established',
        timestamp: new Date().toISOString()
      });
      
      // Запускаем интервальный опрос
      pollIntervalRef.current = setInterval(pollForUpdates, reconnectInterval);
    }
    
    // Если есть chatId, присоединяемся к нему
    if (chatId) {
      joinChat(chatId);
    }
    
    // Очистка при размонтировании
    return () => {
      // Очищаем интервал опроса
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      // Закрываем WebSocket соединение если оно открыто
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
        wsRef.current = null;
      }
      
      setStatus('closed');
      onStatusChange?.('closed');
    };
  }, [chatId, createWebSocket, joinChat, onMessage, onStatusChange, pollForUpdates, reconnectInterval]);
  
  // Обновляем chatId, если он изменился
  useEffect(() => {
    if (chatId && chatId !== activeChatIdRef.current) {
      joinChat(chatId);
    }
  }, [chatId, joinChat]);
  
  return {
    status,
    sendMessage,
    joinChat
  };
};
