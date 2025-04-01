import React, { useCallback, useEffect, useState } from 'react';
import { Settings } from '@shared/schema';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useIsMobile } from '@/hooks/use-mobile';
import { queryClient } from '@/lib/queryClient';

/**
 * Компонент UIStyleProvider применяет глобальные стили из настроек UI
 * Поддерживает разные настройки для мобильных и десктопных устройств
 */
const UIStyleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Состояние для локально загруженных настроек
  const [localSettings, setLocalSettings] = useState<Settings | null>(null);
  
  // Загружаем настройки с сервера (с кэшированием)
  const { data: serverSettings } = useQuery({
    queryKey: ['/api/settings'],
    queryFn: async () => {
      const result = await apiRequest('/api/settings');
      return result as Settings;
    },
  });
  
  // Используем настройки из localStorage или с сервера
  const settings = localSettings || serverSettings;
  
  const isMobile = useIsMobile();
  const [styleElement, setStyleElement] = useState<HTMLStyleElement | null>(null);
  
  // Функция загрузки настроек из localStorage
  const loadSettingsFromLocalStorage = useCallback(() => {
    try {
      const storedSettings = localStorage.getItem('liveStyleEditorSettings');
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings) as Settings;
        if (parsedSettings?.ui) {
          setLocalSettings(parsedSettings);
          console.log('✅ UIStyleProvider: Настройки загружены из localStorage');
          return true;
        }
      }
    } catch (e) {
      console.warn('⚠️ UIStyleProvider: Ошибка при загрузке настроек из localStorage:', e);
    }
    return false;
  }, []);
  
  // Загружаем настройки из localStorage при монтировании компонента
  useEffect(() => {
    loadSettingsFromLocalStorage();
    
    // Подписываемся на изменения localStorage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'liveStyleEditorSettings' && e.newValue) {
        loadSettingsFromLocalStorage();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [loadSettingsFromLocalStorage]);
  
  useEffect(() => {
    // Создаем элемент стиля, если его еще нет
    if (!styleElement) {
      const element = document.createElement('style');
      element.setAttribute('id', 'ui-style-provider');
      document.head.appendChild(element);
      setStyleElement(element);
      return () => {
        document.head.removeChild(element);
      };
    }
  }, []);
  
  useEffect(() => {
    // Проверяем наличие настроек и элемента стиля
    if (!settings || !styleElement) {
      console.log('Нет настроек или элемента стиля', { settings, styleElement });
      return;
    }
    
    // Проверяем наличие настроек UI
    if (!settings.ui || settings.ui.enabled === false) {
      console.log('Настройки UI отключены или отсутствуют', settings.ui);
      return;
    }
    
    // Выбираем настройки типографики в зависимости от типа устройства
    const typography = isMobile 
      ? settings.ui.typography?.mobile 
      : settings.ui.typography?.desktop;
    
    // Создаем CSS правила
    const rules = [];
    
    try {
      // Применяем цвета
      if (settings.ui.colors && 
          settings.ui.colors.primary && 
          settings.ui.colors.secondary && 
          settings.ui.colors.accent) {
        rules.push(`
          :root {
            --primary-color: ${settings.ui.colors.primary};
            --secondary-color: ${settings.ui.colors.secondary};
            --accent-color: ${settings.ui.colors.accent};
          }
        `);
      } else {
        console.log('Отсутствуют необходимые цвета в настройках', settings.ui.colors);
      }
    } catch (error) {
      console.error('Ошибка при применении цветов:', error);
    }
    
    // Применяем глобальные стили типографики
    try {
      if (typography) {
        const selector = isMobile ? '.chat-container, .chat-message' : 'body, .chat-container, .chat-message';
        
        if (typography.fontSize && typeof typography.fontSize === 'number') {
          rules.push(`
            ${selector} {
              font-size: ${typography.fontSize}px;
            }
          `);
        }
        
        if (typography.fontFamily && typeof typography.fontFamily === 'string') {
          rules.push(`
            ${selector} {
              font-family: ${typography.fontFamily};
            }
          `);
        }
        
        if (typography.spacing && typeof typography.spacing === 'number') {
          rules.push(`
            ${selector} {
              line-height: ${typography.spacing};
            }
          `);
        }
      }
    } catch (error) {
      console.error('Ошибка при применении стилей типографики:', error);
    }
    
    // Стили элементов
    try {
      if (settings.ui.elements) {
        // Скругленные углы
        if (typeof settings.ui.elements.roundedCorners === 'boolean') {
          if (settings.ui.elements.roundedCorners) {
            rules.push(`
              .chat-message, .chat-input, button {
                border-radius: 8px;
              }
            `);
          } else {
            rules.push(`
              .chat-message, .chat-input, button {
                border-radius: 0;
              }
            `);
          }
        }
        
        // Тени
        if (typeof settings.ui.elements.shadows === 'boolean') {
          if (settings.ui.elements.shadows) {
            rules.push(`
              .chat-message, .chat-input, button {
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
            `);
          } else {
            rules.push(`
              .chat-message, .chat-input, button {
                box-shadow: none;
              }
            `);
          }
        }
        
        // Анимации
        if (typeof settings.ui.elements.animations === 'boolean') {
          if (settings.ui.elements.animations) {
            rules.push(`
              button, .chat-input {
                transition: all 0.2s ease;
              }
              button:hover {
                transform: translateY(-2px);
              }
            `);
          } else {
            rules.push(`
              button, .chat-input {
                transition: none;
              }
              button:hover {
                transform: none;
              }
            `);
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при применении стилей элементов:', error);
    }
    
    // Устанавливаем все стили
    try {
      styleElement.textContent = rules.join('\n');
      console.log('Стили успешно применены');
    } catch (error) {
      console.error('Ошибка при установке стилей:', error);
    }
    
  }, [settings, isMobile, styleElement]);
  
  return <>{children}</>;
};

export default UIStyleProvider;