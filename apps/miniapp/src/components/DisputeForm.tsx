import { useState } from 'react';
import { Textarea } from '@telegram-apps/telegram-ui';
import { DISPUTE_REASONS } from '../api';
import type { DisputeReason } from '../api';
import { SelectChip } from './SelectChip';
import { Button } from './Button';
import { useMainButton } from '../useMainButton';
import { isMockEnv } from '../mockEnv';
import { createDispute } from '../api';

const COMPANY_REASONS: DisputeReason[] = [
  'not_delivered',
  'poor_quality',
  'no_contact',
  'terms_violation',
  'other',
];

const BLOGGER_REASONS: DisputeReason[] = [
  'no_payment',
  'no_contact',
  'terms_violation',
  'other',
];

const DESCRIPTION_MAX = 1000;

export function DisputeForm({
  token,
  lotId,
  responseId,
  role,
  onSuccess,
}: {
  token: string;
  lotId: string;
  responseId: string;
  role: 'company' | 'blogger';
  onSuccess: () => void;
}) {
  const availableReasons = role === 'company' ? COMPANY_REASONS : BLOGGER_REASONS;

  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = reason !== null && description.trim().length > 0 && !loading;

  async function submit() {
    if (!canSubmit || !reason) return;
    setLoading(true);
    setError(null);
    try {
      await createDispute(token, lotId, { responseId, reason, description: description.trim() });
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useMainButton({
    text: loading ? 'Отправляем...' : 'Отправить',
    isEnabled: canSubmit,
    isVisible: true,
    isLoaderVisible: loading,
    onClick: submit,
  });

  const reasonLabel = (v: DisputeReason) =>
    DISPUTE_REASONS.find((r) => r.value === v)?.label ?? v;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 8 }}>
          Причина спора
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {availableReasons.map((v) => (
            <SelectChip
              key={v}
              label={reasonLabel(v)}
              selected={reason === v}
              onClick={() => setReason(v)}
            />
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Textarea
          placeholder="Опишите ситуацию подробно..."
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
          style={{ width: '100%', minHeight: 100 }}
        />
        <div style={{ fontSize: 11, color: 'var(--nm-ink-2)', textAlign: 'right', marginTop: 2 }}>
          {description.length}/{DESCRIPTION_MAX}
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginBottom: 8 }}>{error}</div>
      )}

      {isMockEnv && (
        <Button
          variant="fill"
          style={{ width: '100%', opacity: !canSubmit ? 0.65 : 1 }}
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {loading ? 'Отправляем...' : 'Отправить'}
        </Button>
      )}
    </div>
  );
}
