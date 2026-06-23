// Mock-окружение для разработки ВНЕ Telegram (паттерн из reactjs-template).
// Позволяет рендерить UI в обычном браузере. ВАЖНО: этот mock-initData НЕ пройдёт
// реальную криптопроверку подписи на бэкенде — это ожидаемо. Полноценный тест
// авторизации делается внутри Telegram через туннель.
import { isTMA, mockTelegramEnv, emitEvent } from '@tma.js/sdk-react';

// true, если запущены ВНЕ Telegram в деве (мок активен). Считаем ДО mockTelegramEnv,
// т.к. после мока isTMA() станет true. Нужен формам: в браузере нативной MainButton
// нет — там показываем тема-aware кнопку-фолбэк telegram-ui.
export const isMockEnv = import.meta.env.DEV && !isTMA();

if (isMockEnv) {
  const themeParams = {
    accent_text_color: '#6ab2f2',
    bg_color: '#17212b',
    button_color: '#5288c1',
    button_text_color: '#ffffff',
    destructive_text_color: '#ec3942',
    header_bg_color: '#17212b',
    hint_color: '#708499',
    link_color: '#6ab3f3',
    secondary_bg_color: '#232e3c',
    section_bg_color: '#17212b',
    section_header_text_color: '#6ab3f3',
    subtitle_text_color: '#708499',
    text_color: '#f5f5f5',
  } as const;

  const noInsets = { left: 0, top: 0, right: 0, bottom: 0 } as const;

  // Фейковые данные пользователя — только для рендера UI вне Telegram.
  const initDataRaw = new URLSearchParams([
    [
      'user',
      JSON.stringify({
        id: 99281932,
        first_name: 'Андрей (mock)',
        last_name: 'Тестовый',
        username: 'mockuser',
        language_code: 'ru',
        is_premium: true,
        allows_write_to_pm: true,
      }),
    ],
    ['hash', '0'.repeat(64)],
    ['signature', 'mock-signature'],
    ['auth_date', Math.floor(Date.now() / 1000).toString()],
  ]).toString();

  const launchParams = new URLSearchParams([
    ['tgWebAppData', initDataRaw],
    ['tgWebAppThemeParams', JSON.stringify(themeParams)],
    ['tgWebAppVersion', '8.4'],
    ['tgWebAppPlatform', 'tdesktop'],
  ]).toString();

  mockTelegramEnv({
    launchParams,
    onEvent(event, next) {
      switch (event.name) {
        case 'web_app_request_theme':
          return emitEvent('theme_changed', { theme_params: themeParams });
        case 'web_app_request_viewport':
          return emitEvent('viewport_changed', {
            height: window.innerHeight,
            width: window.innerWidth,
            is_expanded: true,
            is_state_stable: true,
          });
        case 'web_app_request_content_safe_area':
          return emitEvent('content_safe_area_changed', noInsets);
        case 'web_app_request_safe_area':
          return emitEvent('safe_area_changed', noInsets);
        default:
          return next();
      }
    },
  });

  console.warn(
    '⚠️ Telegram-окружение замокано для разработки. Реальная авторизация работает только внутри Telegram.',
  );
}
