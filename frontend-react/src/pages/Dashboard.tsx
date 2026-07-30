import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchAllIssues } from '../api/issues'
import styles from './Dashboard.module.css'

import StatCard from '../components/StatCard'
import SearchBar from '../components/SearchBar'
import GenericTable, { TableColumn } from '../components/GenericTable'

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
}

const getGroupBadgeStyle = (groupId: number | null | undefined) => {
  if (!groupId) return { background: 'transparent', color: '#a5adba', text: '-' };
  const colors = ['#0052cc', '#36b37e', '#ff991f', '#ff5630', '#6554c0', '#00b8d9', '#ff7452', '#2684ff'];
  const bgColor = colors[groupId % colors.length];
  return { background: bgColor, color: 'white', text: `G-${groupId}` };
}

function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()

  const [issues, setIssues] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const searchQuery = searchParams.get('search') || ''
  const searchColumn = searchParams.get('column') || 'ALL'
  
  const statusParam = searchParams.get('status')
  const activeStatuses = statusParam !== null 
    ? (statusParam ? statusParam.split(',') : []) 
    : ['IN PROGRESS'] // 🚨 Affichage par défaut sur IN PROGRESS

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'id_issue', direction: 'desc' })

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
    fetchAllIssues()
      .then((response) => {
        const issueList = response.data || [];
        setIssues(issueList);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(t('dashboard.error.network', 'Network error: {{message}}', { message: err.message }));
        setLoading(false);
      })
  }, [t])

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // 🚨 Les 4 compteurs restaurés
  const preticketCount = issues.filter(i => i.status === 'PRETICKET').length
  const inProgressCount = issues.filter(i => i.status === 'IN PROGRESS').length
  const actKnowledgeCount = issues.filter(i => i.status === 'ACT KNOWLEDGE').length
  const closedCount = issues.filter(i => i.status === 'CLOSED').length

  let filteredIssues = issues.filter((issue) => {
    const status = issue.status ? issue.status.toUpperCase() : ''
    if (!activeStatuses.includes(status)) return false

    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    
    if (searchColumn === 'ALL') {
      return Object.values(issue).some(val => String(val).toLowerCase().includes(query))
    } else {
      return String(issue[searchColumn] || '').toLowerCase().includes(query)
    }
  })

  filteredIssues.sort((a, b) => {
    const key = sortConfig.key
    let valA = a[key]
    let valB = b[key]

    if (key === 'id_issue' || key === 'id_regroupment') {
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
    { value: 'id_issue', label: t('dashboard.search.id', 'ID') },
    { value: 'title', label: t('dashboard.search.title', 'Title') },
    { value: 'status', label: t('dashboard.search.status', 'Status') },
    { value: 'issue_type', label: t('dashboard.search.issue_type', 'Issue Type') },
    { value: 'user_name', label: t('dashboard.search.username', 'User Name') },
    { value: 'full_name', label: t('dashboard.search.fullname', 'Full Name') },
    { value: 'criticity', label: t('dashboard.search.criticity', 'Criticity') },
    { value: 'environment', label: t('dashboard.search.env', 'Environment') },
    { value: 'country', label: t('dashboard.search.location', 'Location') }
  ]

  const tableColumns: TableColumn<any>[] = [
    { key: 'id_issue', label: t('dashboard.table.id', 'ID'), render: (item) => <span className={styles.tdId}>#{item.id_issue}</span> },
    { 
      key: 'id_regroupment', 
      label: t('dashboard.table.group', 'Group'), 
      align: 'center',
      render: (item) => {
        const groupStyle = getGroupBadgeStyle(item.id_regroupment);
        return (
          <span style={{ background: groupStyle.background, color: groupStyle.color, padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', display: 'inline-block', minWidth: '40px' }}>
            {groupStyle.text}
          </span>
        )
      }
    },
    { key: 'title', label: t('dashboard.table.title', 'Title'), render: (item) => <span className={styles.tdTitle}>{item.title}</span> },
    { 
      key: 'status', 
      label: t('dashboard.table.status', 'Status'),
      render: (item) => <span className={`${styles.badge} ${styles['status_' + item.status.replace(' ', '_')] || styles.badgeDefault}`}>{item.status}</span>
    },
    { 
      key: 'issue_type', 
      label: t('dashboard.table.type', 'Type'),
      render: (item) => <span className={`${styles.badge} ${styles['type_' + item.issue_type] || styles.badgeDefault}`}>{item.issue_type}</span>
    },
    { key: 'user_name', label: t('dashboard.table.username', 'Username') },
    { key: 'full_name', label: t('dashboard.table.fullname', 'Full Name') },
    { 
      key: 'criticity', 
      label: t('dashboard.table.criticity', 'Criticity'),
      render: (item) => <span className={`${styles.badge} ${styles['criticity_' + item.criticity] || styles.criticity_DEFAULT}`}>{item.criticity}</span>
    },
    { key: 'environment', label: t('dashboard.table.env', 'Environment'), render: (item) => item.env || item.environment },
    { key: 'country', label: t('dashboard.table.location', 'Location'), render: (item) => <span className={styles.tdLocation}>{item.country}</span> },
    { key: 'creation_date', label: t('dashboard.table.date', 'Date'), render: (item) => <span className={styles.tdDate}>{item.creation_date}</span> }
  ]

  if (loading) {
    return <p style={{ padding: '40px', textAlign: 'center' }}>{t('dashboard.loading', 'Loading dashboard data...')}</p>
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('dashboard.title', 'Issues Dashboard')}</h1>
        <span className={styles.ticketCount}>
          {filteredIssues.length} {t('dashboard.visible', 'visible(s)')}
        </span>
      </div>

      {/* 🚨 Les 4 StatCards sont bien là */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <StatCard label={t('dashboard.status.preticket', 'Pretickets')} count={preticketCount} color="#ffab00" isActive={activeStatuses.includes('PRETICKET')} onClick={() => toggleStatusFilter('PRETICKET')} />
        <StatCard label={t('dashboard.status.in_progress', 'In Progress')} count={inProgressCount} color="#0052cc" isActive={activeStatuses.includes('IN PROGRESS')} onClick={() => toggleStatusFilter('IN PROGRESS')} />
        <StatCard label={t('dashboard.status.act_knowledge', 'Act Knowledge')} count={actKnowledgeCount} color="#36b37e" isActive={activeStatuses.includes('ACT KNOWLEDGE')} onClick={() => toggleStatusFilter('ACT KNOWLEDGE')} />
        <StatCard label={t('dashboard.status.closed', 'Closed')} count={closedCount} color="#42526e" isActive={activeStatuses.includes('CLOSED')} onClick={() => toggleStatusFilter('CLOSED')} />
      </div>

      <div className={styles.actionBar} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SearchBar 
          columns={searchColumns} 
          searchColumn={searchColumn} 
          onColumnChange={(val) => updateUrlParam('column', val)}
          searchQuery={searchQuery}
          onSearchChange={(val) => updateUrlParam('search', val)}
          placeholder={t('dashboard.search.placeholder', 'Search...')}
        />

        <button className={styles.createBtn} onClick={() => navigate('/?new=true')}>
          ➕ {t('dashboard.create_button', 'Create an Issue')}
        </button>
      </div>

      {filteredIssues.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>{t('dashboard.empty_state', 'No matching issues found')}</h3>
        </div>
      ) : (
        <GenericTable 
          columns={tableColumns} 
          data={filteredIssues} 
          sortConfig={sortConfig} 
          onSort={requestSort} 
          onRowClick={(item) => navigate(`/?id=${item.id_issue}`)} 
          rowKey={(item) => item.id_issue}
        />
      )}
    </div>
  )
}

export default Dashboard