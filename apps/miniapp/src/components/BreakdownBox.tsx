interface BreakdownRow {
  label: string;
  value: string;
}

interface BreakdownBoxProps {
  rows: BreakdownRow[];
  total: BreakdownRow;
}

export function BreakdownBox({ rows, total }: BreakdownBoxProps) {
  return (
    <div
      style={{
        background: 'var(--nm-surface-2)',
        borderRadius: 'var(--nm-r-field)',
        padding: '11px 13px',
      }}
    >
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          <span style={{ color: 'var(--nm-ink-2)' }}>{row.label}</span>
          <span style={{ fontWeight: 600, color: 'var(--nm-ink)' }}>{row.value}</span>
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--nm-line)',
          paddingTop: 8,
          fontSize: 13,
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--nm-ink)' }}>{total.label}</span>
        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--nm-blue-strong)' }}>{total.value}</span>
      </div>
    </div>
  );
}
