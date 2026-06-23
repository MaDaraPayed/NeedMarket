import { useEffect, useState } from 'react';
import { Section, Cell, Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import { AlertTriangle } from 'lucide-react';
import { CATEGORIES, PLATFORMS } from '@needmarket/shared';
import { fetchLots, type Lot } from '../../api';
import { SelectChip } from '../../components/SelectChip';
import { LotCard } from './LotCard';

export function BloggerHome({
  token,
  onOpenLot,
}: {
  token: string;
  onOpenLot: (id: string) => void;
}) {
  // Мультивыбор категорий: пустой массив = «все». Платформа — одиночный фильтр.
  const [categories, setCategories] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string | null>(null);
  const [hideResponded, setHideResponded] = useState(false);
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(c: string) {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  useEffect(() => {
    let cancelled = false;
    setLots(null);
    setError(null);
    fetchLots(token, {
      categories: categories.length > 0 ? categories : undefined,
      platform: platform ?? undefined,
      hideResponded: hideResponded || undefined,
    })
      .then((l) => !cancelled && setLots(l))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [token, categories, platform, hideResponded]);

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      <Section header="Категории" footer={categories.length > 0 ? `Выбрано: ${categories.length}` : undefined}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {CATEGORIES.map((c) => (
            <SelectChip
              key={c}
              label={c}
              selected={categories.includes(c)}
              onClick={() => toggleCategory(c)}
            />
          ))}
        </div>
      </Section>

      <Section header="Площадка">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {PLATFORMS.map((p) => (
            <SelectChip
              key={p}
              label={p}
              selected={platform === p}
              onClick={() => setPlatform((prev) => (prev === p ? null : p))}
            />
          ))}
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
