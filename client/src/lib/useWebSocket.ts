import { useState, useEffect, useCallback } from 'react';

const MAX_RECONNECT_ATTEMPTS = 3;
const BASE_DELAY = 2000;
const MAX_DELAY = 10000;

// Типы сообщений WebSocket
export type WebSocketMessage = {
  type: string;
  data?: any;
  message?: string;
};

// Состояние WebSocket соединения
export type WebSocketState = 'connecting' | 'open' | 'closing' | 'closed' | 'error';

// Хук для работы с WebSocket
export const useWebSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [state, setState] = useState<WebSocketState>('closed');
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [polling, setPolling] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  
  // Функция для подключения к WebSocket
  const connect = useCallback(() => {
    try {
      // Проверяем, поддерживается ли WebSocket
      if (!window.WebSocket) {
        setError(new Error('WebSocket не поддерживается в этом браузере'));
        setState('error');
        return;
      }
      
      // Закрываем предыдущее соединение, если оно существует
      if (socket) {
        socket.close();
      }
      
      // Создаем новое соединение
      setState('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;
      console.log(`Подключение к WebSocket: ${wsUrl}`);
      
      const newSocket = new WebSocket(wsUrl);
      
      // Обработчики событий WebSocket
      newSocket.onopen = () => {
        console.log('WebSocket соединение установлено');
        setState('open');
        setReconnectAttempt(0);
      };
      
      newSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Получено сообщение WebSocket:', data);
          setMessages(prev => [...prev, data]);
        } catch (e) {
          console.error('Ошибка при обработке сообщения WebSocket:', e);
        }
      };
      
      newSocket.onclose = () => {
        console.log('WebSocket соединение закрыто');
        setState('closed');
        
        // Пробуем переподключиться
        if (!polling) {
          reconnect(reconnectAttempt + 1);
        }
      };
      
      newSocket.onerror = (event) => {
        console.error('Ошибка WebSocket:', event);
        setError(new Error('Ошибка WebSocket соединения'));
        setState('error');
      };
      
      setSocket(newSocket);
      
    } catch (e) {
      console.error('Ошибка при создании WebSocket соединения:', e);
      setError(e instanceof Error ? e : new Error('Неизвестная ошибка WebSocket'));
      setState('error');
    }
  }, [socket, reconnectAttempt, polling]);
  
  // Функция для переподключения
  const reconnect = useCallback(async (attempt: number) => {
    setReconnectAttempt(attempt);
    
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      console.log('Max reconnect attempts reached, switching to polling mode');
      setPolling(true);
      return;
    }

    const delay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
    console.log(`Attempting to reconnect (${attempt}/${MAX_RECONNECT_ATTEMPTS}) after ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    connect();
  }, [connect]);
  
  // Функция для отправки сообщений
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, [socket]);
  
  // Функция для отключения от WebSocket
  const disconnect = useCallback(() => {
    if (socket) {
      socket.close();
      setSocket(null);
      setState('closed');
    }
  }, [socket]);
  
  // Автоматически подключаемся при монтировании компонента
  useEffect(() => {
    // В Vercel не используем WebSocket
    const isVercel = window.location.hostname.includes('vercel.app');
    if (isVercel) {
      console.log('WebSocket отключен в среде Vercel');
      return;
    }
    
    if (!polling) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect, polling]);
  
  return {
    socket,
    state,
    messages,
    error,
    sendMessage,
    connect,
    disconnect,
    isConnected: state === 'open',
    polling
  };
};