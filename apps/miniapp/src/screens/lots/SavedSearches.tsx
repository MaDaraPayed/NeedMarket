import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Switch, Modal } from '@telegram-apps/telegram-ui';
import { CATEGORIES, PLATFORMS } from '@needmarket/shared';
import { Search, AlertTriangle } from 'lucide-react';
import type { SavedSearchDto } from '../../api';
import {
  fetchSavedSearches,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from '../../api';
import { SelectChip } from '../../components/SelectChip';
import { Button as NmButton } from '../../components/Button';
import { FormSection } from '../../components/FormControls';

interface EditState {
  id: string | null; // null = новый
  name: string;
  categories: string[];
  platforms: string[];
  minBudget: string; // строка для инпута, конвертируем при сохранении
}

function emptyEdit(): EditState {
  return { id: null, name: '', categories: [], platforms: [], minBudget: '' };
}

function formatCriteria(s: SavedSearchDto): string {
  const parts: string[] = [];
  if (s.categories.length > 0) parts.push(s.categories.join(', '));
  else parts.push('Любая категория');
  if (s.platforms.length > 0) parts.push(s.platforms.join(', '));
  else parts.push('Любая площадка');
  if (s.minBudget != null) parts.push(`от ${s.minBudget.toLocaleString('ru')} ₸`);
  return parts.join(' · ');
}

function NmEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '56px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ color: 'var(--nm-ink-3)', marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--nm-ink)', marginBottom: 6 }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 14, color: 'var(--nm-ink-2)', lineHeight: 1.5 }}>
          {description}
        </div>
      )}
    </div>
  );
}

// nm-инпут для модальных форм
const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 'var(--nm-r-field)' as string,
  border: '1px solid var(--nm-line)',
  background: 'var(--nm-surface-2)',
  color: 'var(--nm-ink)',
  fontSize: 15,
  outline: 'none',
  fontFamily: 'inherit',
};

function SavedSearchCard({
  s,
  onToggle,
  onEdit,
  onDelete,
}: {
  s: SavedSearchDto;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        border: '1px solid var(--nm-line)',
        boxShadow: 'var(--nm-sh-card)',
        padding: '14px 16px',
        marginBottom: 10,
      }}
    >
      {/* Заголовок + переключатель */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15.5,
              fontWeight: 700,
              color: 'var(--nm-ink)',
              lineHeight: 1.3,
              marginBottom: 4,
            }}
          >
            {s.name ?? 'Поиск'}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--nm-ink-2)',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {formatCriteria(s)}
          </div>
        </div>
        <Switch checked={s.isActive} onChange={onToggle} />
      </div>

      {/* Разделитель */}
      <div style={{ height: 1, background: 'var(--nm-line)', marginBottom: 10 }} />

      {/* Действия */}
      <div style={{ display: 'flex', gap: 8 }}>
        <NmButton variant="ghost" size="sm" onClick={onEdit}>
          Изменить
        </NmButton>
        <NmButton
          variant="ghost"
          size="sm"
          style={{ color: 'var(--nm-red)', borderColor: 'var(--nm-red)' }}
          onClick={onDelete}
        >
          Удалить
        </NmButton>
      </div>
    </div>
  );
}

