import React from 'react'
import styles from './SearchBar.module.css'

/**
 * Represents an option in the search column selection dropdown.
 */
type ColumnOption = {
  value: string;
  label: string;
}

/**
 * Properties for the SearchBar component.
 */
type SearchBarProps = {
  /** Array of column options available for selection. */
  columns: ColumnOption[]
  /** The value of the currently selected column. */
  searchColumn: string
  /** Event handler triggered when the selected column changes. */
  onColumnChange: (val: string) => void
  /** The current text value of the search query. */
  searchQuery: string
  /** Event handler triggered when the search query text changes. */
  onSearchChange: (val: string) => void
  /** Placeholder text for the search input field. */
  placeholder: string
}

/**
 * A search bar component containing a column selection dropdown and a text query input.
 * Allows users to filter data dynamically by choosing a target field and typing a query.
 */
const SearchBar: React.FC<SearchBarProps> = ({ columns, searchColumn, onColumnChange, searchQuery, onSearchChange, placeholder }) => {
  return (
    <div className={styles.searchBar}>
      {/* Column selector dropdown */}
      <select 
        value={searchColumn} 
        onChange={(e) => onColumnChange(e.target.value)} 
        className={styles.select}
      >
        {columns.map(col => (
          <option key={col.value} value={col.value}>{col.label}</option>
        ))}
      </select>

      {/* Search text input field */}
      <input 
        type="text" 
        placeholder={placeholder}
        value={searchQuery} 
        onChange={(e) => onSearchChange(e.target.value)} 
        className={styles.inputSearch}
      />
    </div>
  )
}

export default SearchBar