import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

/**
 * Standardized Data Table Component
 * - Sticky header support
 * - Clean row height and hover state
 * - Clear typography hierarchy: Bold reserved for primary column; regular weight for secondary
 * - Empty state & loading skeleton
 * - Row selection support
 */
export default function Table({
  columns = [],
  data = [],
  keyField = 'id',
  loading = false,
  emptyMessage = 'No records found.',
  stickyHeader = false,
  sortField,
  sortDirection,
  onSort,
  selectable = false,
  selectedIds = [],
  onSelectRow,
  onSelectAll,
  rowClassName,
}) {
  const isAllSelected = data.length > 0 && selectedIds.length === data.length;
  const isPartiallySelected = selectedIds.length > 0 && selectedIds.length < data.length;

  return (
    <div
      style={{
        width: '100%',
        overflowX: 'auto',
        background: 'var(--itms-surface, #ffffff)',
        borderRadius: 'var(--itms-radius-md, 10px)',
        border: '1px solid var(--itms-border, #e3e8e6)',
        boxShadow: 'var(--itms-shadow-sm, 0 1px 3px rgba(16, 31, 61, 0.08))',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '0.84rem',
        }}
      >
        <thead>
          <tr
            style={{
              background: 'var(--itms-surface-muted, #f8faf9)',
              borderBottom: '1px solid var(--itms-border-strong, #cbd5d1)',
              position: stickyHeader ? 'sticky' : 'static',
              top: 0,
              zIndex: 2,
            }}
          >
            {selectable && (
              <th style={{ width: '40px', padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isPartiallySelected;
                  }}
                  onChange={onSelectAll}
                  aria-label="Select all rows"
                />
              </th>
            )}
            {columns.map((col) => {
              const isSorted = sortField === col.key;
              return (
                <th
                  key={col.key}
                  style={{
                    padding: '0.7rem 0.85rem',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    color: 'var(--iiui-navy, #192f59)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    width: col.width,
                    textAlign: col.align || 'left',
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => col.sortable && onSort && onSort(col.key)}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start',
                      width: '100%',
                    }}
                  >
                    <span>{col.label}</span>
                    {col.sortable && (
                      <span style={{ color: isSorted ? 'var(--iiui-green, #1a5f2a)' : '#94a3b8' }}>
                        {isSorted ? (
                          sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--itms-text-muted, #64748b)' }}
              >
                <div style={{ display: 'inline-block', width: '2rem', height: '2rem', border: '3px solid #cbd5e1', borderTopColor: 'var(--iiui-green, #1a5f2a)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Loading records...</div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                style={{
                  padding: '3rem 1.5rem',
                  textAlign: 'center',
                  color: 'var(--itms-text-muted, #64748b)',
                  background: 'var(--itms-surface, #ffffff)',
                }}
              >
                <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{emptyMessage}</div>
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => {
              const rowId = row[keyField] ?? rowIdx;
              const isSelected = selectedIds.includes(rowId);
              const customClass = rowClassName ? rowClassName(row, rowIdx) : '';

              return (
                <tr
                  key={rowId}
                  className={customClass}
                  style={{
                    borderBottom: '1px solid var(--itms-border, #e3e8e6)',
                    background: isSelected ? 'var(--iiui-green-50, #eff6f1)' : rowIdx % 2 === 0 ? 'var(--itms-surface, #ffffff)' : 'var(--itms-surface-muted, #fafbfc)',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--iiui-green-50, #f0f7f2)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = rowIdx % 2 === 0 ? 'var(--itms-surface, #ffffff)' : 'var(--itms-surface-muted, #fafbfc)';
                  }}
                >
                  {selectable && (
                    <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelectRow && onSelectRow(rowId)}
                        aria-label={`Select row ${rowId}`}
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => {
                    const val = row[col.key];
                    const isPrimary = col.isPrimary || colIdx === 0;

                    return (
                      <td
                        key={col.key}
                        style={{
                          padding: '0.55rem 0.85rem',
                          textAlign: col.align || 'left',
                          color: isPrimary ? 'var(--iiui-navy, #192f59)' : 'var(--itms-text-secondary, #334155)',
                          fontWeight: isPrimary ? 600 : 400,
                          fontSize: '0.83rem',
                          verticalAlign: 'middle',
                        }}
                      >
                        {col.render ? col.render(val, row, rowIdx) : (val !== null && val !== undefined ? String(val) : '—')}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

