// Модуль для работы с WebSocket соединениями
import { useState, useEffect, useCallback } from 'react';

// Определяем типы для событий WebSocket
export type WebSocketMessage = {
  type: string;
  data?: any;
  message?: string;
};

// Определяем состояние подключения
export type WebSocketState = 'connecting' | 'open' | 'closing' | 'closed' | 'error';

// Функция для получения URL WebSocket в зависимости от окружения
export const getWebSocketUrl = (): string => {
  const isProduction = import.meta.env.PROD;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  
  // В production используем относительный путь
  if (isProduction) {
    return `${protocol}//${host}/ws`;
  }
  
  // В разработке используем локальный сервер
  return 'ws://localhost:3000/ws';
};

// Хук для работы с WebSocket
export const useWebSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [state, setState] = useState<WebSocketState>('closed');
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [error, setError] = useState<Error | null>(null);
  
  // Функция для отправки сообщений
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, [socket]);
  
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
      const wsUrl = getWebSocketUrl();
      console.log(`Подключение к WebSocket: ${wsUrl}`);
      
      const newSocket = new WebSocket(wsUrl);
      
      // Обработчики событий WebSocket
      newSocket.onopen = () => {
        console.log('WebSocket соединение установлено');
        setState('open');
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
      };
      
      newSocket.onerror = (event) => {
        console.error('Ошибка WebSocket:', event);
        setError(new Error('Ошибка WebSocket соединения'));
        setState('error');
      };
      
      setSocket(newSocket);
      
      // Настраиваем автоматическое переподключение
      return () => {
        if (newSocket) {
          newSocket.close();
        }
      };
    } catch (e) {
      console.error('Ошибка при создании WebSocket соединения:', e);
      setError(e instanceof Error ? e : new Error('Неизвестная ошибка WebSocket'));
      setState('error');
    }
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
    
    const cleanup = connect();
    
    return () => {
      if (cleanup) cleanup();
      disconnect();
    };
  }, [connect, disconnect]);
  
  return {
    socket,
    state,
    messages,
    error,
    sendMessage,
    connect,
    disconnect,
    isConnected: state === 'open'
  };
};

// Создаем глобальный экземпляр WebSocket для использования в приложении
let globalSocket: WebSocket | null = null;

// Функция для получения глобального сокета
export const getGlobalSocket = (): WebSocket | null => {
  if (!globalSocket || globalSocket.readyState !== WebSocket.OPEN) {
    try {
      const wsUrl = getWebSocketUrl();
      globalSocket = new WebSocket(wsUrl);
      
      globalSocket.onopen = () => {
        console.log('Глобальный WebSocket соединение установлено');
      };
      
      globalSocket.onclose = () => {
        console.log('Глобальный WebSocket соединение закрыто');
        globalSocket = null;
      };
      
      globalSocket.onerror = (event) => {
        console.error('Ошибка глобального WebSocket:', event);
        globalSocket = null;
      };
    } catch (e) {
      console.error('Ошибка при создании глобального WebSocket:', e);
      return null;
    }
  }
  
  return globalSocket;
};

// Функция для отправки сообщения через глобальный сокет
export const sendGlobalMessage = (message: WebSocketMessage): boolean => {
  const socket = getGlobalSocket();
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
};
