import { CATEGORIES } from '@needmarket/shared';
import { MultiSelectField } from './MultiSelectField';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function MultiCategorySelect({ value, onChange }: Props) {
  return <MultiSelectField label="Категории" options={CATEGORIES} value={value} onChange={onChange} />;
}
