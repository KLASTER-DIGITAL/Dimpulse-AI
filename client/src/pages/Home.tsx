import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Chat, Message } from "@shared/schema";
import { useWebSocket } from "@/hooks/use-websocket";

import ChatContainer from "@/components/ChatGPT/ChatContainer";
import ChatInput from "@/components/ChatGPT/ChatInput";
import EmptyState from "@/components/ChatGPT/EmptyState";

const Home = () => {
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const { toast } = useToast();

  // Получаем параметры из URL для режима встраивания (embed)
  const embedMode = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      isEmbed: urlParams.get('embed') === 'true',
      theme: urlParams.get('theme') || 'dark'
    };
  }, []);

  // Get all chats
  const { data: chats = [], isLoading: isLoadingChats } = useQuery<Chat[]>({
    queryKey: ['/api/chats'],
  });

  // Get current chat and its messages
  const { data: chatData, isLoading: isLoadingChat, refetch } = useQuery<{ chat: Chat, messages: Message[] }>({
    queryKey: [`/api/chats/${currentChatId}`],
    enabled: !!currentChatId,
  });

  // В проде не обновляем автоматически, т.к. используем WebSocket
  // для обновления сообщений в реальном времени
  useEffect(() => {
    // Пустой эффект - websocket обновляет UI через invalidateQueries
  }, []);

  // Create a new chat
  const createChatMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/chats', {
        method: 'POST',
        data: {}
      });
    },
    onSuccess: (newChat: Chat) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      setCurrentChatId(newChat.id);
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось создать новый чат",
        variant: "destructive",
      });
    }
  });

  // Временное сообщение для анимации печати
  const [tempTypingMessage, setTempTypingMessage] = useState<Message & { typing?: boolean } | null>(null);

  // Подключаем WebSocket для текущего чата
  const { status: wsStatus } = useWebSocket(currentChatId, {
    onMessage: (data) => {
      console.log("WebSocket message received:", data);

      // Обработка события typing для обновления анимации набора текста
      if (data.type === 'typing') {
        if (data.status === 'started' && data.chatId === currentChatId) {
          console.log("Начинаем анимацию набора текста");
          // Устанавливаем временное сообщение для анимации печати
          setTempTypingMessage({
            id: -1,
            chatId: data.chatId,
            role: "assistant",
            content: "typing",
            createdAt: new Date(),
            typing: true
          });
        } else if (data.status === 'finished' && data.chatId === currentChatId) {
          console.log("Завершаем анимацию набора текста");
          // Удаляем временное сообщение и обновляем список сообщений
          setTempTypingMessage(null);
          queryClient.invalidateQueries({ queryKey: [`/api/chats/${currentChatId}`] });
        } else if (data.status === 'error' && data.chatId === currentChatId) {
          console.log("Ошибка при обработке сообщения:", data.error);
          // Оставляем анимацию печати для показа ошибки
        }
      }
    },
    onStatusChange: (status) => {
      console.log("WebSocket status changed:", status);
    }
  });

  // Send a message
  const sendMessageMutation = useMutation({
    mutationFn: async ({ 
      chatId, 
      message, 
      audioData, 
      fileData,
      filesData
    }: { 
      chatId: string, 
      message: string, 
      audioData?: string,
      fileData?: { content: string, name: string, type: string },
      filesData?: Array<{ content: string, name: string, type: string, size: number }> 
    }) => {
      console.log("Отправка сообщения:", { 
        chatId, 
        message, 
        hasAudio: !!audioData,
        hasFile: !!fileData,
        hasMultipleFiles: !!filesData && filesData.length > 0,
        fileCount: filesData?.length || (fileData ? 1 : 0),
        fileName: fileData?.name
      });

      const payload = { content: message };

      // Если есть аудиоданные, добавляем их в запрос
      if (audioData) {
        Object.assign(payload, { audioData });
      }

      // Если есть данные файла, добавляем их в запрос
      if (fileData) {
        Object.assign(payload, { fileData });
      }

      // Если есть массив файлов, добавляем их в запрос
      if (filesData && filesData.length > 0) {
        Object.assign(payload, { filesData });
      }

      // Добавляем временное сообщение с анимацией печати
      setTempTypingMessage({
        id: -1,
        chatId,
        role: "assistant",
        content: "typing",
        createdAt: new Date(),
        typing: true
      });

      const data = await apiRequest(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        data: payload
      });
      console.log("Ответ от сервера:", data);

      // Если получили сообщение с typing: true, значит это промежуточное состояние
      if (data && data.typing) {
        console.log("Получено состояние набора текста, оставляем анимацию");
        return null;
      }

      // Если получили обычный ответ, убираем временное сообщение
      setTempTypingMessage(null);
      return data;
    },
    onSuccess: (data) => {
      if (data) {
        console.log("Мутация успешна, обновляем запросы");
        queryClient.invalidateQueries({ queryKey: [`/api/chats/${currentChatId}`] });
        queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      }
    },
    onError: (error) => {
      console.error("Ошибка отправки сообщения:", error);
      // Убираем анимацию печати при ошибке
      setTempTypingMessage(null);
      toast({
        title: "Ошибка",
        description: "Не удалось отправить сообщение",
        variant: "destructive",
      });
    }
  });

  // Set current chat ID from URL param or create a new chat if needed
  useEffect(() => {
    if (params?.id) {
      // Используем id из URL
      setCurrentChatId(params.id);
    } else {
      // Убрано автоматическое создание чата при загрузке
      // Чат будет создан только после отправки первого сообщения
      setCurrentChatId(null);
    }
  }, [params?.id]);

  // Handle sending a message
  const handleSendMessage = async (
    message: string, 
    audioData?: string, 
    fileData?: { content: string, name: string, type: string },
    filesData?: Array<{ content: string, name: string, type: string, size: number }>
  ) => {
    if (!currentChatId) {
      // Если нет текущего чата, создаем новый
      try {
        const newChat = await createChatMutation.mutateAsync();
        console.log("Создан новый чат:", newChat);
        // После создания чата сразу отправляем сообщение
        sendMessageMutation.mutate({ 
          chatId: newChat.id, 
          message, 
          audioData, 
          fileData,
          filesData
        });
      } catch (error) {
        console.error("Ошибка при создании чата:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось создать чат и отправить сообщение",
          variant: "destructive",
        });
      }
    } else {
      // Если чат уже существует, просто отправляем сообщение
      sendMessageMutation.mutate({ 
        chatId: currentChatId, 
        message, 
        audioData, 
        fileData,
        filesData
      });
    }
  };

  // Handle voice input
  const handleVoiceInput = (transcript: string) => {
    if (transcript && !sendMessageMutation.isPending) {
      handleSendMessage(transcript);
    }
  };

  // State для хранения файлов на главном экране
  const [welcomeFiles, setWelcomeFiles] = useState<Array<{
    content: string;
    name: string;
    type: string;
    preview?: string;
  }>>([]);

  // Handle file upload - теперь сохраняет файл для отображения на экране приветствия
  const handleFileUpload = (fileContent: string, fileName: string, fileType: string) => {
    if (fileContent && !sendMessageMutation.isPending) {
      // Логируем о получении файла
      console.log(`Файл подготовлен: ${fileName}, размер: ${(fileContent.length / 1024).toFixed(2)} КБ`);

      // Добавляем файл в массив для отображения
      const fileInfo = {
        content: fileContent,
        name: fileName,
        type: fileType,
        preview: fileType.startsWith('image/') ? fileContent : undefined
      };

      setWelcomeFiles(prev => [...prev, fileInfo]);

      // Не создаем чат сразу - ждем отправки сообщения пользователем
    }
  };

  // Получить приветственное сообщение в зависимости от времени суток
  const getTimeOfDayGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Доброе утро";
    if (hour >= 12 && hour < 18) return "Добрый день";
    if (hour >= 18 && hour < 23) return "Добрый вечер";
    return "Доброй ночи";
  };

  // Определяем стили для разных тем в режиме embed
  const getEmbedStyles = () => {
    if (!embedMode.isEmbed) return {};

    console.log("Применяем тему для embed режима:", embedMode.theme);

    switch (embedMode.theme) {
      case 'light':
        return {
          backgroundColor: '#ffffff',
          color: '#202123',
          borderColor: '#e5e5e5'
        };
      case 'dark':
        return {
          backgroundColor: '#202123',
          color: '#ffffff',
          borderColor: '#444444'
        };
      case 'transparent':
        return {
          backgroundColor: 'transparent',
          color: '#ffffff',
          borderColor: 'rgba(255,255,255,0.2)'
        };
      default:
        return {
          backgroundColor: '#202123',
          color: '#ffffff',
          borderColor: '#444444'
        };
    }
  };

  const embedStyles = getEmbedStyles();

  return (
    <div 
      className={`flex h-screen w-full ${embedMode.isEmbed ? '' : 'bg-black'} text-[#ECECF1] flex-col relative`}
      style={embedMode.isEmbed ? embedStyles : {}}
    >
      <div className="absolute top-2 right-2 z-50">
        <button
          onClick={() => navigate("/cabinet")}
          className="p-2 opacity-0"
          title="Войти в кабинет"
          style={{ background: 'transparent' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </button>
      </div>
      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full">
        {/* Показываем приветственный экран вместо чата, если нет сообщений */}
        {!chatData?.messages?.length ? (
          <div className="flex flex-col items-center justify-center h-full relative">
            <div className="text-center animate-fadeIn">
              <h1 className="text-4xl font-semibold mb-2 animate-textAppear">{getTimeOfDayGreeting()}!</h1>
              <p className="text-base text-gray-300 mb-10 animate-textAppear animation-delay-300">Какие у вас задачи? Давайте мы поможем решить!</p>

              {/* Отображение прикрепленных файлов */}
              {welcomeFiles.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mb-4 max-w-lg mx-auto">
                  {welcomeFiles.map((file, index) => (
                    <div key={index} className="relative inline-block">
                      <div className="w-16 h-16 bg-[#202123] rounded-xl overflow-hidden border border-gray-600 flex items-center justify-center">
                        {file.type.startsWith('image/') && file.preview ? (
                          <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                          </svg>
                        )}
                      </div>
                      <button 
                        type="button" 
                        className="absolute -top-2 -right-2 bg-gray-800 rounded-full w-5 h-5 flex items-center justify-center text-white"
                        onClick={() => setWelcomeFiles(files => files.filter((_, i) => i !== index))}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Форма запроса под приветственным сообщением */}
              <div className="w-full max-w-lg mx-auto mt-10 animate-fadeIn animation-delay-600">
                <form 
                  className="relative" 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = (e.target as HTMLFormElement).elements.namedItem('message') as HTMLInputElement;
                    if (input.value.trim()) {
                      // Если есть прикрепленные файлы, отправляем их вместе с сообщением
                      if (welcomeFiles.length > 0) {
                        // Для обратной совместимости с ChatInput компонентом используем первый файл
                        const fileData = {
                          content: welcomeFiles[0].content,
                          name: welcomeFiles[0].name,
                          type: welcomeFiles[0].type
                        };

                        // Отправляем все файлы в виде массива
                        const filesData = welcomeFiles.map(file => ({
                          content: file.content,
                          name: file.name,
                          type: file.type,
                          size: file.content.length
                        }));

                        // Отправляем сообщение с файлами
                        handleSendMessage(input.value.trim(), undefined, fileData, filesData);

                        // Очищаем список файлов после отправки
                        setWelcomeFiles([]);
                      } else {
                        // Если файлов нет, отправляем просто текстовое сообщение
                        handleSendMessage(input.value.trim());
                      }
                      input.value = '';
                    } else if (welcomeFiles.length > 0) {
                      // Если есть файлы, но нет сообщения - показываем предупреждение
                      alert("Пожалуйста, введите текстовое сообщение вместе с прикрепленными файлами.");
                    }
                  }}
                >
                  <div className="rounded-full border border-gray-600 bg-[#101010] flex items-center pr-2">
                    {/* Кнопка прикрепления файла */}
                    <button
                      type="button"
                      className="p-2 text-gray-400 hover:text-white focus:outline-none"
                      onClick={() => {
                        // Клик по скрытому input file
                        const fileInput = document.getElementById('welcome-file-input') as HTMLInputElement;
                        if (fileInput) fileInput.click();
                      }}
                      disabled={sendMessageMutation.isPending}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <input
                        id="welcome-file-input"
                        type="file"
                        className="hidden"
                        accept=".txt,.json,.md,.jpg,.jpeg,.png,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const content = event.target?.result as string;
                            if (content && handleFileUpload) {
                              handleFileUpload(content, file.name, file.type);
                            }
                          };

                          // Определяем метод чтения в зависимости от типа файла
                          if (file.type.startsWith('image/') || 
                              file.type === 'application/pdf') {
                            reader.readAsDataURL(file);
                          } else {
                            reader.readAsText(file);
                          }
                          // Очищаем input для возможности повторной загрузки того же файла
                          e.target.value = '';
                        }}
                        disabled={sendMessageMutation.isPending}
                      />
                    </button>

                    {/* Поле ввода */}
                    <input 
                      type="text" 
                      name="message"
                      placeholder="Опишите вашу задачу..."
                      className="flex-1 bg-transparent text-white border-none px-4 py-3 focus:outline-none rounded-full"
                      disabled={sendMessageMutation.isPending}
                      ref={(input) => {
                        // Автофокусировка с таймаутом для надежности
                        if (input) {
                          setTimeout(() => {
                            input.focus();
                          }, 200);
                        }
                      }}
                    />

                    {/* Кнопка голосового ввода */}
                    <button
                      type="button"
                      className="p-2 text-gray-400 hover:text-white focus:outline-none"
                      onClick={() => {
                        // Проверяем наличие поддержки распознавания речи
                        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                        if (SpeechRecognition) {
                          const recognition = new SpeechRecognition();
                          recognition.lang = 'ru-RU';
                          recognition.continuous = false;
                          recognition.interimResults = false;

                          recognition.onresult = (event: any) => {
                            const transcript = event.results[0][0].transcript;
                            if (transcript && handleVoiceInput) {
                              handleVoiceInput(transcript);
                            }
                          };

                          recognition.start();
                        } else {
                          alert("Ваш браузер не поддерживает распознавание речи");
                        }
                      }}
                      disabled={sendMessageMutation.isPending}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="22"/>
                      </svg>
                    </button>

                    {/* Кнопка отправки */}
                    <button 
                      type="submit" 
                      className="p-2 rounded-full text-gray-400 hover:text-white"
                      disabled={sendMessageMutation.isPending}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Container */}
            <ChatContainer 
              messages={chatData?.messages || []}
              isLoading={isLoadingChat || sendMessageMutation.isPending}
              isEmpty={false}
              tempTypingMessage={tempTypingMessage}
            />
          </>
        )}

        {/* Chat Input - всегда отображается в абсолютном позиционировании внизу экрана для чата */}
        <div className="absolute bottom-0 left-0 right-0 mb-4">
          <div className="max-w-3xl mx-auto px-4">
            {/* Компонент ChatInput теперь всегда существует (но может быть скрыт), 
                что предотвращает его полное размонтирование при обновлении сообщений */}
            <div className={chatData && chatData.messages && chatData.messages.length > 0 ? 'block' : 'hidden'}>
              <ChatInput 
                onSendMessage={handleSendMessage}
                onVoiceInput={handleVoiceInput}
                onFileUpload={handleFileUpload}
                isLoading={sendMessageMutation.isPending}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;