import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchAllRegroupements } from '../api/regroupements'
import styles from './RegroupementList.module.css'

import StatCard from '../components/StatCard'
import SearchBar from '../components/SearchBar'
import GenericTable, { TableColumn } from '../components/GenericTable'

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
}

function RegroupementList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [regroupements, setRegroupements] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const searchQuery = searchParams.get('search') || ''
  const searchColumn = searchParams.get('column') || 'ALL'
  
  // Status filter state
  const statusParam = searchParams.get('status')
  const activeStatuses = statusParam !== null ? (statusParam ? statusParam.split(',') : []) : ['OPEN']
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'id_regroupment', direction: 'desc' })

  const updateUrlParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    setSearchParams(newParams)
  }

  const toggleStatusFilter = (targetStatus: string) => {
    let newStatuses = [...activeStatuses]
    if (activeStatuses.includes(targetStatus)) {
      newStatuses = newStatuses.filter(s => s !== targetStatus)
    } else {
      newStatuses.push(targetStatus)
    }
    updateUrlParam('status', newStatuses.join(','))
  }

  useEffect(() => {
    fetchAllRegroupements()
      .then((response) => {
        setRegroupements(response.data || [])
        setLoading(false)
      })
      .catch((err) => {
        toast.error(t('regroupements.error.network', 'Network error: {{message}}', { message: err.message }))
        setLoading(false)
      })
  }, [t])

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Counters for StatCards
  const openCount = regroupements.filter(r => r.status === 'OPEN').length
  const closedCount = regroupements.filter(r => r.status === 'CLOSED').length

  // Filtering
  let filteredList = regroupements.filter((grp) => {
    if (!activeStatuses.includes(grp.status)) return false // Filter by status
    if (!searchQuery) return true
    
    const query = searchQuery.toLowerCase()
    if (searchColumn === 'ALL') {
      return Object.values(grp).some(val => String(val).toLowerCase().includes(query))
    } else {
      return String(grp[searchColumn] || '').toLowerCase().includes(query)
    }
  })

  // Sorting
  filteredList.sort((a, b) => {
    const key = sortConfig.key
    let valA = a[key]
    let valB = b[key]
    if (key === 'id_regroupment' || key === 'ticket_count') {
      return sortConfig.direction === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0)
    }
    valA = String(valA || '').toLowerCase()
    valB = String(valB || '').toLowerCase()
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  const searchColumns = [
    { value: 'ALL', label: t('dashboard.search.all_columns', 'All Columns') },
    { value: 'id_regroupment', label: t('regroupements.table.id', 'ID') },
    { value: 'title', label: t('dashboard.search.title', 'Title') },
    { value: 'ssp_ticket', label: t('regroupements.table.ssp', 'SSP Ticket') },
    { value: 'created_by', label: t('regroupements.table.creator', 'Creator') }
  ]

  const tableColumns: TableColumn<any>[] = [
    { 
      key: 'id_regroupment', 
      label: t('regroupements.table.id', 'ID'),
      render: (item) => <span style={{ fontWeight: 'bold', color: '#0052cc' }}>#{item.id_regroupment}</span>
    },
    { key: 'title', label: t('dashboard.search.title', 'Title'), render: (item) => <strong>{item.title}</strong> },
    { 
      key: 'status', 
      label: t('dashboard.search.status', 'Status'),
      render: (item) => (
        <span style={{ 
          background: item.status === 'CLOSED' ? '#dfe1e6' : '#deebff', 
          color: item.status === 'CLOSED' ? '#42526e' : '#0052cc', 
          padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' 
        }}>
          {item.status}
        </span>
      )
    },
    { 
      key: 'ssp_ticket', 
      label: t('regroupements.table.ssp', 'SSP Ticket'),
      render: (item) => item.ssp_ticket ? (
        <span style={{ background: '#e3fcef', color: '#006644', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
          {item.ssp_ticket}
        </span>
      ) : <span style={{ color: '#a5adba' }}>-</span>
    },
    { key: 'created_by', label: t('regroupements.table.creator', 'Created By') },
    { key: 'created_on', label: t('dashboard.table.date', 'Date') },
    { key: 'ticket_count', label: t('regroupements.table.issues', 'Issues') }
  ]

  if (loading) return <p style={{ padding: '40px', textAlign: 'center' }}>{t('common.loading', 'Loading data...')}</p>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('regroupements.title', 'Regroupements Dashboard')}</h1>
        <span className={styles.count}>
          {filteredList.length} {t('dashboard.visible', 'visible(s)')}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <StatCard label={t('regroupements.status.open', 'Open')} count={openCount} color="#0052cc" isActive={activeStatuses.includes('OPEN')} onClick={() => toggleStatusFilter('OPEN')} />
        <StatCard label={t('regroupements.status.closed', 'Closed')} count={closedCount} color="#42526e" isActive={activeStatuses.includes('CLOSED')} onClick={() => toggleStatusFilter('CLOSED')} />
      </div>

      <div className={styles.actionBar}>
        <SearchBar 
          columns={searchColumns} 
          searchColumn={searchColumn} 
          onColumnChange={(val) => updateUrlParam('column', val)}
          searchQuery={searchQuery}
          onSearchChange={(val) => updateUrlParam('search', val)}
          placeholder={t('dashboard.search.placeholder', 'Search...')}
        />

        <button className={styles.createBtn} onClick={() => navigate('/regroupements/new')}>
          📁 {t('regroupements.create_button', 'Create Regroupement')}
        </button>
      </div>

      {filteredList.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>{t('dashboard.empty_state', 'No matching results found')}</h3>
        </div>
      ) : (
        <GenericTable 
          columns={tableColumns} 
          data={filteredList} 
          sortConfig={sortConfig} 
          onSort={requestSort} 
          onRowClick={(item) => navigate(`/regroupements/${item.id_regroupment}`)} 
          rowKey={(item) => item.id_regroupment}
        />
      )}
    </div>
  )
}

export default RegroupementList