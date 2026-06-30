import { useState } from 'react';
import { patchPhone, type ApiUser } from '../api';
import { useMainButton } from '../useMainButton';
import { isMockEnv } from '../mockEnv';
import { Button } from '../components/Button';
import { FormSection, TextField, FormHint } from '../components/FormControls';

// Блокирующий промпт для блогеров без телефона (needsPhone === true).
// Минимальный экран: одно поле + MainButton «Сохранить».
// После успешного сохранения onSaved получает обновлённый ApiUser с needsPhone=false.
export function PhonePrompt({
  token,
  onSaved,
}: {
  token: string;
  onSaved: (user: ApiUser) => void;
}) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isValid = phone.trim().length > 0;
  const missing = !isValid ? ['Телефон'] : [];

  function handleSubmit() {
    if (!isValid) {
      setSubmitted(true);
      return;
    }
    void save();
  }

  async function save() {
    if (!isValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchPhone(token, phone.trim());
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  useMainButton({
    text: 'Сохранить',
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
        Укажите телефон
      </div>
      <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 20 }}>
        Нужен для связи. Виден только администраторам NeedMarket.
      </div>

      <FormSection title="Контакт" first>
        <TextField
          label="Телефон"
          type="tel"
          inputMode="tel"
          placeholder="+7..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormSection>

      <FormHint missing={submitted ? missing : []} />

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 4, paddingLeft: 4 }}>
          {error}
        </div>
      )}

      {isMockEnv && (
        <div style={{ marginTop: 24 }}>
          <Button
            variant="fill"
            disabled={busy}
            onClick={handleSubmit}
            style={{ width: '100%' }}
          >
            {busy ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      )}
    </div>
  );
}
