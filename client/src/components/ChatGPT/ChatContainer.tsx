import { useRef, useEffect, useState } from "react";
import { Message } from "@shared/schema";
import ChatMessage from "./ChatMessage";
import TypingAnimation from "./TypingAnimation";
import { useToast } from "@/hooks/use-toast";

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  isEmpty: boolean;
  tempTypingMessage?: (Message & { typing?: boolean }) | null;
}

const ChatContainer = ({ messages, isLoading, isEmpty, tempTypingMessage }: ChatContainerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Пример сообщения с прикрепленным файлом для демонстрации
  const exampleFileMessage: Message = {
    id: 9999,
    chatId: "example",
    role: "user",
    content: "Вот документ, который я упоминал",
    createdAt: new Date(),
    fileUrl: "#",
    fileName: "invoice_id_361.pdf",
    fileType: "application/pdf",
    fileSize: 934 * 1024, // 934 КБ
    // Добавляем вложенный объект file для компонента ChatMessage
    file: {
      url: "#",
      name: "invoice_id_361.pdf",
      type: "application/pdf",
      size: 934 * 1024
    }
  } as Message & { file?: { name: string, type: string, size: number, url: string } };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, tempTypingMessage]);
  
  // Состояние для отслеживания выбранного сообщения
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  
  // Функция для отправки лайка
  const likeMessage = async (message: Message) => {
    try {
      setSelectedMessageId(message.id);
      
      // Здесь можно добавить API-запрос для сохранения реакции
      // Пример:
      // await fetch(`/api/messages/${message.id}/reaction`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ reaction: 'like' })
      // });
      
      toast({
        title: "Отлично!",
        description: "Спасибо за вашу положительную оценку",
        duration: 2000
      });
    } catch (error) {
      console.error("Ошибка при отправке лайка:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось отправить оценку",
        variant: "destructive",
        duration: 2000
      });
    }
  };
  
  // Функция для отправки дизлайка
  const dislikeMessage = async (message: Message) => {
    try {
      setSelectedMessageId(message.id);
      
      // Здесь можно добавить API-запрос для сохранения реакции
      // Пример:
      // await fetch(`/api/messages/${message.id}/reaction`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ reaction: 'dislike' })
      // });
      
      toast({
        title: "Получено",
        description: "Спасибо за ваш отзыв",
        duration: 2000
      });
    } catch (error) {
      console.error("Ошибка при отправке дизлайка:", error);
      toast({
        title: "Ошибка", 
        description: "Не удалось отправить оценку",
        variant: "destructive",
        duration: 2000
      });
    }
  };
  
  // Функция для вывода дополнительных опций
  const showOptions = (message: Message) => {
    // Здесь можно добавить логику для отображения меню с дополнительными опциями
    toast({
      title: "Дополнительные опции",
      description: "Функционал находится в разработке",
      duration: 2000
    });
  };
  
  // Функция для отображения информации о сообщении
  const showInfo = (message: Message) => {
    const createdAt = new Date(message.createdAt).toLocaleString();
    
    toast({
      title: "Информация о сообщении",
      description: `ID: ${message.id}, Создано: ${createdAt}`,
      duration: 3000
    });
  };
  
  // Диагностический лог для отслеживания сообщений
  useEffect(() => {
    console.log("ChatContainer: сообщения и состояние", {
      messageCount: messages?.length || 0,
      isLoading,
      isEmpty
    });
  }, [messages, isLoading, isEmpty]);

  return (
    <div 
      id="chat-container" 
      ref={containerRef}
      className="flex-1 bg-black overflow-y-auto scrollbar-thin py-4 px-3 sm:px-4 md:px-8 pb-24 sm:pb-32"
      title="Контейнер чата - здесь отображаются все сообщения"
    >
      {isEmpty && !isLoading && (!messages || messages.length === 0) ? (
        <div 
          className="h-full flex items-center justify-center"
          title="Пустое состояние чата - начните диалог, отправив сообщение"
        >
          <h1 className="text-2xl font-semibold text-white mb-24">Чем я могу помочь?</h1>
        </div>
      ) : (
        <div 
          id="messages-container" 
          className="w-full max-w-3xl mx-auto"
          title="Контейнер сообщений - здесь отображается история переписки"
        >
          {/* Пример сообщения с прикрепленным файлом - скрыт */}
          {/* Будет показан только при реальном прикреплении файла */}
          
          {messages && messages.length > 0 && messages.map((message, index) => (
            <div 
              key={`msg-${message.id || index}`} 
              className="mb-4 sm:mb-6"
              title={`Сообщение от ${message.role === 'user' ? 'вас' : 'ассистента'}`}
            >
              <ChatMessage message={message} />
              <div 
                className="flex items-center justify-end mt-2"
                title="Панель действий с сообщением"
              >
              </div>
            </div>
          ))}
          
          {tempTypingMessage && (
            <ChatMessage key="typing" message={tempTypingMessage} />
          )}
          
          {isLoading && !tempTypingMessage && (
            <div 
              className="message ai-message mb-6"
              title="Ассистент печатает ответ"
            >
              <div className="flex items-start">
                <div className="flex-1 markdown">
                  <TypingAnimation />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Дополнительные действия под сообщениями */}
      {messages.length > 0 && !isLoading && (
        <div 
          className="flex items-center justify-start mt-2 max-w-3xl mx-auto"
          title="Панель действий с последним сообщением"
        >
          {/* Действия с последним сообщением */}
          <div 
            className="flex space-x-2 mt-1"
            title="Кнопки для взаимодействия с сообщением"
          >
            {/* Подразумеваем, что последнее сообщение - это ответ ассистента */}
            {messages.filter(m => m.role === "assistant").length > 0 && (
              <>
                <button 
                  className="text-gray-400 hover:text-green-500 p-1 transition-colors duration-200" 
                  onClick={() => likeMessage(messages[messages.length - 1])}
                  title="Нравится"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  className="text-gray-400 hover:text-red-500 p-1 transition-colors duration-200"
                  onClick={() => dislikeMessage(messages[messages.length - 1])}
                  title="Не нравится"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button 
                  className="text-gray-400 hover:text-blue-500 p-1 transition-colors duration-200" 
                  onClick={() => showOptions(messages[messages.length - 1])}
                  title="Дополнительные опции"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 8h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button 
                  className="text-gray-400 hover:text-yellow-500 p-1 transition-colors duration-200" 
                  onClick={() => showInfo(messages[messages.length - 1])}
                  title="Информация"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Import GPTLogo component for ChatContainer
import GPTLogo from "./GPTLogo";

export default ChatContainer;
