import React from 'react'
import styles from '../pages/Dashboard.module.css'

type ColumnOption = { value: string; label: string }

type SearchBarProps = {
  columns: ColumnOption[]
  searchColumn: string
  onColumnChange: (val: string) => void
  searchQuery: string
  onSearchChange: (val: string) => void
  placeholder: string
}

const SearchBar: React.FC<SearchBarProps> = ({ columns, searchColumn, onColumnChange, searchQuery, onSearchChange, placeholder }) => {
  return (
    <div className={styles.searchBar}>
      <select 
        value={searchColumn} 
        onChange={(e) => onColumnChange(e.target.value)} 
        className={styles.select}
      >
        {columns.map(col => (
          <option key={col.value} value={col.value}>{col.label}</option>
        ))}
      </select>

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