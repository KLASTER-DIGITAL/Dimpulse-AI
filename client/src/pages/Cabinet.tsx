import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useStyleEditorState } from "@/App";

// UI components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { 
  Sheet,
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle, 
  SheetFooter 
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Interfaces for data
interface Settings {
  webhook: {
    url: string;
    enabled: boolean;
  };
  integration: {
    iframe: {
      enabled: boolean;
      theme: "light" | "dark" | "transparent";
    };
    widget: {
      enabled: boolean;
      position: "left" | "right";
      theme: "light" | "dark";
      fontSize: number;
      width: number;
      height: number;
      text: string;
      buttonColor: string;
      pulsation: boolean;
      icon?: string;
    };
  };
  ui: {
    enabled: boolean;
    colorSchemeEnabled: boolean;
    colors: {
      primary: string;
      secondary: string;
      accent: string;
    };
    elements: {
      roundedCorners: boolean;
      shadows: boolean;
      animations: boolean;
    };
  };
  database: {
    enabled: boolean;
    type: "local" | "supabase";
    supabase: {
      tables: {
        messages: string;
        chats: string;
        users: string;
        files: string;
      };
      schema: string;
      autoMigrate: boolean;
    };
  };
}

interface Stats {
  totalUsers: number;
  totalChats: number;
  totalMessages: number;
  activeUsersLast24h: number;
  activeChatsLast24h: number;
  messagesPerDay: Array<{
    date: string;
    count: number;
  }>;
  topChats: Array<{
    chatId: string;
    title: string;
    messageCount: number;
  }>;
}

interface Chat {
  id: string;
  title: string;
  userId: number | null;
  createdAt: string;
  lastActive: string;
}

interface DialogsResponse {
  chats: Chat[];
  totalCount: number;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
}

interface SelectedChat {
  chat: Chat | null;
  messages: Message[] | null;
}

const defaultSettings: Settings = {
  webhook: {
    url: "https://n8n.klaster.digital/webhook-test/4a1fed67-dcfb-4eb8-a71b-d47b1d651509",
    enabled: true,
  },
  integration: {
    iframe: {
      enabled: false,
      theme: "dark",
    },
    widget: {
      enabled: false,
      position: "left",
      theme: "dark",
      fontSize: 16,
      width: 640,
      height: 480,
      text: "Есть вопросы? пишите!",
      buttonColor: "#4b6cf7",
      pulsation: true,
      icon: ""
    },
  },
  ui: {
    enabled: false,
    colorSchemeEnabled: false,
    colors: {
      primary: "#10a37f",
      secondary: "#343541",
      accent: "#202123"
    },
    elements: {
      roundedCorners: true,
      shadows: true,
      animations: true
    }
  },
  database: {
    enabled: false,
    type: "local",
    supabase: {
      tables: {
        messages: "messages",
        chats: "chats",
        users: "users",
        files: "files"
      },
      schema: "public",
      autoMigrate: true
    }
  }
};

