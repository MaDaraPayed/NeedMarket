import './mockEnv'; // side-effect: мок Telegram-окружения (только в DEV вне Telegram)
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { init, themeParams, viewport, useSignal } from '@tma.js/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import '@telegram-apps/telegram-ui/dist/styles.css';
import './nm-tokens.css';
import { App } from './App';
import { AuthProvider } from './AuthProvider';

// Инициализируем SDK. Вне Telegram (и без mock) может бросить — это не критично.
try {
  init();
} catch (err) {
  console.warn('SDK init пропущен:', (err as Error).message);
}

// Монтируем параметры темы и привязываем CSS-переменные Telegram (--tg-theme-*).
// Это даёт нам реактивный themeParams.isDark, по которому AppRoot выберет
// светлое/тёмное оформление (и переключится на лету при смене темы).
try {
  if (!themeParams.isMounted()) themeParams.mount();
  themeParams.bindCssVars();
} catch (err) {
  console.warn('themeParams не смонтированы:', (err as Error).message);
}

// Монтируем viewport, раскрываем на полный экран и привязываем CSS-переменные высоты.
// Это критично для iOS: без expand() мини-апп открывается в частичном листе.
// bindCssVars() создаёт реактивные переменные:
//   --tg-viewport-height          — текущая видимая высота (меняется при анимации/клавиатуре)
//   --tg-viewport-stable-height   — стабильная высота (после завершения жестов/анимаций)
//   --tg-viewport-safe-area-inset-{top,bottom,left,right}
//   --tg-viewport-content-safe-area-inset-*
void (async () => {
  try {
    if (!viewport.isMounted()) await viewport.mount();
    viewport.expand();
    if (!viewport.isCssVarsBound()) viewport.bindCssVars();
  } catch (err) {
    console.warn('viewport setup пропущен:', (err as Error).message);
  }
})();

// AppRoot следует теме Telegram: appearance вычисляем из themeParams.isDark.
function ThemedRoot() {
  const isDark = useSignal(themeParams.isDark);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : '';
  }, [isDark]);

  return (
    <AppRoot
      appearance={isDark ? 'dark' : 'light'}
      style={{ minHeight: 'var(--tg-viewport-stable-height, 100dvh)', background: 'var(--nm-bg)' }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppRoot>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemedRoot />
  </StrictMode>,
);
