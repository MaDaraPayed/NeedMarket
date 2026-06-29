import { useState } from 'react';
import { PLATFORMS } from '@needmarket/shared';
import { updateProfile, type ApiUser, type LinkedAccount } from '../api';
import { useMainButton } from '../useMainButton';
import { isMockEnv } from '../mockEnv';
import { Button } from '../components/Button';
import { SelectChip } from '../components/SelectChip';
import { MultiCategorySelect } from '../components/MultiCategorySelect';
import { FormSection, TextField, FormHint } from '../components/FormControls';

interface AccountRow {
  platform: string;
  url: string;
  followers: string;
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'var(--nm-surface)',
  border: '1px solid var(--nm-line)',
  borderRadius: 'var(--nm-r-field)',
  padding: '13px 14px',
  fontSize: 15,
  color: 'var(--nm-ink)',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

export function BloggerOnboardingForm({
  token,
  user,
  onSaved,
}: {
  token: string;
  user: ApiUser;
  onSaved: (user: ApiUser) => void;
}) {
  const [displayName, setDisplayName] = useState(user.firstName ?? '');
  const [city, setCity] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([{ platform: '', url: '', followers: '' }]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function updateAccount(i: number, patch: Partial<AccountRow>) {
    setAccounts((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function addAccount() {
    setAccounts((prev) => [...prev, { platform: '', url: '', followers: '' }]);
  }

  function removeAccount(i: number) {
    setAccounts((prev) => prev.filter((_, idx) => idx !== i));
  }

  const validAccounts = accounts.filter((a) => a.platform.trim() && a.url.trim());

  const canSave =
    displayName.trim().length > 0 &&
    city.trim().length > 0 &&
    categories.length >= 1 &&
    validAccounts.length >= 1 &&
    termsAccepted;

  const missing: string[] = [];
  if (!displayName.trim()) missing.push('Имя / название блога');
  if (!city.trim()) missing.push('Город');
  if (!categories.length) missing.push('Хотя бы одна категория');
  if (!validAccounts.length) missing.push('Хотя бы одна площадка со ссылкой');
  if (!termsAccepted) missing.push('Согласие с условиями');

  function handleSubmit() {
    if (!canSave) { setSubmitted(true); return; }
    void save();
  }

  async function save() {
    if (!canSave || busy) return;

    const linkedAccounts: LinkedAccount[] = validAccounts.map((a) => {
      const n = a.followers.trim() === '' ? undefined : Number(a.followers);
      const acc: LinkedAccount = { platform: a.platform.trim(), url: a.url.trim() };
      if (n != null && Number.isFinite(n) && n >= 0) acc.followers = n;
      return acc;
    });

    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile(token, {
        displayName: displayName.trim(),
        categories,
        city: city.trim(),
        linkedAccounts,
        termsAcceptedAt: new Date().toISOString(),
      });
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  useMainButton({
    text: 'Продолжить',
    isEnabled: !busy,
    isVisible: true,
    isLoaderVisible: busy,
    onClick: handleSubmit,
  });

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div
        style={{
          fontSize: 19,
          fontWeight: 800,
          color: 'var(--nm-ink)',
          letterSpacing: '-.3px',
          marginBottom: 4,
        }}
      >
        Расскажите о себе
      </div>
      <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 20 }}>
        Базовые данные — дополните анкету позже
      </div>

      {/* Основное */}
      <FormSection title="Основное" first>
        <TextField
          label="Имя / название блога"
          placeholder="Например, Алиса о бьюти"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <TextField
          label="Город"
          placeholder="Алматы"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </FormSection>

      {/* Тематика */}
      <FormSection title="Тематика">
        <MultiCategorySelect value={categories} onChange={setCategories} />
      </FormSection>

      {/* Площадки */}
      <FormSection title="Ваши площадки">
        {accounts.map((a, i) => (
          <div
            key={i}
            style={{
              marginBottom: 12,
              padding: '12px 14px 4px',
              background: 'var(--nm-surface)',
              border: '1px solid var(--nm-line)',
              borderRadius: 'var(--nm-r-card)',
            }}
          >
            <div style={{ marginBottom: 15 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--nm-ink-2)',
                  marginBottom: 8,
                }}
              >
                Платформа
              </label>
              <select
                value={a.platform}
                onChange={(e) => updateAccount(i, { platform: e.target.value })}
                style={selectStyle}
              >
                <option value="">Выберите платформу</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label="Ссылка на профиль"
              placeholder="https://instagram.com/..."
              value={a.url}
              onChange={(e) => updateAccount(i, { url: e.target.value })}
            />
            <TextField
              label="Подписчики"
              optional
              type="number"
              inputMode="numeric"
              placeholder="например, 12 000"
              value={a.followers}
              onChange={(e) => updateAccount(i, { followers: e.target.value })}
            />
            {accounts.length > 1 && (
              <div style={{ marginBottom: 10 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ color: 'var(--nm-red)', borderColor: 'transparent' }}
                  onClick={() => removeAccount(i)}
                >
                  Удалить
                </Button>
              </div>
            )}
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addAccount}>
          + Добавить площадку
        </Button>
        <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 8 }}>
          Добавьте хотя бы одну соцсеть с вашей аудиторией
        </div>
      </FormSection>

      {/* Условия */}
      <FormSection title="Условия">
        <label
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            style={{
              width: 18,
              height: 18,
              marginTop: 2,
              cursor: 'pointer',
              flexShrink: 0,
              accentColor: 'var(--nm-blue)',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--nm-ink)', lineHeight: 1.5 }}>
            Я принимаю{' '}
            <span style={{ color: 'var(--nm-blue)' }}>условия NeedMarket</span>
            {' '}(полный текст оферты появится позже)
          </span>
        </label>
      </FormSection>

      <FormHint missing={submitted ? missing : []} />

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 4, paddingLeft: 4 }}>
          {error}
        </div>
      )}

      {/* Fallback только в браузере (dev); в Telegram — нативный MainButton */}
      {isMockEnv && (
        <div style={{ marginTop: 24 }}>
          <Button
            variant="fill"
            disabled={busy}
            onClick={handleSubmit}
            style={{ width: '100%' }}
          >
            {busy ? 'Сохраняем...' : 'Продолжить'}
          </Button>
        </div>
      )}
    </div>
  );
}
