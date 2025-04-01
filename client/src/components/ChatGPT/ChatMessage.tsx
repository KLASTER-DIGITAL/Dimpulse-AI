import React, { useMemo, useEffect, useRef } from "react";
import { Message } from "@shared/schema";
import MarkdownRenderer from "./MarkdownRenderer";
import TypingAnimation from "./TypingAnimation";
import { FiFile, FiImage } from "react-icons/fi";

interface ChatMessageProps {
  message: Message & { typing?: boolean, file?: { name: string, type: string, size: number, url: string } };
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const isTyping = message.typing === true || message.content === "typing";
  const htmlContentRef = useRef<HTMLDivElement>(null);
  const hasAttachment = !!message.file;
  
  // Check if the message content contains HTML/iframe or special script content
  const containsHtml = useMemo(() => {
    if (!message.content) return false;
    
    // Check for Cal.com embed code with HTML comments
    if (message.content.includes('<!-- Cal inline embed code begins -->')) {
      return true;
    }
    
    // Check for Cal.com JavaScript code
    if (message.content.includes('Cal(') && message.content.includes('function')) {
      return true;
    }
    
    // Check for regular HTML tags
    return /<\/?[a-z][\s\S]*>/i.test(message.content) && 
           (/<iframe[\s\S]*?<\/iframe>/i.test(message.content) || 
            /<div[\s\S]*?<\/div>/i.test(message.content) ||
            /<script[\s\S]*?<\/script>/i.test(message.content) ||
            /<embed[\s\S]*?>/i.test(message.content));
  }, [message.content]);
  
  // Execute scripts after component mounts or updates
  useEffect(() => {
    if (!containsHtml || !htmlContentRef.current) return;
    
    // For messages with Cal.com script
    if (message.content.includes('<!-- Cal inline embed code begins -->') || 
       (message.content.includes('Cal(') && message.content.includes('function'))) {
      
      // Allow time for DOM to update
      setTimeout(() => {
        const scripts = htmlContentRef.current?.querySelectorAll('script');
        
        if (scripts && scripts.length > 0) {
          console.log(`Found ${scripts.length} scripts to execute in message`);
          
          // Execute each script
          scripts.forEach((oldScript) => {
            const newScript = document.createElement('script');
            
            // Copy attributes
            Array.from(oldScript.attributes).forEach(attr => {
              newScript.setAttribute(attr.name, attr.value);
            });
            
            // Copy content
            newScript.textContent = oldScript.textContent;
            
            // Replace old script with new to trigger execution
            oldScript.parentNode?.replaceChild(newScript, oldScript);
          });
        }
      }, 500);
    }
  }, [containsHtml, message.content]);
  
  // Render different content based on message type
  const renderContent = () => {
    if (isTyping) {
      return (
        <div className="flex items-center">
          <TypingAnimation />
        </div>
      );
    }
    
    // Special case for Cal.com embed with HTML comments
    if (message.content.includes('<!-- Cal inline embed code begins -->')) {
      return (
        <div 
          ref={htmlContentRef}
          className="html-content w-full" 
          style={{ height: 'auto', minHeight: '500px' }}
          dangerouslySetInnerHTML={{ __html: message.content }}
        />
      );
    }
    
    // For other HTML content including Cal.com JavaScript without comments
    if (containsHtml) {
      return (
        <div 
          ref={htmlContentRef}
          className="html-content w-full" 
          style={{ height: 'auto', minHeight: '500px' }}
          dangerouslySetInnerHTML={{ __html: message.content }}
        />
      );
    }
    
    // Default for markdown content
    return (
      <div className="markdown">
        <MarkdownRenderer content={message.content} />
      </div>
    );
  };
  
  return (
    <div className={`message ${isUser ? "user-message" : "assistant-message"} chat-message mb-6`}>
      {isUser ? (
        <div className="flex justify-end mb-4">
          <div className="user-message bg-gray-800 rounded-full py-2 px-3 sm:px-4 max-w-[90%] sm:max-w-[80%] text-white shadow-sm text-sm sm:text-base">
            {message.content}
            {hasAttachment && (
              <div className="mt-2 file-attachment w-full break-words">
                {message.file?.type?.startsWith('image/') ? (
                  <div className="mt-2 relative">
                    <div className="image-preview-container relative">
                      <img 
                        src={message.file?.url || ''} 
                        alt={message.file?.name || 'Attached file'} 
                        className="rounded-md max-h-40 sm:max-h-60 max-w-full object-contain" 
                      />
                      <div className="absolute bottom-0 right-0 bg-gray-900 text-xs text-white px-2 py-1 rounded-md opacity-80">
                        {message.file?.name || 'Unknown'} • {formatFileSize(message.file?.size || 0)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 sm:gap-2 p-2 bg-gray-700 rounded-md overflow-hidden">
                    <FiFile className="text-blue-400 flex-shrink-0" />
                    <span className="text-xs sm:text-sm truncate">{message.file?.name || 'Unknown file'}</span>
                    <span className="text-xs text-gray-300 flex-shrink-0">{formatFileSize(message.file?.size || 0)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start w-full">
          <div className={`assistant-message flex-1 text-white p-2 sm:p-3 rounded-lg text-sm sm:text-base ${containsHtml ? 'w-full' : ''}`}>
            {renderContent()}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
};

export default ChatMessage;
