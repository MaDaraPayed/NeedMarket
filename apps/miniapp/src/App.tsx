import { Placeholder, Spinner } from '@telegram-apps/telegram-ui';
import { Smartphone, Lock, AlertTriangle } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { Home } from './screens/Home';

export function App() {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return (
      <Placeholder description="Подключаемся к серверу...">
        <Spinner size="l" />
      </Placeholder>
    );
  }

  if (state.status === 'no-telegram') {
    return (
      <Placeholder
        header="Откройте в Telegram"
        description="Это приложение работает внутри Telegram. Откройте его через бота NeedMarket."
      >
        <Smartphone size={56} color="var(--nm-ink-3)" />
      </Placeholder>
    );
  }

  if (state.status === 'unauthorized') {
    return (
      <Placeholder
        header="Подпись не подтверждена"
        description="Вы вне Telegram (или mock-данные) — бэкенд отклонил подпись. Откройте приложение через бота в Telegram."
      >
        <Lock size={56} color="var(--nm-ink-3)" />
      </Placeholder>
    );
  }

  if (state.status === 'error') {
    return (
      <Placeholder header="Ошибка" description={state.message}>
        <AlertTriangle size={56} color="var(--nm-amber)" />
      </Placeholder>
    );
  }

  return <Home user={state.user} token={state.token} />;
}
