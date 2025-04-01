import { useCallback, useEffect, useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Cabinet from "@/pages/Cabinet";
import ProtectedRoute from "@/components/ProtectedRoute";
import UIStyleProvider from "@/components/ChatGPT/UIStyleProvider";
import LiveStyleEditor from "@/components/StyleEditor/LiveStyleEditor";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Settings } from "@shared/schema";

// Глобальное состояние для отслеживания активации редактора стилей
export const useStyleEditorState = () => {
  // При первой загрузке проверяем localStorage
  const [isStyleEditorActive, setIsStyleEditorActive] = useState(() => {
    const saved = localStorage.getItem('styleEditorActive');
    return saved === 'true';
  });

  // Сохраняем значение в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('styleEditorActive', isStyleEditorActive ? 'true' : 'false');
  }, [isStyleEditorActive]);

  return {
    isStyleEditorActive,
    setIsStyleEditorActive
  };
};

function Router() {
  const { isStyleEditorActive, setIsStyleEditorActive } = useStyleEditorState();
  
  // Получаем настройки для редактора стилей
  const { data: settings } = useQuery({
    queryKey: ['/api/settings'],
    queryFn: async () => {
      try {
        const result = await apiRequest('/api/settings');
        return result;
      } catch (error) {
        console.error("Ошибка при получении настроек:", error);
        return null;
      }
    },
  });

  return (
    <>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/chat/:id" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/cabinet">
          {() => (
            <ProtectedRoute>
              <Cabinet />
            </ProtectedRoute>
          )}
        </Route>
        <Route component={NotFound} />
      </Switch>
      
      {/* Глобальный редактор стилей */}
      {isStyleEditorActive && settings && (
        <LiveStyleEditor
          initialSettings={settings}
          isActive={isStyleEditorActive}
          onClose={() => setIsStyleEditorActive(false)}
        />
      )}
    </>
  );
}

function App() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    const connect = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}/ws`;
        
        ws = new WebSocket(wsUrl, 'chat');

        ws.onopen = () => {
          console.log('WebSocket connected');
          reconnectAttempts = 0;
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`Reconnecting in ${reconnectDelay}ms...`);
            reconnectTimeout = setTimeout(connect, reconnectDelay);
          } else {
            console.log('Max reconnect attempts reached');
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onmessage = (event) => {
          // Handle incoming messages
          console.log('Received message:', event.data);
        };
      } catch (error) {
        console.error('WebSocket connection error:', error);
      }
    };

    connect();

    return () => {
      if (ws) {
        ws.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <UIStyleProvider>
        <Router />
      </UIStyleProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
