import { useEffect, useState } from 'react';
import { Section, Cell, Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import { AlertTriangle } from 'lucide-react';
import { PLATFORMS } from '@needmarket/shared';
import { fetchLots, type ApiUser, type BloggerProfile, type Lot } from '../../api';
import { SelectChip } from '../../components/SelectChip';
import { MultiCategorySelect } from '../../components/MultiCategorySelect';
import { MultiSelectField } from '../../components/MultiSelectField';
import { computeProfileCompletion } from '../BloggerEditProfile';
import { LotCard } from './LotCard';

export function BloggerHome({
  token,
  user,
  onOpenLot,
  onEditProfile,
}: {
  token: string;
  user: ApiUser;
  onOpenLot: (id: string) => void;
  onEditProfile: () => void;
}) {
  const profile = user.profile as BloggerProfile | null;
  const completion = profile ? computeProfileCompletion(profile) : 0;
  const [categories, setCategories] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [hideResponded, setHideResponded] = useState(false);
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLots(null);
    setError(null);
    fetchLots(token, {
      categories: categories.length > 0 ? categories : undefined,
      // Бэк поддерживает только один platform-фильтр; при выборе нескольких OR-семантика
      // недоступна серверно — показываем все (пользователь видит чипы выбранных).
      platform: platforms.length === 1 ? platforms[0] : undefined,
      hideResponded: hideResponded || undefined,
    })
      .then((l) => !cancelled && setLots(l))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [token, categories, platforms, hideResponded]);

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      {/* Баннер заполненности — только если профиль неполный */}
      {completion < 80 && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            background: 'var(--nm-blue-soft)',
            border: '1px solid var(--nm-blue-line)',
            borderRadius: 'var(--nm-r-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--nm-blue-strong)' }}>
              Профиль заполнен на {completion}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 2 }}>
              Больше данных — больше шансов получить предложения
            </div>
          </div>
          <button
            type="button"
            onClick={onEditProfile}
            style={{
              flexShrink: 0,
              appearance: 'none',
              background: 'var(--nm-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--nm-r-pill)',
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Заполнить
          </button>
        </div>
      )}

      <Section header="Категории">
        <div style={{ padding: '4px 12px 12px' }}>
          <MultiCategorySelect value={categories} onChange={setCategories} />
        </div>
      </Section>

      <Section header="Площадки">
        <div style={{ padding: '4px 12px 12px' }}>
          <MultiSelectField label="Площадки" options={PLATFORMS} value={platforms} onChange={setPlatforms} />
        </div>
      </Section>

      <div style={{ padding: '4px 16px 8px' }}>
        <SelectChip
          label="Скрыть, на которые откликнулся"
          selected={hideResponded}
          onClick={() => setHideResponded((v) => !v)}
        />
      </div>

      {error && (
        <Placeholder header="Не удалось загрузить" description={error}>
          <AlertTriangle size={48} color="var(--nm-amber)" />
        </Placeholder>
      )}

      {!error && lots === null && (
        <Placeholder description="Загружаем ленту...">
          <Spinner size="l" />
        </Placeholder>
      )}

      {!error && lots !== null && lots.length === 0 && (
        <Section>
          <Cell multiline subtitle="Попробуйте изменить фильтры или загляните позже.">
            Подходящих проектов пока нет
          </Cell>
        </Section>
      )}

      {!error && lots?.map((lot) => (
        <LotCard key={lot.id} lot={lot} variant="blogger" onClick={() => onOpenLot(lot.id)} />
      ))}
    </div>
  );
}
