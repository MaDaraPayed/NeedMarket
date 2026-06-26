import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { retrieveRawInitData } from '@tma.js/sdk-react';
import { authWithTelegram, fetchMe, type ApiUser } from './api';

type AuthState =
  | { status: 'loading' }
  | { status: 'no-telegram' } // не удалось получить initData (открыто вне Telegram)
  | { status: 'unauthorized' } // подпись отклонена бэкендом (например, mock-данные)
  | { status: 'error'; message: string }
  | { status: 'authed'; user: ApiUser; token: string };

interface AuthContextValue {
  state: AuthState;
  // Обновляет пользователя после смены роли/профиля (когда уже authed).
  setUser: (user: ApiUser) => void;
}

const AuthContext = createContext<AuthContextValue>({ state: { status: 'loading' }, setUser: () => {} });

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) Сырой initData. Вне Telegram (без mock) — выбросит исключение.
      let initData: string | undefined;
      try {
        initData = retrieveRawInitData();
      } catch {
        initData = undefined;
      }
      if (!initData) {
        if (!cancelled) setState({ status: 'no-telegram' });
        return;
      }

      try {
        // 2) Меняем initData на наш JWT (бэкенд проверяет подпись).
        const auth = await authWithTelegram(initData);
        if (cancelled) return;
        if (!auth.ok) {
          setState(auth.status === 401 ? { status: 'unauthorized' } : { status: 'error', message: `HTTP ${auth.status}` });
          return;
        }

        // 3) Имя берём С БЭКЕНДА через /me — это доказывает сквозную авторизацию.
        const user = await fetchMe(auth.token);
        if (cancelled) return;
        setState({ status: 'authed', user, token: auth.token });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: (err as Error).message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function setUser(user: ApiUser) {
    setState((prev) => {
      if (prev.status !== 'authed') return prev;
      // Сохраняем platformSettings от предыдущего /me если новый объект не несёт их
      // (обновления профиля не включают platformSettings в ответе).
      const merged: ApiUser = user.platformSettings
        ? user
        : { ...user, platformSettings: prev.user.platformSettings };
      return { ...prev, user: merged };
    });
  }

  return <AuthContext.Provider value={{ state, setUser }}>{children}</AuthContext.Provider>;
}
