import type { LotStatus } from '../../api';

// Инициалы для аватара-заглушки (имя компании).
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

// Бюджет в тенге: «250 000 ₸».
export function formatBudget(budget: number): string {
  return `${budget.toLocaleString('ru-RU')} ₸`;
}

// Дедлайн (ISO) → «16 июня 2026».
export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Короткий дедлайн для карточек → «25 июня».
export function formatDeadlineShort(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

// Человекочитаемый статус лота.
const STATUS_LABELS: Record<LotStatus, string> = {
  draft: 'Черновик',
  awaiting_payment: 'Ждёт оплаты',
  active: 'Активен',
  in_progress: 'В работе',
  awaiting_decision: 'Ожидание решения',
  awaiting_payout: 'Ожидает выплаты',
  completed: 'Завершён',
  cancelled: 'Отменён',
  disputed: 'Спор',
};

export function statusLabel(status: LotStatus): string {
  return STATUS_LABELS[status];
}