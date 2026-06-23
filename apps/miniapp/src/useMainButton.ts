import { useEffect, useRef } from 'react';
import { mainButton } from '@tma.js/sdk-react';
import { isMockEnv } from './mockEnv';

interface MainButtonParams {
  text: string;
  isEnabled: boolean;
  isVisible: boolean;
  isLoaderVisible?: boolean;
  onClick: () => void;
}

// Управляет нативной нижней кнопкой Telegram (MainButton) на время жизни экрана.
// В браузерном mock-окружении нативной кнопки нет — хук бездействует, а форма
// показывает свою тема-aware кнопку-фолбэк (см. isMockEnv).
export function useMainButton({ text, isEnabled, isVisible, isLoaderVisible = false, onClick }: MainButtonParams) {
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  // Монтирование + подписка на клик — один раз за жизнь экрана.
  useEffect(() => {
    if (isMockEnv) return;
    try {
      if (!mainButton.isMounted()) mainButton.mount();
    } catch {
      return;
    }
    const off = mainButton.onClick(() => onClickRef.current());
    return () => {
      try {
        off();
        mainButton.setParams({ isVisible: false });
      } catch {
        /* кнопка не смонтирована — игнорируем */
      }
    };
  }, []);

  // Параметры кнопки синхронизируем с состоянием формы.
  useEffect(() => {
    if (isMockEnv) return;
    try {
      mainButton.setParams({ text, isEnabled, isVisible, isLoaderVisible });
    } catch {
      /* нет поддержки/не смонтирована */
    }
  }, [text, isEnabled, isVisible, isLoaderVisible]);
}