export function SavedSearches({
  token,
  onBack,
}: {
  token: string;
  onBack?: () => void;
}) {
  const [searches, setSearches] = useState<SavedSearchDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedSearchDto | null>(null);

  async function reload() {
    setError(null);
    try {
      const data = await fetchSavedSearches(token);
      setSearches(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { void reload(); }, [token]);

  async function handleToggle(s: SavedSearchDto) {
    try {
      const updated = await updateSavedSearch(token, s.id, { isActive: !s.isActive });
      setSearches((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
    } catch {
      // best-effort
    }
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    try {
      const minBudget = editing.minBudget.trim() ? parseInt(editing.minBudget, 10) : undefined;
      const input = {
        name: editing.name.trim() || undefined,
        categories: editing.categories,
        platforms: editing.platforms,
        minBudget,
      };

      if (editing.id === null) {
        const created = await createSavedSearch(token, input);
        setSearches((prev) => [created, ...(prev ?? [])]);
      } else {
        const updated = await updateSavedSearch(token, editing.id, input);
        setSearches((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
      }
      setEditing(null);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: SavedSearchDto) {
    try {
      await deleteSavedSearch(token, s.id);
      setSearches((prev) => prev?.filter((x) => x.id !== s.id) ?? null);
    } catch {
      // best-effort
    }
    setConfirmDelete(null);
  }

  function openEdit(s: SavedSearchDto) {
    setEditing({
      id: s.id,
      name: s.name ?? '',
      categories: [...s.categories],
      platforms: [...s.platforms],
      minBudget: s.minBudget != null ? String(s.minBudget) : '',
    });
    setSaveError(null);
  }

  function toggleEditCategory(c: string) {
    setEditing((prev) => prev && ({
      ...prev,
      categories: prev.categories.includes(c)
        ? prev.categories.filter((x) => x !== c)
        : [...prev.categories, c],
    }));
  }

  function toggleEditPlatform(p: string) {
    setEditing((prev) => prev && ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter((x) => x !== p)
        : [...prev.platforms, p],
    }));
  }

  return (
    <div
      style={{
        padding: '16px 16px 40px',
        background: 'var(--nm-bg)',
        minHeight: '100%',
      }}
    >
      {onBack && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <h2
            style={{
              fontSize: 19,
              fontWeight: 800,
              color: 'var(--nm-ink)',
              margin: 0,
              letterSpacing: '-0.2px',
            }}
          >
            Мои поиски
          </h2>
          <NmButton variant="ghost" size="sm" onClick={onBack}>
            ← Назад
          </NmButton>
        </div>
      )}

      {/* Кнопка «Создать поиск» */}
      <div style={{ marginBottom: 16 }}>
        <NmButton
          variant="fill"
          style={{ width: '100%' }}
          onClick={() => { setEditing(emptyEdit()); setSaveError(null); }}
        >
          + Создать поиск
        </NmButton>
      </div>

      {/* Ошибка */}
      {error && (
        <NmEmptyState
          icon={<AlertTriangle size={40} color="var(--nm-amber)" />}
          title="Ошибка"
          description={error}
        />
      )}

      {/* Загрузка */}
      {!error && searches === null && (
        <div
          style={{
            padding: '60px 0',
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--nm-ink-2)',
          }}
        >
          Загружаем…
        </div>
      )}

      {/* Пусто */}
      {!error && searches !== null && searches.length === 0 && (
        <NmEmptyState
          icon={<Search size={48} />}
          title="Нет сохранённых поисков"
          description="Создайте поиск, чтобы получать уведомления о подходящих лотах."
        />
      )}

      {/* Список */}
      {searches !== null && searches.length > 0 && (
        <div>
          {searches.map((s) => (
            <SavedSearchCard
              key={s.id}
              s={s}
              onToggle={() => handleToggle(s)}
              onEdit={() => openEdit(s)}
              onDelete={() => setConfirmDelete(s)}
            />
          ))}
        </div>
      )}

      {/* Форма создания/редактирования */}
      {editing !== null && (
        <Modal
          open
          header={
            <Modal.Header
              after={
                <NmButton variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  ✕
                </NmButton>
              }
            />
          }
          onOpenChange={(open) => { if (!open) setEditing(null); }}
        >
          <div style={{ padding: '0 16px 32px' }}>
            <h3
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: 'var(--nm-ink)',
                letterSpacing: '-0.2px',
                margin: '0 0 16px 0',
              }}
            >
              {editing.id === null ? 'Новый поиск' : 'Редактировать поиск'}
            </h3>

            {/* Название */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--nm-ink-2)',
                  marginBottom: 8,
                }}
              >
                Название{' '}
                <em style={{ fontStyle: 'normal', color: 'var(--nm-ink-3)', fontWeight: 500 }}>
                  · необязательно
                </em>
              </label>
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing((prev) => prev && ({ ...prev, name: e.target.value }))
                }
                placeholder="Например: Бьюти Instagram"
                style={inputStyle}
              />
            </div>

            {/* Категории */}
            <FormSection title="Категории">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORIES.map((c) => (
                  <SelectChip
                    key={c}
                    label={c}
                    selected={editing.categories.includes(c)}
                    onClick={() => toggleEditCategory(c)}
                  />
                ))}
              </div>
              <div
                style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 6 }}
              >
                {editing.categories.length > 0
                  ? `Выбрано: ${editing.categories.length}`
                  : 'Пусто = любая категория'}
              </div>
            </FormSection>

            {/* Площадки */}
            <FormSection title="Площадки">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PLATFORMS.map((p) => (
                  <SelectChip
                    key={p}
                    label={p}
                    selected={editing.platforms.includes(p)}
                    onClick={() => toggleEditPlatform(p)}
                  />
                ))}
              </div>
              <div
                style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 6 }}
              >
                {editing.platforms.length > 0
                  ? `Выбрано: ${editing.platforms.length}`
                  : 'Пусто = любая площадка'}
              </div>
            </FormSection>

            {/* Минимальный бюджет */}
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--nm-ink-2)',
                  marginBottom: 8,
                }}
              >
                Минимальный бюджет, ₸{' '}
                <em style={{ fontStyle: 'normal', color: 'var(--nm-ink-3)', fontWeight: 500 }}>
                  · необязательно
                </em>
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={editing.minBudget}
                onChange={(e) =>
                  setEditing((prev) => prev && ({ ...prev, minBudget: e.target.value }))
                }
                placeholder="например, 50000"
                style={inputStyle}
              />
            </div>

            {saveError && (
              <div
                style={{ color: 'var(--nm-red)', fontSize: 14, marginBottom: 12 }}
              >
                {saveError}
              </div>
            )}

            <NmButton
              variant="fill"
              style={{
                width: '100%',
                ...(saving ? { opacity: 0.6, pointerEvents: 'none' } : {}),
              }}
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </NmButton>
          </div>
        </Modal>
      )}

      {/* Подтверждение удаления */}
      {confirmDelete !== null && (
        <Modal
          open
          header={<Modal.Header />}
          onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        >
          <div style={{ padding: '0 20px 32px', textAlign: 'center' }}>
            <h3
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: 'var(--nm-ink)',
                letterSpacing: '-0.2px',
                margin: '0 0 8px 0',
              }}
            >
              Удалить поиск?
            </h3>
            <p style={{ color: 'var(--nm-ink-2)', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
              «{confirmDelete.name ?? 'Поиск'}» будет удалён безвозвратно.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <NmButton
                variant="ghost"
                style={{ flex: 1 }}
                onClick={() => setConfirmDelete(null)}
              >
                Отмена
              </NmButton>
              <NmButton
                variant="fill"
                style={{ flex: 1, background: 'var(--nm-red)', boxShadow: 'none' }}
                onClick={() => handleDelete(confirmDelete)}
              >
                Удалить
              </NmButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
