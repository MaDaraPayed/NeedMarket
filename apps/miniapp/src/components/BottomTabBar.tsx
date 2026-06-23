import type { ReactNode } from 'react';

interface TabItem {
  key: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  badge?: number;
  dot?: boolean;
}

interface FabItem {
  key: string;
  label: string;
  icon: ReactNode;
}

interface BottomTabBarProps {
  items: TabItem[];
  onTabChange: (key: string) => void;
  fab?: FabItem;
}

export function BottomTabBar({ items, onTabChange, fab }: BottomTabBarProps) {
  const left = fab ? items.slice(0, 1) : items;
  const right = fab ? items.slice(1) : [];

  return (
    <div
      style={{
        background: 'var(--nm-surface)',
        borderTop: '1px solid var(--nm-line)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 9, paddingBottom: 11 }}>
        {left.map((item) => <TabBtn key={item.key} item={item} onTabChange={onTabChange} />)}
        {fab && <FabSlot fab={fab} onTabChange={onTabChange} />}
        {right.map((item) => <TabBtn key={item.key} item={item} onTabChange={onTabChange} />)}
      </div>
    </div>
  );
}

function TabBtn({ item, onTabChange }: { item: TabItem; onTabChange: (k: string) => void }) {
  return (
    <button
      onClick={() => onTabChange(item.key)}
      style={{
        flex: 1,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        color: item.active ? 'var(--nm-blue)' : 'var(--nm-ink-3)',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative' }}>
        {item.icon}
        {item.badge != null && item.badge > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: 'var(--nm-red)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
        {item.dot && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--nm-blue)',
              border: '1.5px solid var(--nm-surface)',
            }}
          />
        )}
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1 }}>{item.label}</span>
    </button>
  );
}

function FabSlot({ fab, onTabChange }: { fab: FabItem; onTabChange: (k: string) => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        position: 'relative',
      }}
    >
      <button
        onClick={() => onTabChange(fab.key)}
        style={{
          position: 'absolute',
          top: -30,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--nm-grad)',
          border: '4px solid var(--nm-surface)',
          boxShadow: 'var(--nm-sh-fab)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {fab.icon}
      </button>
      {/* Spacer preserves slot height so label aligns with tab labels */}
      <div style={{ width: 24, height: 24 }} />
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--nm-ink-3)', lineHeight: 1 }}>
        {fab.label}
      </span>
    </div>
  );
}
