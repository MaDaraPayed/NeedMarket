import { useState } from 'react';
import { X } from 'lucide-react';
import { PLATFORMS } from '@needmarket/shared';
import { createLot, type Lot } from '../../api';
import { SelectChip } from '../../components/SelectChip';
import { MultiCategorySelect } from '../../components/MultiCategorySelect';
import { Button } from '../../components/Button';
import {
  TextField,
  FormTextarea,
  BudgetRow,
  DateRow,
  Stepper,
  UploadZone,
  FormSection,
  FormHint,
} from '../../components/FormControls';
import { useMainButton } from '../../useMainButton';
import { isMockEnv } from '../../mockEnv';

// Создание лота компанией. Главное действие — нативная MainButton (как в формах
// профиля); в браузерном mock показываем кнопку-фолбэк.
export function CreateLotForm({
  token,
  onCreated,
  onCancel,
}: {
  token: string;
  onCreated: (lot: Lot) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState(''); // YYYY-MM-DD из <input type="date">
  const [requirements, setRequirements] = useState<string[]>([]);
  const [slotsNeeded, setSlotsNeeded] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }
  function updateRequirement(i: number, value: string) {
    setRequirements((prev) => prev.map((r, idx) => (idx === i ? value : r)));
  }
  function addRequirement() {
    setRequirements((prev) => [...prev, '']);
  }
  function removeRequirement(i: number) {
    setRequirements((prev) => prev.filter((_, idx) => idx !== i));
  }

  const budgetNum = Number(budget);
  const slotsNum = Number(slotsNeeded);
  const deadlineFuture = deadline !== '' && new Date(deadline).getTime() > Date.now();
  const canSave =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    categories.length > 0 &&
    platforms.length > 0 &&
    Number.isFinite(budgetNum) &&
    budgetNum > 0 &&
    deadlineFuture &&
    Number.isInteger(slotsNum) &&
    slotsNum >= 1 &&
    slotsNum <= 20;

  const missing: string[] = [];
  if (!title.trim()) missing.push('Название лота');
  if (!description.trim()) missing.push('Описание задачи');
  if (!categories.length) missing.push('Хотя бы одна категория');
  if (!platforms.length) missing.push('Хотя бы одна площадка');
  if (!(Number.isFinite(budgetNum) && budgetNum > 0)) missing.push('Бюджет');
  if (!deadlineFuture) missing.push('Дедлайн (будущая дата)');

  async function save() {
    if (!canSave || busy) {
      if (!canSave) setError('Заполните все обязательные поля (дедлайн — будущая дата)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const lot = await createLot(token, {
        title: title.trim(),
        description: description.trim(),
        categories: categories as import('@needmarket/shared').Category[],
        platforms,
        budget: Math.trunc(budgetNum),
        deadline: new Date(deadline).toISOString(),
        requirements: requirements.map((r) => r.trim()).filter(Boolean),
        slotsNeeded: slotsNum,
      });
      onCreated(lot);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  useMainButton({
    text: 'Опубликовать лот',
    isEnabled: canSave && !busy,
    isVisible: true,
    isLoaderVisible: busy,
    onClick: save,
  });

  return (
    <div style={{ padding: '16px 16px 32px', background: 'var(--nm-bg)', minHeight: '100%' }}>

      <FormSection title="Основное" first>
        <TextField
          label="Название лота"
          placeholder="Напр. Запуск новой линейки кремов"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoComplete="off"
        />
        <FormTextarea
          label="Описание задачи"
          placeholder="Что рекламируем, ключевые тезисы, желаемый тон подачи…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormSection>

      <FormSection title="Аудитория">
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
            Категории{' '}
            <em style={{ fontStyle: 'normal', color: 'var(--nm-ink-3)', fontWeight: 500 }}>
              · можно несколько
            </em>
          </label>
          <MultiCategorySelect value={categories} onChange={setCategories} />
        </div>
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
            Площадки
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PLATFORMS.map((p) => (
              <SelectChip
                key={p}
                label={p}
                selected={platforms.includes(p)}
                onClick={() => togglePlatform(p)}
              />
            ))}
          </div>
        </div>
      </FormSection>

      <FormSection title="Условия">
        <BudgetRow label="Бюджет" value={budget} onChange={setBudget} />
        <Stepper
          label="Сколько блогеров нужно"
          value={slotsNum || 1}
          onDecrement={() => setSlotsNeeded((v) => String(Math.max(1, Number(v) - 1)))}
          onIncrement={() => setSlotsNeeded((v) => String(Math.min(20, Number(v) + 1)))}
          min={1}
          max={20}
          hint="Лот закроется, когда подберём всех"
        />
        <DateRow label="Дедлайн" value={deadline} onChange={setDeadline} />
      </FormSection>

      <FormSection title="Материалы">
        <UploadZone
          label="ТЗ и примеры"
          optional
          description="PDF, фото, видео · добавьте после публикации лота"
        />
      </FormSection>

      <FormSection title="Требования">
        {requirements.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <TextField
                label={`Пункт ${i + 1}`}
                optional
                placeholder="например, упоминание бренда в первые 5 секунд"
                value={r}
                onChange={(e) => updateRequirement(i, e.target.value)}
              />
            </div>
            <div style={{ paddingTop: 29 }}>
              <button
                type="button"
                onClick={() => removeRequirement(i)}
                aria-label="Удалить пункт"
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--nm-ink-3)',
                  cursor: 'pointer',
                  padding: 6,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addRequirement}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--nm-blue)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '8px 0',
            display: 'block',
          }}
        >
          + Добавить требование
        </button>
      </FormSection>

      <FormHint missing={missing} />

      {error && (
        <div
          style={{ color: 'var(--nm-red)', padding: '8px 0', fontSize: 13, marginTop: 4 }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {isMockEnv && (
          <Button
            variant="fill"
            style={{ width: '100%' }}
            disabled={!canSave || busy}
            onClick={() => void save()}
          >
            {busy ? '…' : 'Опубликовать лот'}
          </Button>
        )}
        <Button
          variant="ghost"
          style={{ width: '100%' }}
          onClick={onCancel}
          disabled={busy}
        >
          Отмена
        </Button>
      </div>

      <p
        style={{
          fontSize: 12,
          color: 'var(--nm-ink-2)',
          textAlign: 'center',
          lineHeight: 1.5,
          margin: '16px 8px 0',
        }}
      >
        Лот уйдёт на модерацию. Оплата — после того, как подберём блогеров и вы подтвердите
        состав.
      </p>
    </div>
  );
}
