import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchAllIssues } from '../api/issues'
import styles from './Dashboard.module.css'

import StatCard from '../components/StatCard'
import SearchBar from '../components/SearchBar'
import GenericTable, { TableColumn } from '../components/GenericTable'

/**
 * Configuration options for sorting tabular issue data.
 */
type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
}

/**
 * Computes background colors, text colors, and display labels for group badges.
 *
 * @param groupId - The ID of the group, or null/undefined if none exists.
 * @returns An object containing the CSS background color, text color, and formatted text label.
 */
const getGroupBadgeStyle = (groupId: number | null | undefined) => {
  if (!groupId) return { background: 'transparent', color: '#a5adba', text: '-' };
  const colors = ['#0052cc', '#36b37e', '#ff991f', '#ff5630', '#6554c0', '#00b8d9', '#ff7452', '#2684ff'];
  const bgColor = colors[groupId % colors.length];
  return { background: bgColor, color: 'white', text: `G-${groupId}` };
}

/**
 * Main dashboard component displaying issue metrics, search/filtering options,
 * and a detailed interactive table.
 */
function Dashboard() {
  // Localization hook for multi-language UI support.
  const { t } = useTranslation()
  
  // Router hook for navigating to issue details or issue creation views.
  const navigate = useNavigate()

  // Manage filtering states dynamically via URL query parameters.
  const [searchParams, setSearchParams] = useSearchParams()

  // Component state for storing fetched issue records and tracking load status.
  const [issues, setIssues] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  // Retrieve searching constraints directly from URL search parameters.
  const searchQuery = searchParams.get('search') || ''
  const searchColumn = searchParams.get('column') || 'ALL'
  
  // Parse visible status filters from URL parameter, defaulting to 'IN PROGRESS'.
  const statusParam = searchParams.get('status')
  const activeStatuses = statusParam !== null 
    ? (statusParam ? statusParam.split(',') : []) 
    : ['IN PROGRESS'] 

  // Local state representing the current sorting configuration for the table.
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'id_issue', direction: 'desc' })

  /**
   * Updates or removes a query parameter in the current URL.
   *
   * @param key - The query parameter key to modify.
   * @param value - The value to associate with the key. If empty, the parameter is deleted.
   */
  const updateUrlParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    setSearchParams(newParams)
  }

  /**
   * Toggles a status filter on or off and updates the URL state.
   *
   * @param targetStatus - The issue status string to toggle in the active filter list.
   */
  const toggleStatusFilter = (targetStatus: string) => {
    let newStatuses = [...activeStatuses]
    if (activeStatuses.includes(targetStatus)) {
      newStatuses = newStatuses.filter(s => s !== targetStatus)
    } else {
      newStatuses.push(targetStatus)
    }
    updateUrlParam('status', newStatuses.join(','))
  }

  // Trigger API query to retrieve issues on mount.
  useEffect(() => {
    fetchAllIssues()
      .then((data) => {
        const issueList = Array.isArray(data) ? data : (data.data || []);
        setIssues(issueList);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(t('dashboard.error.network', 'Network error: {{message}}', { message: err.message }));
        setLoading(false);
      })
  }, [t])

  /**
   * Updates sorting state, alternating directions if the same key is clicked sequentially.
   *
   * @param key - The column key used for ordering.
   */
  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Calculate issue count totals for all statuses regardless of active UI filters.
  const preticketCount = issues.filter(i => i.status === 'PRETICKET').length
  const inProgressCount = issues.filter(i => i.status === 'IN PROGRESS').length
  const actKnowledgeCount = issues.filter(i => i.status === 'ACT KNOWLEDGE').length
  const closedCount = issues.filter(i => i.status === 'CLOSED').length

  // Filter issues based on active status filters and the current search term query.
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

  // Sort filtered issues dynamically. Supporting numeric ID, nested array max value (regroupements), and case-insensitive strings.
  filteredIssues.sort((a, b) => {
    const key = sortConfig.key
    let valA = a[key]
    let valB = b[key]

    if (key === 'id_issue') {
      return sortConfig.direction === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0)
    }

    if (key === 'regroupements') {
      const maxA = valA && valA.length > 0 ? Math.max(...valA) : 0;
      const maxB = valB && valB.length > 0 ? Math.max(...valB) : 0;
      return sortConfig.direction === 'asc' ? maxA - maxB : maxB - maxA;
    }

    valA = String(valA || '').toLowerCase()
    valB = String(valB || '').toLowerCase()
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  // Set configuration parameters for target search columns.
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

  // Setup the list columns schema and custom cell render functions for the GenericTable component.
  const tableColumns: TableColumn<any>[] = [
    { key: 'id_issue', label: t('dashboard.table.id', 'ID'), render: (item) => <span className={styles.tdId}>#{item.id_issue}</span> },
    { 
      key: 'regroupements', 
      label: t('dashboard.table.group', 'Group'), 
      align: 'center',
      render: (item) => {
        const groups: number[] = item.regroupements || [];
        if (groups.length === 0) return <span style={{ color: '#a5adba' }}>-</span>;

        return (
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {groups.map((gId) => {
              const groupStyle = getGroupBadgeStyle(gId);
              return (
                <span 
                  key={gId} 
                  style={{ 
                    background: groupStyle.background, 
                    color: 'white', 
                    padding: '2px 6px', 
                    borderRadius: '8px', 
                    fontSize: '10px', 
                    fontWeight: 'bold' 
                  }}
                >
                  G-{gId}
                </span>
              );
            })}
          </div>
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

  // Conditional loading state render.
  if (loading) {
    return <p style={{ padding: '40px', textAlign: 'center' }}>{t('dashboard.loading', 'Loading dashboard data...')}</p>
  }

  return (
    <div className={styles.container}>
      {/* Header element highlighting the view title and the count of matched/visible issues */}
      <div className={styles.header}>
        <h1 className={styles.title}>{t('dashboard.title', 'Issues Dashboard')}</h1>
        <span className={styles.ticketCount}>
          {filteredIssues.length} {t('dashboard.visible', 'visible(s)')}
        </span>
      </div>

      {/* Numerical summary metrics widgets linking to specific status toggle logic */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <StatCard label={t('dashboard.status.preticket', 'Pretickets')} count={preticketCount} color="#ffab00" isActive={activeStatuses.includes('PRETICKET')} onClick={() => toggleStatusFilter('PRETICKET')} />
        <StatCard label={t('dashboard.status.in_progress', 'In Progress')} count={inProgressCount} color="#0052cc" isActive={activeStatuses.includes('IN PROGRESS')} onClick={() => toggleStatusFilter('IN PROGRESS')} />
        <StatCard label={t('dashboard.status.act_knowledge', 'Act Knowledge')} count={actKnowledgeCount} color="#36b37e" isActive={activeStatuses.includes('ACT KNOWLEDGE')} onClick={() => toggleStatusFilter('ACT KNOWLEDGE')} />
        <StatCard label={t('dashboard.status.closed', 'Closed')} count={closedCount} color="#42526e" isActive={activeStatuses.includes('CLOSED')} onClick={() => toggleStatusFilter('CLOSED')} />
      </div>

      {/* Action panel with text filter fields and issue creator initialization button */}
      <div className={styles.actionBar}>
        <div className={styles.searchWrapper}>
          <SearchBar 
            columns={searchColumns} 
            searchColumn={searchColumn} 
            onColumnChange={(val) => updateUrlParam('column', val)}
            searchQuery={searchQuery}
            onSearchChange={(val) => updateUrlParam('search', val)}
            placeholder={t('dashboard.search.placeholder', 'Search...')}
          />
        </div>

        <button className={styles.createBtn} onClick={() => navigate('/?new=true')}>
          ➕ {t('dashboard.create_button', 'Create an Issue')}
        </button>
      </div>

      {/* Conditional list state render fallback if filtering returns empty collections */}
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