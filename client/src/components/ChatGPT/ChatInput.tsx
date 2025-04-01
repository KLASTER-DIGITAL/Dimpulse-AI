import { useState, useRef, useEffect } from "react";

interface ChatInputProps {
  onSendMessage: (
    message: string, 
    audioData?: string, 
    fileData?: { content: string, name: string, type: string },
    filesData?: Array<{ content: string, name: string, type: string, size: number }>
  ) => void;
  onVoiceInput?: (transcript: string) => void;
  onFileUpload?: (fileContent: string, fileName: string, fileType: string) => void;
  isLoading: boolean;
}

const ChatInput = ({ onSendMessage, onVoiceInput, onFileUpload, isLoading }: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Автоматически фокусируем поле ввода при загрузке компонента
  // Используем тот же подход, что и на главной странице
  useEffect(() => {
    // Функция для фокусировки с таймаутом
    const focusInput = () => {
      if (inputRef.current) {
        console.log("Focusing input element");
        inputRef.current.focus();
      }
    };
    
    // Вызываем фокусировку с задержкой
    setTimeout(focusInput, 200);
  }, []);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      // Отправка сообщения с аудиоданными и/или файлами, если они доступны
      const filesData = uploadedFiles.length > 0 ? 
        uploadedFiles.map(file => ({
          content: file.content,
          name: file.name,
          type: file.type,
          size: file.size
        })) : 
        undefined;
      
      // Для обратной совместимости используем первый файл если он есть
      const fileData = uploadedFiles.length > 0 ? {
        content: uploadedFiles[0].content,
        name: uploadedFiles[0].name,
        type: uploadedFiles[0].type
      } : undefined;
      
      console.log(`Отправляем сообщение: "${message.trim()}" с ${uploadedFiles.length} файлами`);
      
      // Если есть несколько файлов, включаем их все в сообщение
      onSendMessage(
        message.trim(), 
        audioData || undefined, 
        fileData,
        filesData
      );
      
      // Сбрасываем состояние
      setMessage("");
      setAudioData(null);
      setUploadedFiles([]);
      setPendingFiles(false);
      
      // Reset input
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } else if (uploadedFiles.length > 0 && !message.trim()) {
      // Если есть файлы, но нет сообщения - показываем предупреждение
      alert("Пожалуйста, введите текстовое сообщение вместе с прикрепленными файлами.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  // Добавляем ссылку на аудиоданные
  const [audioData, setAudioData] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const toggleVoiceRecording = () => {
    if (!onVoiceInput) return;
    
    if (!isRecording) {
      // Start recording
      setIsRecording(true);
      setAudioData(null);
      
      // Проверяем, поддерживает ли браузер запись аудио
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Запрашиваем доступ к микрофону
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then((stream) => {
            // Создаем распознавание речи
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            
            if (SpeechRecognition) {
              const recognition = new SpeechRecognition();
              recognition.lang = 'ru-RU';
              recognition.continuous = false;
              recognition.interimResults = false;
              
              // Запускаем запись аудио
              audioChunksRef.current = [];
              mediaRecorderRef.current = new MediaRecorder(stream);
              
              mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  audioChunksRef.current.push(event.data);
                }
              };
              
              mediaRecorderRef.current.onstop = () => {
                // Преобразуем запись в base64 строку для отправки
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                  const base64Audio = reader.result as string;
                  // Убираем префикс data:audio/wav;base64, для получения чистого base64
                  const base64AudioData = base64Audio.split(',')[1];
                  setAudioData(base64AudioData);
                };
              };
              
              mediaRecorderRef.current.start();
              
              recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setMessage(transcript);
                
                // Останавливаем запись аудио
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                  mediaRecorderRef.current.stop();
                  
                  // Останавливаем все треки
                  stream.getTracks().forEach(track => track.stop());
                }
                
                setIsRecording(false);
              };
              
              recognition.onerror = () => {
                setIsRecording(false);
                // Останавливаем запись аудио при ошибке
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                  mediaRecorderRef.current.stop();
                  stream.getTracks().forEach(track => track.stop());
                }
              };
              
              recognition.onend = () => {
                setIsRecording(false);
                // Останавливаем запись аудио если распознавание закончилось
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                  mediaRecorderRef.current.stop();
                  stream.getTracks().forEach(track => track.stop());
                }
              };
              
              recognition.start();
            } else {
              alert('Ваш браузер не поддерживает распознавание речи');
              setIsRecording(false);
              stream.getTracks().forEach(track => track.stop());
            }
          })
          .catch((error) => {
            console.error('Ошибка доступа к микрофону:', error);
            alert('Не удалось получить доступ к микрофону');
            setIsRecording(false);
          });
      } else {
        alert('Ваш браузер не поддерживает запись аудио');
        setIsRecording(false);
      }
    } else {
      // Stop recording
      setIsRecording(false);
      
      // Останавливаем запись аудио
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
  };
  
  const handleFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Состояние для хранения прикрепленных файлов (до 10 файлов)
  const [uploadedFiles, setUploadedFiles] = useState<{
    content: string;
    name: string;
    type: string;
    preview?: string;
    size: number;
  }[]>([]);
  
  // Для обратной совместимости оставляем одиночный файл
  const uploadedFile = uploadedFiles.length > 0 ? uploadedFiles[0] : null;
  
  // Для отслеживания, были ли добавлены новые файлы после последней отправки
  const [pendingFiles, setPendingFiles] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onFileUpload) return;
    
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0]; // Пока обрабатываем только один файл за раз
    
    // Проверка размера файла (лимит 20MB = 20 * 1024 * 1024 байт)
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB в байтах
    if (file.size > MAX_FILE_SIZE) {
      alert(`Файл слишком большой. Максимальный размер файла - 20MB. Ваш файл: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
      return;
    }
    
    // Проверка количества файлов (максимум 10)
    if (uploadedFiles.length >= 10) {
      alert('Вы уже прикрепили максимальное количество файлов (10). Удалите некоторые файлы, чтобы добавить новые.');
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        // Сохраняем информацию о файле
        const fileInfo = {
          content,
          name: file.name,
          type: file.type,
          preview: file.type.startsWith('image/') ? content : undefined,
          size: file.size
        };
        
        // Добавляем файл в массив файлов и показываем его пользователю
        setUploadedFiles(prevFiles => {
          // Добавляем новый файл в массив
          const newFiles = [...prevFiles, fileInfo];
          
          // Показываем файлы в интерфейсе (принудительно устанавливаем видимость)
          setTimeout(() => {
            // Элемент с прикрепленными файлами
            const fileContainer = document.querySelector(".bg-\\[\\#202020\\].rounded-md");
            if (fileContainer) {
              // Убеждаемся, что контейнер виден
              (fileContainer as HTMLElement).style.display = 'block';
            }
          }, 100);
          
          return newFiles;
        });
        
        // Помечаем, что есть новые файлы, ожидающие отправки
        setPendingFiles(true);
        
        // Обновляем сообщение с информацией о файлах
        const fileCount = uploadedFiles.length + 1;
        if (fileCount === 1) {
          if (file.type.startsWith('image/')) {
            setMessage(`Чем еще могу помочь?`);
          } else {
            setMessage(`Чем еще могу помочь?`);
          }
        } else {
          setMessage(`Чем еще могу помочь?`);
        }
        
        // НЕ вызываем обработчик загрузки файла - ждем сообщение пользователя
        // Только для отладки - уведомляем о типе файла
        console.log(`Прикреплен файл "${file.name}" (${file.size} байт), тип: ${file.type}`);
      }
    };
    
    // Обрабатываем различные типы файлов
    if (file.type === 'text/plain' || file.type === 'application/json' || 
        file.type === 'text/html' || file.type === 'text/markdown' || 
        file.type === 'application/pdf') {
      reader.readAsDataURL(file); // Используем DataURL для всех файлов
    } else if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      alert('Формат файла не поддерживается');
    }
    
    // Очищаем input для возможности повторной загрузки того же файла
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div className="p-2 sm:p-3 md:p-4 fixed bottom-0 left-0 right-0 z-10 bg-black bg-opacity-90 backdrop-blur-sm">
      <div className="w-full max-w-3xl mx-auto">
        {/* Отображение прикрепленных файлов */}
        {uploadedFiles.length > 0 && (
          <div className="bg-[#202020] rounded-md mb-2 p-2 relative">
            {/* Счетчик файлов, если их больше одного */}
            {uploadedFiles.length > 1 && (
              <div className="mb-2 text-sm text-white font-medium">
                Прикреплено файлов: {uploadedFiles.length} / 10
              </div>
            )}
            
            {/* Контейнер для всех файлов */}
            <div className="flex flex-col space-y-2">
              {/* Отображаем каждый файл в списке */}
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center">
                  {file.type.startsWith('image/') && file.preview ? (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 mr-2 sm:mr-3 rounded-md overflow-hidden">
                      <img 
                        src={file.preview} 
                        alt={file.name}
                        className="w-full h-full object-cover" 
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center mr-2 sm:mr-3 bg-[#2b2b2b] rounded-md">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-sm text-white font-medium truncate">{file.name}</div>
                    <div className="text-xs text-gray-400">
                      {file.type.split('/')[1].toUpperCase()} файл • {(file.size / 1024).toFixed(0)} КБ
                    </div>
                  </div>
                  <button 
                    type="button" 
                    className="ml-2 text-gray-400 hover:text-white p-1"
                    onClick={() => {
                      // Удаляем только конкретный файл из списка
                      setUploadedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            
            {/* Кнопка удаления всех файлов */}
            {uploadedFiles.length > 1 && (
              <div className="mt-2 flex justify-end">
                <button 
                  type="button" 
                  className="text-xs text-gray-400 hover:text-white px-2 py-1"
                  onClick={() => setUploadedFiles([])}
                >
                  Удалить все файлы
                </button>
              </div>
            )}
          </div>
        )}
        
        <form id="chat-form" className="relative bg-black" onSubmit={handleSubmit}>
          <div className={`chat-input-container rounded-full border ${hasFocus ? 'border-[#19c37d] border-opacity-20 shadow-sm shadow-[#19c37d]/10' : 'border-gray-600'} bg-[#101010] flex items-center pr-2 transition-all duration-300`}>
            {/* Кнопка прикрепления файла */}
            <button
              type="button"
              className="p-2 text-gray-400 hover:text-white focus:outline-none"
              onClick={handleFileSelect}
              disabled={isLoading || isRecording}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.json,.md,.jpg,.jpeg,.png,.pdf"
                onChange={handleFileChange}
                disabled={isLoading}
                capture="environment"
              />
            </button>
            
            {/* Поле ввода */}
            <input 
              type="text" 
              name="message"
              placeholder="Чем еще могу помочь..."
              className="flex-1 bg-transparent text-white text-sm sm:text-base border-none px-3 sm:px-4 py-2 sm:py-3 focus:outline-none rounded-full"
              disabled={isLoading || isRecording}
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setHasFocus(true)}
              onBlur={() => setHasFocus(false)}
            />
            
            {/* Кнопка отправки голосового сообщения */}
            <button 
              type="button" 
              className={`primary p-1 sm:p-2 rounded-full ${isRecording ? 'text-red-500' : 'text-gray-400 hover:text-white'} focus:outline-none`}
              onClick={toggleVoiceRecording}
              disabled={isLoading}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </button>
            
            {/* Кнопка отправки сообщения */}
            <button 
              type="submit" 
              id="send-button"
              className="primary p-1 sm:p-2 rounded-full text-gray-400 hover:text-white disabled:hover:text-gray-500 disabled:opacity-40 focus:outline-none"
              disabled={((!message.trim() || (!message.trim() && uploadedFiles.length > 0)) && !isRecording) || isLoading}
              title={uploadedFiles.length > 0 && !message.trim() ? "Необходимо добавить текстовое сообщение" : "Отправить сообщение"}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          
          {/* Кнопки быстрых подсказок - удалили "Обсуни" */}
        </form>
      </div>
    </div>
  );
};

export default ChatInput;
