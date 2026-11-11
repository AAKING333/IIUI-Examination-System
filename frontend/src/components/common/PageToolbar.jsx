import React from 'react';
import { Search, RotateCcw } from 'lucide-react';
import Button from './Button.jsx';

/**
 * Standardized Page Toolbar Component
 * Supports search, dropdown filters, active filter reset, and action buttons.
 */
export default function PageToolbar({
  searchTerm = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  onResetFilters,
  hasActiveFilters = false,
  actions,
  children,
}) {
  return (
    <div
      className="toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.85rem',
        marginBottom: '1.25rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', flex: 1, minWidth: '280px' }}>
        {onSearchChange && (
          <div
            className="toolbar__search"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 0.85rem',
              background: 'var(--itms-surface, #ffffff)',
              border: '1px solid var(--itms-border-strong, #cbd5d1)',
              borderRadius: 'var(--itms-radius-sm, 6px)',
              minWidth: '240px',
              maxWidth: '360px',
              flex: 1,
            }}
          >
            <Search size={15} style={{ color: 'var(--itms-text-muted, #64748b)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '0.82rem',
                fontFamily: 'inherit',
                width: '100%',
                color: 'var(--itms-text, #0f172a)',
              }}
            />
          </div>
        )}

        {filters.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {f.label && (
              <label style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted, #64748b)', fontWeight: 500 }}>
                {f.label}:
              </label>
            )}
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--itms-radius-sm, 6px)',
                border: '1px solid var(--itms-border-strong, #cbd5d1)',
                background: 'var(--itms-surface, #ffffff)',
                fontSize: '0.82rem',
                color: 'var(--itms-text, #0f172a)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {hasActiveFilters && onResetFilters && (
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            onClick={onResetFilters}
            title="Reset filters"
            style={{ color: 'var(--itms-text-muted, #64748b)' }}
          >
            Reset
          </Button>
        )}

        {children}
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}

