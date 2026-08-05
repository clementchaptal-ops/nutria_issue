import React from 'react'
import styles from '../pages/Dashboard.module.css'

/**
 * Configuration schema for an individual table column.
 * Allows type-safe mapping of keys, optional custom cell rendering,
 * text alignment controls, and sorting flags.
 */
export type TableColumn<T> = {
  key: Extract<keyof T, string> | string
  label: string
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  render?: (item: T) => React.ReactNode
}

/**
 * Represents the configuration state for sorting.
 * Tracks the target column key and the sorting order direction.
 */
type SortConfig = { key: string; direction: 'asc' | 'desc' }

/**
 * Props definition for the GenericTable component.
 */
type GenericTableProps<T> = {
  columns: TableColumn<T>[]
  data: T[]
  sortConfig: SortConfig
  onSort: (key: string) => void
  onRowClick: (item: T) => void
  rowKey: (item: T) => string | number
}

/**
 * A highly reusable, generic, and type-safe React table component.
 * Supports dynamic column definitions, interactive headers for sorting, and row click callbacks.
 */
function GenericTable<T>({ columns, data, sortConfig, onSort, onRowClick, rowKey }: GenericTableProps<T>) {
  // Determines the appropriate visual sort icon based on the current active configuration
  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return ' ↕'
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼'
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th 
                key={String(col.key)} 
                onClick={() => col.sortable !== false && onSort(String(col.key))}
                style={{ textAlign: col.align || 'left', cursor: col.sortable !== false ? 'pointer' : 'default' }}
              >
                {col.label} {col.sortable !== false && getSortIcon(String(col.key))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr 
              key={rowKey(item)} 
              onClick={() => onRowClick(item)}
              className={styles.tableRow}
            >
              {columns.map((col) => (
                <td key={String(col.key)} style={{ textAlign: col.align || 'left' }}>
                  {col.render ? col.render(item) : String((item as any)[col.key] || '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default GenericTable