const Cabinet = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  // Используем глобальное состояние редактора стилей из App.tsx
  const { isStyleEditorActive, setIsStyleEditorActive } = useStyleEditorState();

  // Состояние для пагинации диалогов
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10; // Размер страницы для пагинации

  // Интерфейс для выбранного чата и его сообщений
  interface SelectedChat {
    chat: Chat | null;
    messages: Message[];
  }

  // Состояние для просмотра диалога в боковой панели
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [showChatSidebar, setShowChatSidebar] = useState(false);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);

  // Запрос настроек с сервера
  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      try {
        const result = await apiRequest("/api/settings");
        return result as Settings;
      } catch (error) {
        console.error("Ошибка при получении настроек:", error);
        // Если настройки не получены, используем значения по умолчанию
        return defaultSettings;
      }
    },
  });

  const [webhookUrl, setWebhookUrl] = useState<string>(settings?.webhook.url || defaultSettings.webhook.url);
  const [webhookEnabled, setWebhookEnabled] = useState<boolean>(defaultSettings.webhook.enabled);
  const [iframeEnabled, setIframeEnabled] = useState<boolean>(defaultSettings.integration.iframe.enabled);
  const [iframeTheme, setIframeTheme] = useState<"light" | "dark" | "transparent">(defaultSettings.integration.iframe.theme);
  const [widgetEnabled, setWidgetEnabled] = useState<boolean>(defaultSettings.integration.widget.enabled);
  const [widgetPosition, setWidgetPosition] = useState<"left" | "right">(defaultSettings.integration.widget.position);
  const [widgetTheme, setWidgetTheme] = useState<"light" | "dark">(defaultSettings.integration.widget.theme);
  const [widgetText, setWidgetText] = useState<string>("Есть вопросы? пишите!");
  const [widgetWidth, setWidgetWidth] = useState<number>(640);
  const [widgetHeight, setWidgetHeight] = useState<number>(480);
  const [widgetFontSize, setWidgetFontSize] = useState<number>(16);
  const [widgetButtonColor, setWidgetButtonColor] = useState<string>("#4b6cf7");
  const [widgetPulsation, setWidgetPulsation] = useState<boolean>(true);
  const [widgetIcon, setWidgetIcon] = useState<string>("");
  const [showWidgetPreview, setShowWidgetPreview] = useState(false);

  // Состояние проверки соединения с Supabase
  const [isCheckingConnection, setIsCheckingConnection] = useState<boolean>(false);
  const [supabaseConnectionStatus, setSupabaseConnectionStatus] = useState<{success: boolean; message: string} | null>(null);
  
  // Состояние синхронизации с Supabase
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<{success: boolean; message: string} | null>(null);

  // Функция для удаления превью виджета
  const removeWidgetPreview = () => {
    // Удаляем скрипт виджета
    const existingScript = document.getElementById('widget-preview-script');
    if (existingScript) {
      document.head.removeChild(existingScript);
    }
    
    // Удаляем все элементы виджета (поиск по всем возможным классам)
    const selectors = [
      '.chat-widget-button', 
      '.chat-widget-container', 
      '.intercom-widget-container',
      '.intercom-widget-launcher',
      '.intercom-widget-chatbox'
    ];
    
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => element.remove());
    });
  };

  // Функция для создания превью виджета
  const createWidgetPreview = () => {
    // Очищаем предыдущий виджет если есть
    removeWidgetPreview();

    // Создаем и добавляем новый скрипт
    const script = document.createElement('script');
    script.id = 'widget-preview-script';

    // Добавляем обработку иконки
    const iconAttribute = widgetIcon ? 
      `s.setAttribute('data-icon', '${widgetIcon}');
       // Добавляем стили для иконки в виджете
       const style = document.createElement('style');
       style.textContent = \`
         .chat-widget-button img {
           width: 24px;
           height: 24px;
           object-fit: contain;
         }
       \`;
       document.head.appendChild(style);` 
      : '';

    script.textContent = `
      (function(d, w) {
        var s = d.createElement('script');
        s.src = '${window.location.origin}/widget.js';
        s.setAttribute('data-position', '${widgetPosition}');
        s.setAttribute('data-theme', '${widgetTheme}');
        s.setAttribute('data-width', '${widgetWidth}px');
        s.setAttribute('data-height', '${widgetHeight}px');
        s.setAttribute('data-font-size', '${widgetFontSize}');
        s.setAttribute('data-greeting', '${widgetText}');
        s.setAttribute('data-button-color', '${widgetButtonColor}');
        s.setAttribute('data-pulsation', '${widgetPulsation}');
        ${iconAttribute}
        d.head.appendChild(s);
      })(document, window);
    `;

    document.head.appendChild(script);
    return removeWidgetPreview;
  };

  // UI настройки
  const [uiEnabled, setUiEnabled] = useState<boolean>(
    settings?.ui?.enabled || defaultSettings.ui.enabled
  );
  const [uiColorSchemeEnabled, setUiColorSchemeEnabled] = useState<boolean>(
    settings?.ui?.colorSchemeEnabled !== undefined ? settings.ui.colorSchemeEnabled : defaultSettings.ui.colorSchemeEnabled
  );
  const [primaryColor, setPrimaryColor] = useState<string>(
    settings?.ui?.colors.primary || defaultSettings.ui.colors.primary
  );
  const [secondaryColor, setSecondaryColor] = useState<string>(
    settings?.ui?.colors.secondary || defaultSettings.ui.colors.secondary
  );
  const [accentColor, setAccentColor] = useState<string>(
    settings?.ui?.colors.accent || defaultSettings.ui.colors.accent
  );
  const [roundedCorners, setRoundedCorners] = useState<boolean>(
    settings?.ui?.elements.roundedCorners || defaultSettings.ui.elements.roundedCorners
  );
  const [shadows, setShadows] = useState<boolean>(
    settings?.ui?.elements.shadows || defaultSettings.ui.elements.shadows
  );
  const [animations, setAnimations] = useState<boolean>(
    settings?.ui?.elements.animations || defaultSettings.ui.elements.animations
  );

  // Настройки базы данных
  const [databaseEnabled, setDatabaseEnabled] = useState<boolean>(
    settings?.database?.enabled || defaultSettings.database.enabled
  );
  const [databaseType, setDatabaseType] = useState<"local" | "supabase">(
    settings?.database?.type || defaultSettings.database.type
  );
  const [messagesTable, setMessagesTable] = useState<string>(
    settings?.database?.supabase?.tables?.messages || defaultSettings.database.supabase.tables.messages
  );
  const [chatsTable, setChatsTable] = useState<string>(
    settings?.database?.supabase?.tables?.chats || defaultSettings.database.supabase.tables.chats
  );
  const [usersTable, setUsersTable] = useState<string>(
    settings?.database?.supabase?.tables?.users || defaultSettings.database.supabase.tables.users
  );
  const [filesTable, setFilesTable] = useState<string>(
    settings?.database?.supabase?.tables?.files || defaultSettings.database.supabase.tables.files
  );
  const [databaseSchema, setDatabaseSchema] = useState<string>(
    settings?.database?.supabase?.schema || defaultSettings.database.supabase.schema
  );
  const [autoMigrate, setAutoMigrate] = useState<boolean>(
    settings?.database?.supabase?.autoMigrate || defaultSettings.database.supabase.autoMigrate
  );

  // Функция для проверки соединения с Supabase
  const checkSupabaseConnection = async () => {
    setIsCheckingConnection(true);
    setSupabaseConnectionStatus(null);

    try {
      const result = await apiRequest("/api/test-supabase-connection");
      setSupabaseConnectionStatus({
        success: result.connected,
        message: result.connected 
          ? "Соединение с Supabase установлено успешно!" 
          : `Ошибка подключения: ${result.error || "Неизвестная ошибка"}`
      });
    } catch (error) {
      console.error("Ошибка при проверке соединения с Supabase:", error);
      setSupabaseConnectionStatus({
        success: false,
        message: "Произошла ошибка при проверке соединения. Убедитесь, что указаны правильные переменные окружения."
      });
    } finally {
      setIsCheckingConnection(false);
    }
  };

  // Функция для синхронизации настроек с Supabase
  const syncWithSupabase = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    
    try {
      // Собираем текущие настройки базы данных
      const currentDbSettings = {
        database: {
          enabled: databaseEnabled,
          type: databaseType,
          supabase: {
            tables: {
              messages: messagesTable,
              chats: chatsTable,
              users: usersTable,
              files: filesTable
            },
            schema: databaseSchema,
            autoMigrate: autoMigrate
          }
        }
      };

      const result = await apiRequest("/api/sync-supabase-settings", {
        method: "POST",
        data: {
          settings: currentDbSettings
        }
      });

      setSyncStatus({
        success: result.success,
        message: result.message
      });
      
      if (result.success && result.settings) {
        // Обновляем локальные настройки, если получили обновленные данные с сервера
        // Обновляем кэш запроса
        queryClient.setQueryData(["/api/settings"], result.settings);
      }
    } catch (error) {
      console.error("Ошибка при синхронизации настроек с Supabase:", error);
      setSyncStatus({
        success: false,
        message: "Произошла ошибка при синхронизации настроек. Пожалуйста, попробуйте еще раз."
      });
    } finally {
      setIsSyncing(false);
    }
  };



  // Автоматическая синхронизация при запуске
  React.useEffect(() => {
    // Проверяем, что база данных включена и тип базы - Supabase
    if (settings?.database?.enabled && settings?.database?.type === "supabase") {
      // Автоматическая проверка соединения
      checkSupabaseConnection();
    }
  }, [settings]); // Запускаем только при изменении настроек
  
  // Синхронизация после успешного подключения
  React.useEffect(() => {
    if (supabaseConnectionStatus?.success) {
      syncWithSupabase();
    }
  }, [supabaseConnectionStatus]); // Запускаем при изменении статуса подключения

  // Запрос статистики использования
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      try {
        const result = await apiRequest("/api/stats");
        return result as Stats;
      } catch (error) {
        console.error("Ошибка при получении статистики:", error);
        return null;
      }
    },
  });

  // Запрос истории диалогов с пагинацией
  const { data: dialogsData, isLoading: isLoadingDialogs } = useQuery({
    queryKey: ["/api/dialogs", currentPage, pageSize],
    queryFn: async () => {
      try {
        const offset = (currentPage - 1) * pageSize;
        const result = await apiRequest(`/api/dialogs?limit=${pageSize}&offset=${offset}`);
        return result as DialogsResponse;
      } catch (error) {
        console.error("Ошибка при получении истории диалогов:", error);
        return { chats: [], totalCount: 0 };
      }
    },
  });

  // Обновляем локальное состояние когда данные загружены
  React.useEffect(() => {
    if (settings) {
      // Webhook настройки
      if (settings.webhook) {
        setWebhookUrl(settings.webhook.url ?? defaultSettings.webhook.url);
        setWebhookEnabled(settings.webhook.enabled ?? defaultSettings.webhook.enabled);
      }

      // Интеграционные настройки
      if (settings.integration) {
        if (settings.integration.iframe) {
          setIframeEnabled(settings.integration.iframe.enabled ?? defaultSettings.integration.iframe.enabled);
          setIframeTheme(settings.integration.iframe.theme ?? defaultSettings.integration.iframe.theme);
        }
        if (settings.integration.widget) {
          setWidgetEnabled(settings.integration.widget.enabled ?? defaultSettings.integration.widget.enabled);
          setWidgetPosition(settings.integration.widget.position ?? defaultSettings.integration.widget.position);
          setWidgetTheme(settings.integration.widget.theme ?? defaultSettings.integration.widget.theme);
          setWidgetText(settings.integration.widget.text ?? defaultSettings.integration.widget.text);
          setWidgetWidth(settings.integration.widget.width ?? defaultSettings.integration.widget.width);
          setWidgetHeight(settings.integration.widget.height ?? defaultSettings.integration.widget.height);
          setWidgetFontSize(settings.integration.widget.fontSize ?? defaultSettings.integration.widget.fontSize);
          setWidgetButtonColor(settings.integration.widget.buttonColor ?? defaultSettings.integration.widget.buttonColor);
          setWidgetPulsation(settings.integration.widget.pulsation ?? defaultSettings.integration.widget.pulsation);
          setWidgetIcon(settings.integration.widget.icon ?? "");
        }
      }

      // UI настройки
      if (settings.ui) {
        setUiEnabled(settings.ui.enabled ?? defaultSettings.ui.enabled);
        setUiColorSchemeEnabled(settings.ui.colorSchemeEnabled ?? defaultSettings.ui.colorSchemeEnabled);
        setPrimaryColor(settings.ui.colors?.primary ?? defaultSettings.ui.colors.primary);
        setSecondaryColor(settings.ui.colors?.secondary ?? defaultSettings.ui.colors.secondary);
        setAccentColor(settings.ui.colors?.accent ?? defaultSettings.ui.colors.accent);
        setRoundedCorners(settings.ui.elements?.roundedCorners ?? defaultSettings.ui.elements.roundedCorners);
        setShadows(settings.ui.elements?.shadows ?? defaultSettings.ui.elements.shadows);
        setAnimations(settings.ui.elements?.animations ?? defaultSettings.ui.elements.animations);
      }

      // Настройки базы данных
      if (settings.database) {
        setDatabaseEnabled(settings.database.enabled ?? defaultSettings.database.enabled);
        setDatabaseType(settings.database.type ?? defaultSettings.database.type);
        if (settings.database.supabase) {
          setDatabaseSchema(settings.database.supabase.schema ?? defaultSettings.database.supabase.schema);
          setAutoMigrate(settings.database.supabase.autoMigrate ?? defaultSettings.database.supabase.autoMigrate);
          if (settings.database.supabase.tables) {
            setMessagesTable(settings.database.supabase.tables.messages ?? defaultSettings.database.supabase.tables.messages);
            setChatsTable(settings.database.supabase.tables.chats ?? defaultSettings.database.supabase.tables.chats);
            setUsersTable(settings.database.supabase.tables.users ?? defaultSettings.database.supabase.tables.users);
            setFilesTable(settings.database.supabase.tables.files ?? defaultSettings.database.supabase.tables.files);
          }
        }
      }
    }
  }, [settings]);

  // Cleanup widget preview on unmount
  React.useEffect(() => {
    return () => {
      // Используем нашу функцию удаления виджета при размонтировании компонента
      removeWidgetPreview();
    };
  }, []);


  // Мутация для сохранения только настроек webhook
  const saveWebhookMutation = useMutation({
    mutationFn: async (data: { url: string; enabled: boolean }) => {
      const result = await apiRequest("/api/settings/webhook", {
        method: "PUT",
        data,
      });
      return result as Settings;
    },
    onSuccess: () => {
      toast({
        title: "Настройки вебхука сохранены",
        description: "Ваши изменения успешно применены",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error) => {
      toast({
        title: "Ошибка сохранения",
        description: "Не удалось сохранить настройки вебхука. Пожалуйста, попробуйте снова.",
        variant: "destructive",
      });
      console.error("Ошибка при сохранении настроек вебхука:", error);
    },
  });

  // Обработчик сохранения настроек вебхука
  const handleSaveWebhook = () => {
    if (!webhookUrl.trim()) {
      toast({
        title: "Ошибка",
        description: "URL вебхука не может быть пустым",
        variant: "destructive",
      });
      return;
    }

    saveWebhookMutation.mutate({
      url: webhookUrl,
      enabled: webhookEnabled,
    });
  };

  // Мутация для сохранения только настроек интеграции
  const saveIntegrationMutation = useMutation({
    mutationFn: async (integration: Settings['integration']) => {
      const result = await apiRequest("/api/settings/integration", {
        method: "PUT",
        data: { integration },
      });
      return result as Settings;
    },
    onSuccess: () => {
      toast({
        title: "Настройки интеграции сохранены",
        description: "Ваши изменения успешно применены",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error) => {
      toast({
        title: "Ошибка сохранения",
        description: "Не удалось сохранить настройки интеграции. Пожалуйста, попробуйте снова.",
        variant: "destructive",
      });
      console.error("Ошибка при сохранении настроек интеграции:", error);
    },
  });

  // Обработчик сохранения настроек интеграции
  const handleSaveIntegration = () => {
    const integration = {
      iframe: {
        enabled: iframeEnabled,
        theme: iframeTheme,
      },
      widget: {
        enabled: widgetEnabled,
        position: widgetPosition,
        theme: widgetTheme,
        fontSize: widgetFontSize,
        width: widgetWidth,
        height: widgetHeight,
        text: widgetText,
        buttonColor: widgetButtonColor,
        pulsation: widgetPulsation,
        icon: widgetIcon
      },
    };

    saveIntegrationMutation.mutate(integration);
  };

  // Мутация для сохранения настроек UI
  const saveUiMutation = useMutation({
    mutationFn: async (ui: Settings['ui']) => {
      const result = await apiRequest("/api/settings/ui", {
        method: "PUT",
        data: { ui },
      });
      return result as Settings;
    },
    onSuccess: () => {
      toast({
        title: "Настройки интерфейса сохранены",
        description: "Ваши изменения успешно применены",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error) => {
      toast({
        title: "Ошибка сохранения",
        description: "Не удалось сохранить настройки интерфейса. Пожалуйста, попробуйте снова.",
        variant: "destructive",
      });
      console.error("Ошибка при сохранении настроек интерфейса:", error);
    },
  });

  // Мутация для сохранения настроек базы данных
  const saveDatabaseMutation = useMutation({
    mutationFn: async (database: Settings['database']) => {
      const result = await apiRequest("/api/settings/database", {
        method: "PUT",
        data: { database },
      });
      return result as Settings;
    },
    onSuccess: () => {
      toast({
        title: "Настройки базы данных сохранены",
        description: "Ваши изменения успешно применены",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error) => {
      toast({
        title: "Ошибка сохранения",
        description: "Не удалось сохранить настройки базы данных. Пожалуйста, попробуйте снова.",
        variant: "destructive",
      });
      console.error("Ошибка при сохранении настроек базы данных:", error);
    },
  });

  // Обработчик сохранения настроек UI
  const handleSaveUi = () => {
    const ui = {
      enabled: uiEnabled,
      colorSchemeEnabled: uiColorSchemeEnabled,
      colors: {
        primary: primaryColor,
        secondary: secondaryColor,
        accent: accentColor,
      },
      elements: {
        roundedCorners: roundedCorners,
        shadows: shadows,
        animations: animations,
      },
    };

    saveUiMutation.mutate(ui);
  };

  // Обработчик сохранения настроек базы данных
  const handleSaveDatabase = () => {
    const database = {
      enabled: databaseEnabled,
      type: databaseType,
      supabase: {
        tables: {
          messages: messagesTable,
          chats: chatsTable,
          users: usersTable,
          files: filesTable
        },
        schema: databaseSchema,
        autoMigrate: autoMigrate
      }
    };

    saveDatabaseMutation.mutate(database);
  };

  // Генерация кода для iframe интеграции
  const getIframeCode = () => {
    return `<iframe 
  src="${window.location.origin}?embed=true&theme=${iframeTheme}" 
  width="100%" 
  height="600px" 
  frameborder="0" 
  allow="microphone"
></iframe>`;
  };

  // Генерация кода для виджета
  const getWidgetCode = () => {
    return `<script>
  (function(d, w) {
    var s = d.createElement('script');
    s.src = '${window.location.origin}/widget.js';
    s.setAttribute('data-position', '${widgetPosition}');
    s.setAttribute('data-theme', '${widgetTheme}');
    s.setAttribute('data-width', '${widgetWidth}px');
    s.setAttribute('data-height', '${widgetHeight}px');
    s.setAttribute('data-font-size', '${widgetFontSize}');
    s.setAttribute('data-greeting', '${widgetText}');
    s.setAttribute('data-button-color', '${widgetButtonColor}');
    s.setAttribute('data-pulsation', '${widgetPulsation}');
    ${widgetIcon ? `s.setAttribute('data-icon', '${widgetIcon}');` : ''}
    d.head.appendChild(s);
  })(document, window);
</script>`;
  };

  // Запрос для получения сообщений из выбранного чата
  const fetchChatMessages = async (chatId: string) => {
    try {
      setSelectedChatId(chatId);
      const messages = await apiRequest(`/api/chat/${chatId}/messages`);
      const chatInfo = dialogsData?.chats.find(chat => chat.id === chatId) || null;
      setSelectedChat({chat: chatInfo, messages: messages || []});
      setShowChatSidebar(true);
    } catch (error) {
      console.error("Ошибка при получении сообщений чата:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить сообщения чата.",
        variant: "destructive",
      });
      setSelectedChat(null);
    }
  }


  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto"></div>
          <p className="mt-4 text-xl">Загрузка настроек...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black min-h-screen text-white">
      {/* Хедер */}
      <header className="border-b border-gray-800 py-4">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <h1 className="text-2xl font-semibold">Личный кабинет</h1>
          <Button 
            variant="outline" 
            onClick={() => {
              localStorage.removeItem("isAuthenticated");
              localStorage.removeItem("authToken");
              localStorage.removeItem("user");
              toast({
                title: "Выход из системы",
                description: "Вы успешно вышли из системы",
              });
              navigate("/login");
            }}
          >
            Выйти
          </Button>
        </div>
      </header>

      {/* Основной контент */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="webhook" className="space-y-6">
          <TabsList className="bg-gray-900 text-white">
            <TabsTrigger value="webhook">Настройка вебхука</TabsTrigger>
            <TabsTrigger value="integration">Интеграция</TabsTrigger>
            <TabsTrigger value="ui">Настройки UI</TabsTrigger>
            <TabsTrigger value="database">База данных</TabsTrigger>
            <TabsTrigger value="dialogs">Диалоги</TabsTrigger>
            <TabsTrigger value="stats">Статистика</TabsTrigger>
          </TabsList>

          {/* Раздел настройки вебхука */}
          <TabsContent value="webhook">
            <Card className="bg-gray-900 text-white border-gray-800">
              <CardHeader>
                <CardTitle>Настройка вебхука n8n</CardTitle>
                <CardDescription className="text-gray-400">
                  Укажите URL вебхука для обработки сообщений. Любые изменения вступят в силу немедленно.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="webhook-enabled"
                    checked={webhookEnabled}
                    onCheckedChange={setWebhookEnabled}
                  />
                  <Label htmlFor="webhook-enabled">Включить вебхук</Label>
                </div>

                {webhookEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url">URL вебхука</Label>
                    <Input
                      id="webhook-url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://n8n.example.com/webhook-endpoint"
                      className="bg-gray-800 border-gray-700 text-white"
                    />
                    <p className="text-xs text-gray-400">
                      Формат: https://n8n.domain.com/webhook-path/uuid
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleSaveWebhook}
                  disabled={saveWebhookMutation.isPending}
                >
                  {saveWebhookMutation.isPending ? "Сохранение..." : "Сохранить настройки"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Раздел интеграции */}
          <TabsContent value="integration">
            <div className="space-y-6">
              {/* Настройка iframe */}
              <Card className="bg-gray-900 text-white border-gray-800">
                <CardHeader>
                  <CardTitle>Встраивание через iframe</CardTitle>
                  <CardDescription className="text-gray-400">
                    Настройте параметры для встраивания чата на ваш сайт через iframe.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="iframe-enabled"
                      checked={iframeEnabled}
                      onCheckedChange={setIframeEnabled}
                    />
                    <Label htmlFor="iframe-enabled">Включить iframe интеграцию</Label>
                  </div>

                  {iframeEnabled && (
                    <div className="space-y-2">
                      <Label>Тема оформления</Label>
                      <RadioGroup value={iframeTheme} onValueChange={(value) => setIframeTheme(value as "light" | "dark" | "transparent")}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="light" id="iframe-light" />
                          <Label htmlFor="iframe-light">Светлая</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="dark" id="iframe-dark" />
                          <Label htmlFor="iframe-dark">Темная</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="transparent" id="iframe-transparent" />
                          <Label htmlFor="iframe-transparent">Прозрачная</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}

                  {iframeEnabled && (
                    <div className="mt-4 space-y-2">
                      <Label>Код для вставки</Label>
                      <div className="bg-gray-800 p-4 rounded-md">
                        <code className="text-sm text-green-400 whitespace-pre-wrap break-all">
                          {getIframeCode()}
                        </code>
                      </div>
                      <Button 
                        variant="outline"
                        className="mt-2"
                        onClick={() => {
                          navigator.clipboard.writeText(getIframeCode());
                          toast({
                            title: "Скопировано!",
                            description: "Код iframe скопирован в буфер обмена",
                          });
                        }}
                      >
                        Скопировать код
                      </Button>
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button 
                    onClick={handleSaveIntegration}
                    disabled={saveIntegrationMutation.isPending}
                  >
                    {saveIntegrationMutation.isPending ? "Сохранение..." : "Сохранить настройки"}
                  </Button>
                </CardFooter>
              </Card>

              {/* Настройка виджета для сайта */}
              <Card className="bg-gray-900 text-white border-gray-800">
                <CardHeader>
                  <CardTitle>Виджет для сайта</CardTitle>
                  <CardDescription className="text-gray-400">
                    Настройте параметры чат-виджета, который будет отображаться на вашем сайте.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="widget-enabled"
                      checked={widgetEnabled}
                      onCheckedChange={setWidgetEnabled}
                    />
                    <Label htmlFor="widget-enabled">Включить виджет</Label>
                  </div>

                  {widgetEnabled && (
                    <>
                      <div className="grid gap-4">
                        <div className="space-y-4">
                          <div>
                            <Label>Текст приветствия</Label>
                            <Input 
                              value={widgetText}
                              onChange={(e) => setWidgetText(e.target.value)}
                              placeholder="Введите текст приветствия"
                              className="mt-2"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Ширина (px)</Label>
                              <Input
                                type="number"
                                value={widgetWidth}
                                onChange={(e) => setWidgetWidth(Number(e.target.value))}
                                min={200}
                                max={600}
                                className="mt-2"
                              />
                            </div>
                            <div>
                              <Label>Высота (px)</Label>
                              <Input
                                type="number"
                                value={widgetHeight}
                                onChange={(e) => setWidgetHeight(Number(e.target.value))}
                                min={300}
                                max={800}
                                className="mt-2"
                              />
                            </div>
                          </div>

                          <div>
                            <Label>Расположение на странице</Label>
                            <RadioGroup value={widgetPosition} onValueChange={(value) => setWidgetPosition(value as "left" | "right")}>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="left" id="position-left" />
                                <Label htmlFor="position-left">Слева</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="right" id="position-right" />
                                <Label htmlFor="position-right">Справа</Label>
                              </div>
                            </RadioGroup>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Размер шрифта (px)</Label>
                          <Input
                            type="number"
                            value={widgetFontSize}
                            onChange={(e) => setWidgetFontSize(Number(e.target.value))}
                            min={10}
                            max={24}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Тема оформления</Label>
                          <RadioGroup value={widgetTheme} onValueChange={(value) => setWidgetTheme(value as "light" | "dark")}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="light" id="theme-light" />
                              <Label htmlFor="theme-light">Светлая</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="dark" id="theme-dark" />
                              <Label htmlFor="theme-dark">Темная</Label>
                            </div>
                          </RadioGroup>
                        </div>

                        <div className="space-y-2">
                          <Label>Цвет кнопки</Label>
                          <div className="flex items-center space-x-2">
                            <Input
                              type="color"
                              value={widgetButtonColor}
                              onChange={(e) => setWidgetButtonColor(e.target.value)}
                              className="w-16 h-10 p-1"
                            />
                            <Input
                              type="text"
                              value={widgetButtonColor}
                              onChange={(e) => setWidgetButtonColor(e.target.value)}
                              placeholder="#4b6cf7"
                              className="flex-1"
                            />
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            id="widget-pulsation"
                            checked={widgetPulsation}
                            onCheckedChange={setWidgetPulsation}
                          />
                          <Label htmlFor="widget-pulsation">Анимация пульсации кнопки</Label>
                        </div>

                        <div className="space-y-2 mt-4">
                          <Label>Пользовательская иконка</Label>
                          <div className="flex items-center space-x-2">
                            <Input
                              type="file"
                              accept="image/svg+xml,image/png"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    const result = event.target?.result as string;
                                    setWidgetIcon(result);
                                    // Автоматически показываем превью после загрузки
                                    setShowWidgetPreview(true);
                                    createWidgetPreview();
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="flex-1"
                            />
                          </div>
                          {widgetIcon && (
                            <div className="mt-2">
                              <p className="text-sm mb-2">Предпросмотр иконки:</p>
                              <img 
                                src={widgetIcon} 
                                alt="Предпросмотр иконки"
                                className="w-10 h-10 object-contain bg-gray-800 rounded p-1"
                              />
                            </div>
                          )}
                          <p className="text-xs text-gray-400">
                            Загрузите иконку в формате SVG или PNG. Если файл не выбран, будет использована стандартная иконка чата.
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {widgetEnabled && (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Предпросмотр виджета</Label>
                        <Switch
                          checked={showWidgetPreview}
                          onCheckedChange={(checked) => {
                            setShowWidgetPreview(checked);
                            if (checked) {
                              createWidgetPreview();
                            } else {
                              // Удаляем превью при выключении
                              removeWidgetPreview();
                            }
                          }}
                        />
                      </div>
                      
                      <div className="flex items-center space-x-2 pt-2">
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => {
                            if (showWidgetPreview) {
                              // Удаляем старое превью
                              removeWidgetPreview();
                              
                              // Создаем новое превью
                              createWidgetPreview();
                              
                              toast({
                                title: "Предпросмотр обновлен",
                                description: "Изменения применены к предпросмотру виджета",
                              });
                            }
                          }}
                        >
                          Обновить предпросмотр
                        </Button>
                      </div>

                      <Label>Код для вставки</Label>
                      <div className="bg-gray-800 p-4 rounded-md">
                        <code className="text-sm text-green-400 whitespace-pre-wrap break-all">
                          {getWidgetCode()}
                        </code>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(getWidgetCode());
                            toast({
                              title: "Скопировано!",
                              description: "Код виджета скопирован в буфер обмена",
                            });
                          }}
                        >
                          Скопировать код
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button 
                    onClick={handleSaveIntegration}
                    disabled={saveIntegrationMutation.isPending}
                  >
                    {saveIntegrationMutation.isPending ? "Сохранение..." : "Сохранить настройки"}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          {/* Раздел настроек UI */}
          <TabsContent value="ui">
            <Card className="bg-gray-900 text-white border-gray-800">
              <CardHeader>
                <CardTitle>Настройки пользовательского интерфейса</CardTitle>
                <CardDescription className="text-gray-400">
                  Настройте внешний вид интерфейса чата для ваших пользователей.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="ui-enabled"
                    checked={uiEnabled}
                    onCheckedChange={setUiEnabled}
                  />
                  <Label htmlFor="ui-enabled">Включить пользовательские настройки интерфейса</Label>
                </div>

                {/* Если UI выключен, показываем базовые настройки */}
                {!uiEnabled && (
                  <div className="space-y-2 p-4 bg-gray-800 rounded-md">
                    <p className="text-gray-400">Включите настройки UI для более детальной настройки</p>
                  </div>
                )}

                {uiEnabled && (
                  <>
                    {/* Кнопка для активации визуального редактора */}
                    <div className="mb-6">
                      <Button 
                        onClick={() => {
                          setIsStyleEditorActive(true);
                          // Открываем главную страницу для редактирования
                          window.open('/', '_blank');
                          toast({
                            title: "Редактирование активировано",
                            description: "Редактор открыт на главной странице. Наведите курсор на элемент для редактирования.",
                          });
                        }}
                        variant="outline"
                        className="bg-gray-800 hover:bg-gray-700"
                      >
                        <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9"></path>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                        Включить интерактивное редактирование
                      </Button>
                      <p className="text-xs text-gray-400 mt-2">
                        Позволяет редактировать стили наводя курсор на элементы интерфейса
                      </p>
                    </div>

                    {/* Настройки цветов */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">Цветовая схема</h3>
                        <div className="flex items-center space-x-2">
                          <Label htmlFor="color-scheme-enabled" className="text-sm">Включить</Label>
                          <Switch
                            id="color-scheme-enabled"
                            checked={uiColorSchemeEnabled}
                            onCheckedChange={setUiColorSchemeEnabled}
                          />
                        </div>
                      </div>

                      {uiColorSchemeEnabled && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="primary-color">Основной цвет</Label>
                            <div className="flex space-x-2">
                              <Input
                                id="primary-color"
                                type="color"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                className="w-12 h-10 p-1 bg-gray-800 border-gray-700"
                              />
                              <Input
                                type="text"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                className="flex-1 bg-gray-800 border-gray-700 text-white"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="secondary-color">Вторичный цвет</Label>
                            <div className="flex space-x-2">
                              <Input
                                id="secondary-color"
                                type="color"
                                value={secondaryColor}
                                onChange={(e) => setSecondaryColor(e.target.value)}
                                className="w-12 h-10 p-1 bg-gray-800 border-gray-700"
                              />
                              <Input
                                type="text"
                                value={secondaryColor}
                                onChange={(e) => setSecondaryColor(e.target.value)}
                                className="flex-1 bg-gray-800 border-gray-700 text-white"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="accent-color">Акцентный цвет</Label>
                            <div className="flex space-x-2">
                              <Input
                                id="accent-color"
                                type="color"
                                value={accentColor}
                                onChange={(e) => setAccentColor(e.target.value)}
                                className="w-12 h-10 p-1 bg-gray-800 border-gray-700"
                              />
                              <Input
                                type="text"
                                value={accentColor}
                                onChange={(e) => setAccentColor(e.target.value)}
                                className="flex-1 bg-gray-800 border-gray-700 text-white"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {uiColorSchemeEnabled && (
                        <div className="mt-4 p-4 bg-gray-800 rounded-md">
                          <h4 className="text-md font-medium mb-2">Элементы интерфейса</h4>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Кнопки</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="number"
                                  placeholder="Высота (px)"
                                  className="bg-gray-800 border-gray-700 text-white"
                                  onChange={(e) => {
                                    const styles = document.documentElement.style;
                                    styles.setProperty('--button-height', `${e.target.value}px`);
                                  }}
                                />
                                <Input
                                  type="number"
                                  placeholder="Скругление (px)"
                                  className="bg-gray-800 border-gray-700 text-white"
                                  onChange={(e) => {
                                    const styles = document.documentElement.style;
                                    styles.setProperty('--button-radius', `${e.target.value}px`);
                                  }}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Поля ввода</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="number"
                                  placeholder="Отступы (px)"
                                  className="bg-gray-800 border-gray-700 text-white"
                                  onChange={(e) => {
                                    const styles = document.documentElement.style;
                                    styles.setProperty('--input-padding', `${e.target.value}px`);
                                  }}
                                />
                                <Input
                                  type="number"
                                  placeholder="Размер шрифта (px)"
                                  className="bg-gray-800 border-gray-700 text-white"
                                  onChange={(e) => {
                                    const styles = document.documentElement.style;
                                    styles.setProperty('--input-font-size', `${e.target.value}px`);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {uiColorSchemeEnabled && (
                        <div className="mt-4 p-4 bg-gray-800 rounded-md">
                          <h4 className="text-md font-medium mb-2">Предпросмотр цветов</h4>
                          <div className="flex flex-wrap gap-3">
                            <div 
                              className="w-24 h-12 rounded" 
                              style={{ backgroundColor: primaryColor }}
                              title="Основной цвет"
                            ></div>
                            <div 
                              className="w-24 h-12 rounded" 
                              style={{ backgroundColor: secondaryColor }}
                              title="Вторичный цвет"
                            ></div>
                            <div 
                              className="w-24 h-12 rounded" 
                              style={{ backgroundColor: accentColor }}
                              title="Акцентный цвет"
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator className="my-4 bg-gray-800" />

                    {/* Настройки элементов */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Элементы интерфейса</h3>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="rounded-corners">Скругленные углы</Label>
                          <Switch
                            id="rounded-corners"
                            checked={roundedCorners}
                            onCheckedChange={setRoundedCorners}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="shadows">Тени элементов</Label>
                          <Switch
                            id="shadows"
                            checked={shadows}
                            onCheckedChange={setShadows}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="animations">Анимации</Label>
                          <Switch
                            id="animations"
                            checked={animations}
                            onCheckedChange={setAnimations}
                          />
                        </div>
                      </div>

                      <div className="mt-4 p-4 bg-gray-800 rounded-md">
                        <h4 className="text-md font-medium mb-2">Пример элемента</h4>
                        <div 
                          className={`w-full h-20 border-2 border-white/20 bg-gray-700 flex items-center justify-center 
                            ${roundedCorners ? 'rounded-xl' : ''} 
                            ${shadows ? 'shadow-lg' : ''} 
                            ${animations ? 'transition-all duration-300 hover:scale-[1.02]' : ''}`}
                          style={{ borderColor: primaryColor }}
                        >
                          <span style={{ color: primaryColor }}>Предпросмотр стиля</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleSaveUi}
                  disabled={saveUiMutation.isPending}
                >
                  {saveUiMutation.isPending ? "Сохранение..." : "Сохранить настройки"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Раздел настройки базы данных */}
          <TabsContent value="database">
            <Card className="bg-gray-900 text-white border-gray-800">
              <CardHeader>
                <CardTitle>Настройки базы данных</CardTitle>
                <CardDescription className="text-gray-400">
                  Настройте подключение к базе данных Supabase для хранения сообщений, чатов и файлов.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="database-enabled"
                    checked={databaseEnabled}
                    onCheckedChange={setDatabaseEnabled}
                  />
                  <Label htmlFor="database-enabled">Включить хранение в базе данных</Label>
                </div>

                {!databaseEnabled && (
                  <div className="bg-gray-800 p-4 rounded-md">
                    <p className="text-gray-400">В настоящее время используется локальное хранилище в памяти.</p>
                    <p className="text-gray-400 mt-2">Включите базу данных для использования Supabase в качестве постоянного хранилища.</p>
                  </div>
                )}

                {databaseEnabled && (
                  <>
                    <div className="space-y-2">
                      <Label>Тип базы данных</Label>
                      <RadioGroup value={databaseType} onValueChange={(value) => setDatabaseType(value as "local" | "supabase")}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="local" id="db-local" />
                          <Label htmlFor="db-local">Локальное хранилище (в памяти)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="supabase" id="db-supabase" />
                          <Label htmlFor="db-supabase">Supabase</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {databaseType === "supabase" && (
                      <div className="space-y-4 border border-gray-700 p-4 rounded-md">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="schema">Схема БД</Label>
                            <Input
                              id="schema"
                              value={databaseSchema}
                              onChange={(e) => setDatabaseSchema(e.target.value)}
                              placeholder="public"
                              className="bg-gray-800 border-gray-700 text-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Имена таблиц</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="messages-table">Таблица сообщений</Label>
                              <Input
                                id="messages-table"
                                value={messagesTable}
                                onChange={(e) => setMessagesTable(e.target.value)}
                                placeholder="messages"
                                className="bg-gray-800 border-gray-700 text-white mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="chats-table">Таблица чатов</Label>
                              <Input
                                id="chats-table"
                                value={chatsTable}
                                onChange={(e) => setChatsTable(e.target.value)}
                                placeholder="chats"
                                className="bg-gray-800 border-gray-700 text-white mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="users-table">Таблица пользователей</Label>
                              <Input
                                id="users-table"
                                value={usersTable}
                                onChange={(e) => setUsersTable(e.target.value)}
                                placeholder="users"
                                className="bg-gray-800 border-gray-700 text-white mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="files-table">Таблица файлов</Label>
                              <Input
                                id="files-table"
                                value={filesTable}
                                onChange={(e) => setFilesTable(e.target.value)}
                                placeholder="files"
                                className="bg-gray-800 border-gray-700 text-white mt-1"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            id="auto-migrate"
                            checked={autoMigrate}
                            onCheckedChange={setAutoMigrate}
                          />
                          <Label htmlFor="auto-migrate">Автоматическая миграция схемы</Label>
                        </div>
                        <p className="text-xs text-yellow-400">
                          Внимание: Автоматическая миграция может привести к потере данных при изменении структуры таблиц.
                        </p>

                        <div className="bg-gray-800 p-4 rounded-md mt-4">
                          <p className="text-sm text-gray-400">
                            Для настройки подключения к Supabase добавьте следующие переменные окружения в ваш проект:
                          </p>
                          <ul className="list-disc list-inside mt-2 text-sm text-gray-400">
                            <li>SUPABASE_URL - URL проекта Supabase</li>
                            <li>SUPABASE_KEY - ключ API проекта Supabase</li>
                          </ul>

                          <div className="mt-4 space-y-2">
                            <div className="flex space-x-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={checkSupabaseConnection}
                                disabled={isCheckingConnection}
                              >
                                {isCheckingConnection ? "Проверка..." : "Проверить подключение"}
                              </Button>
                              
                              <Button
                                variant="default"
                                size="sm"
                                onClick={syncWithSupabase}
                                disabled={isSyncing || !supabaseConnectionStatus?.success}
                              >
                                {isSyncing ? "Синхронизация..." : "Синхронизировать с Supabase"}
                              </Button>
                            </div>

                            {supabaseConnectionStatus && (
                              <div className={`mt-2 p-2 rounded-md ${supabaseConnectionStatus.success ? 'bg-green-900' : 'bg-red-900'}`}>
                                <p className="text-sm">{supabaseConnectionStatus.message}</p>
                              </div>
                            )}
                            
                            {syncStatus && (
                              <div className={`mt-2 p-2 rounded-md ${syncStatus.success ? 'bg-green-900' : 'bg-red-900'}`}>
                                <p className="text-sm">{syncStatus.message}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleSaveDatabase}
                  disabled={saveDatabaseMutation.isPending}
                >
                  {saveDatabaseMutation.isPending ? "Сохранение..." : "Сохранить настройки"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Раздел диалогов */}
          <TabsContent value="dialogs">
            <Card className="bg-gray-900 text-white border-gray-800">
              <CardHeader>
                <CardTitle>История диалогов</CardTitle>
                <CardDescription className="text-gray-400">
                  Просмотр истории диалогов с пользователями.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingDialogs ? (
                  <div className="flex justify-center items-center p-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                  </div>
                ) : dialogsData?.chats.length === 0 ? (
                  <div className="text-center p-8">
                    <p className="text-gray-400">Нет доступных диалогов</p>
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Название</TableHead>
                          <TableHead>Создан</TableHead>
                          <TableHead>Последняя активность</TableHead>
                          <TableHead>Действия</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dialogsData?.chats.map((chat) => {
                          const isActive = new Date(chat.lastActive) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                          return (
                            <TableRow key={chat.id} >
                              <TableCell className="font-mono text-xs">{chat.id.substring(0, 8)}...</TableCell>
                              <TableCell>{chat.title}</TableCell>
                              <TableCell>{new Date(chat.createdAt).toLocaleString()}</TableCell>
                              <TableCell>{new Date(chat.lastActive).toLocaleString()}</TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.location.href = `/chat/${chat.id}`}
                                  >
                                    Открыть чат
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => fetchChatMessages(chat.id)}
                                  >
                                    Просмотр сообщений
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>

                    {/* Пагинация */}
                    {dialogsData && dialogsData.totalCount > pageSize && (
                      <div className="mt-4 flex justify-center">
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                className={currentPage === 1 ? "opacity-50 cursor-not-allowed" : ""}
                              />
                            </PaginationItem>

                            {Array.from({ length: Math.min(5, Math.ceil(dialogsData.totalCount / pageSize)) }, (_, i) => {
                              const page = i + 1;
                              return (
                                <PaginationItem key={page}>
                                  <PaginationLink 
                                    isActive={currentPage === page}
                                    onClick={() => setCurrentPage(page)}
                                  >
                                    {page}
                                  </PaginationLink>
                                </PaginationItem>
                              );
                            })}

                            {Math.ceil(dialogsData.totalCount / pageSize) > 5 && (
                              <PaginationItem>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )}

                            <PaginationItem>
                              <PaginationNext 
                                onClick={() => {
                                  if (currentPage < Math.ceil(dialogsData.totalCount / pageSize)) {
                                    setCurrentPage(p => p + 1);
                                  }
                                }} 
                                className={currentPage === Math.ceil(dialogsData.totalCount / pageSize) ? "opacity-50 cursor-not-allowed" : ""}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Раздел статистики */}
          <TabsContent value="stats">
            <Card className="bg-gray-900 text-white border-gray-800">
              <CardHeader>
                <CardTitle>Статистика использования</CardTitle>
                <CardDescription className="text-gray-400">
                  Данные об использовании платформы и активности пользователей.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <div className="flex justify-center items-center p-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                  </div>
                ) : !stats ? (
                  <div className="text-center p-8">
                    <p className="text-gray-400">Статистика недоступна</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Общая информация */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <Card className="bg-gray-800 border-gray-700">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">Всего пользователей</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-3xl font-bold">{stats.totalUsers}</p>
                          <p className="text-sm text-gray-400 mt-1">Активных за 24ч: {stats.activeUsersLast24h}</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gray-800 border-gray-700">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">Всего диалогов</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-3xl font-bold">{stats.totalChats}</p>
                          <p className="text-sm text-gray-400 mt-1">Активных за 24ч: {stats.activeChatsLast24h}</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gray-800 border-gray-700">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">Всего сообщений</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-3xl font-bold">{stats.totalMessages}</p>
                          <p className="text-sm text-gray-400 mt-1">Среднее на диалог: {stats.totalChats ? Math.round(stats.totalMessages / stats.totalChats) : 0}</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* График сообщений по дням */}
                    <div className="mt-8">
                      <h3 className="text-lg font-medium mb-4">Активность по дням</h3>
                      <div className="w-full h-80 bg-gray-800 rounded-md p-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={stats.messagesPerDay}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                            <XAxis 
                              dataKey="date" 
                              stroke="#888"
                              tickFormatter={(value) => new Date(value).toLocaleDateString()}
                            />
                            <YAxis stroke="#888" />
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#333', border: 'none' }}
                              labelFormatter={(value: string) => new Date(value).toLocaleDateString()}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="count" 
                              name="Сообщений" 
                              stroke="#10b981" 
                              activeDot={{ r: 8 }} 
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Топ чаты */}
                    {stats.topChats.length > 0 && (
                      <div className="mt-8">
                        <h3 className="text-lg font-medium mb-4">Самые активные диалоги</h3>
                        <div className="bg-gray-800 rounded-md p-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Название</TableHead>
                                <TableHead>Количество сообщений</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {stats.topChats.map((chat) => (
                                <TableRow key={chat.chatId}>
                                  <TableCell className="font-mono text-xs">{chat.chatId.substring(0, 8)}...</TableCell>
                                  <TableCell>{chat.title}</TableCell>
                                  <TableCell>{chat.messageCount}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Боковая панель для просмотра сообщений */}
        <Sheet open={showChatSidebar} onOpenChange={setShowChatSidebar}>
          <SheetContent side="right" className="w-[500px] sm:w-[540px] bg-gray-900 text-white border-l border-gray-800">
            <SheetHeader>
              <SheetTitle className="text-white">
                {selectedChat?.chat?.title || "История сообщений"}
              </SheetTitle>
              <SheetDescription className="text-gray-400">
                Просмотр истории сообщений выбранного диалога
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 py-2 space-y-4 overflow-y-auto max-h-[80vh]">
              {!selectedChat ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                </div>
              ) : selectedChat.messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400">В этом диалоге пока нет сообщений</p>
                </div>
              ) : (
                selectedChat.messages.map((message: any) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div 
                      className={`max-w-[80%] p-3 rounded-lg ${
                        message.role === 'user' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-700 text-white'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            <SheetFooter className="mt-auto pt-4 border-t border-gray-800">
              <Button variant="outline" onClick={() => setShowChatSidebar(false)}>
                Закрыть
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </main>

      {/* LiveStyleEditor перенесен в App.tsx и отображается глобально */}
    </div>
  );
};

export default Cabinet;