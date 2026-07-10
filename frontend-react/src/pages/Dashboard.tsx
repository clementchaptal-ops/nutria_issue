import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import { fetchAllIssues } from '../api/issues'
import styles from './Dashboard.module.css'

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
}

function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()

  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const searchQuery = searchParams.get('search') || ''
  const searchColumn = searchParams.get('column') || 'ALL'
  
  const statusParam = searchParams.get('status')
  const activeStatuses = statusParam !== null 
    ? (statusParam ? statusParam.split(',') : []) 
    : ['IN PROGRESS']

  const showPreticket = activeStatuses.includes('PRETICKET')
  const showInProgress = activeStatuses.includes('IN PROGRESS') 
  const showResolved = activeStatuses.includes('RESOLVED')
  const showClosed = activeStatuses.includes('CLOSED')

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

  const toggleStatusFilter = (targetStatus: string, isChecked: boolean) => {
    let newStatuses = [...activeStatuses]
    if (isChecked) {
      newStatuses.push(targetStatus)
    } else {
      newStatuses = newStatuses.filter(s => s !== targetStatus)
    }
    updateUrlParam('status', newStatuses.join(','))
  }

  useEffect(() => {
    fetchAllIssues()
      .then((response) => {
        // ✅ CORRECTION ICI : On extrait la clé 'data' renvoyée par GCP
        const listeTickets = response.data || [];
        setTickets(listeTickets);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      })
  }, [])

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return ' ↕'
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼'
  }

  const preticketCount = tickets.filter(t => t.status === 'PRETICKET').length
  const inProgressCount = tickets.filter(t => t.status === 'IN PROGRESS').length
  const resolvedCount = tickets.filter(t => t.status === 'RESOLVED').length
  const closedCount = tickets.filter(t => t.status === 'CLOSED').length

  let filteredTickets = tickets.filter((ticket) => {
    const status = ticket.status ? ticket.status.toUpperCase() : ''

    if (!activeStatuses.includes(status)) {
        return false
    }

    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    
    if (searchColumn === 'ALL') {
      return Object.values(ticket).some(val => 
        String(val).toLowerCase().includes(query)
      )
    } else {
      const value = ticket[searchColumn]
      return String(value || '').toLowerCase().includes(query)
    }
  })

  filteredTickets.sort((a, b) => {
    const key = sortConfig.key
    let valA = a[key]
    let valB = b[key]

    if (key === 'id_issue') {
      return sortConfig.direction === 'asc' ? valA - valB : valB - valA
    }

    valA = String(valA || '').toLowerCase()
    valB = String(valB || '').toLowerCase()

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  // 🚨 CORRECTION URL ICI
  const handleRowClick = (id: number) => {
    navigate(`/?id=${id}`) 
  }

  if (loading) {
    return <p style={{ padding: '40px', textAlign: 'center' }}>{t('dashboard.loading', 'Loading dashboard data...')}</p>
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('dashboard.title', 'Tickets Dashboard')}</h1>
        <span className={styles.ticketCount}>
          {filteredTickets.length} {t('dashboard.visible', 'visible(s)')}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        
        <div onClick={() => toggleStatusFilter('PRETICKET', !showPreticket)} style={{ flex: 1, padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #dfe1e6', cursor: 'pointer', textAlign: 'center', boxShadow: showPreticket ? '0 0 0 2px #ffab00' : 'none' }}>
          <div style={{ fontSize: '12px', color: '#7a869a' }}>Pretickets</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffab00' }}>{preticketCount}</div>
        </div>

        <div onClick={() => toggleStatusFilter('IN PROGRESS', !showInProgress)} style={{ flex: 1, padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #dfe1e6', cursor: 'pointer', textAlign: 'center', boxShadow: showInProgress ? '0 0 0 2px #0052cc' : 'none' }}>
          <div style={{ fontSize: '12px', color: '#7a869a' }}>In Progress</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0052cc' }}>{inProgressCount}</div>
        </div>

        <div onClick={() => toggleStatusFilter('RESOLVED', !showResolved)} style={{ flex: 1, padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #dfe1e6', cursor: 'pointer', textAlign: 'center', boxShadow: showResolved ? '0 0 0 2px #36b37e' : 'none' }}>
          <div style={{ fontSize: '12px', color: '#7a869a' }}>Resolved</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#36b37e' }}>{resolvedCount}</div>
        </div>

        <div onClick={() => toggleStatusFilter('CLOSED', !showClosed)} style={{ flex: 1, padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #dfe1e6', cursor: 'pointer', textAlign: 'center', boxShadow: showClosed ? '0 0 0 2px #42526e' : 'none' }}>
          <div style={{ fontSize: '12px', color: '#7a869a' }}>Closed</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#42526e' }}>{closedCount}</div>
        </div>

      </div>

      <div className={styles.searchBar}>
        <select 
          value={searchColumn} 
          onChange={(e) => updateUrlParam('column', e.target.value)} 
          className={styles.select}
        >
          <option value="ALL">{t('dashboard.search.all_columns', 'All Columns')}</option>
          <option value="id_issue">{t('dashboard.search.id', 'ID')}</option>
          <option value="title">{t('dashboard.search.title', 'Title')}</option>
          <option value="status">{t('dashboard.search.status', 'Status')}</option>
          <option value="issue_type">{t('dashboard.search.issue_type', 'Issue Type')}</option>
          <option value="user_name">{t('dashboard.search.username', 'User Name')}</option>
          <option value="full_name">{t('dashboard.search.fullname', 'Full Name')}</option>
          <option value="criticity">{t('dashboard.search.criticity', 'Criticity')}</option>
          <option value="country">{t('dashboard.search.location', 'Location')}</option>
          <option value="creation_date">{t('dashboard.search.date', 'Date')}</option>
        </select>

        <input 
          type="text" 
          placeholder={t('dashboard.search.placeholder', 'Search...')}
          value={searchQuery} 
          onChange={(e) => updateUrlParam('search', e.target.value)} 
          className={styles.inputSearch}
        />
      </div>

      <div className={styles.actionBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>👁️ {t('dashboard.filters.show', 'Show:')}</span>
          
          <label className={styles.checkboxPill}>
            <input 
              type="checkbox" 
              checked={showPreticket} 
              onChange={(e) => toggleStatusFilter('PRETICKET', e.target.checked)} 
              className={styles.checkboxInput}
            />
            📋 {t('dashboard.filters.preticket', 'PRETICKET')}
          </label>

          <label className={styles.checkboxPill}>
            <input 
              type="checkbox" 
              checked={showInProgress} 
              onChange={(e) => toggleStatusFilter('IN PROGRESS', e.target.checked)} 
              className={styles.checkboxInput}
            />
            🚀 {t('dashboard.filters.in_progress', 'IN PROGRESS')}
          </label>

          <label className={styles.checkboxPill}>
            <input 
              type="checkbox" 
              checked={showResolved} 
              onChange={(e) => toggleStatusFilter('RESOLVED', e.target.checked)} 
              className={styles.checkboxInput}
            />
            ✅ {t('dashboard.filters.resolved', 'RESOLVED')}
          </label>

          <label className={styles.checkboxPill}>
            <input 
              type="checkbox" 
              checked={showClosed} 
              onChange={(e) => toggleStatusFilter('CLOSED', e.target.checked)} 
              className={styles.checkboxInput}
            />
            🔒 {t('dashboard.filters.closed', 'CLOSED')}
          </label>
        </div>

        {/* 🚨 CORRECTION URL ICI */}
        <button 
          className={styles.createBtn}
          onClick={() => navigate('/?new=true')}
        >
          ➕ {t('dashboard.create_button', 'Create a Ticket')}
        </button>
      </div>

      <ErrorMessage message={error} />

      {filteredTickets.length === 0 && !error ? (
        <div className={styles.emptyState}>
          <h3>{t('dashboard.empty_state', 'No matching tickets found')}</h3>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th onClick={() => requestSort('id_issue')}>
                  {t('dashboard.table.id', 'ID')} {getSortIcon('id_issue')}
                </th>
                <th onClick={() => requestSort('title')}>
                  {t('dashboard.table.title', 'Title')} {getSortIcon('title')}
                </th>
                <th onClick={() => requestSort('status')}>
                  {t('dashboard.table.status', 'Status')} {getSortIcon('status')}
                </th>
                <th onClick={() => requestSort('issue_type')}>
                  {t('dashboard.table.type', 'Type')} {getSortIcon('issue_type')}
                </th>
                <th onClick={() => requestSort('user_name')}>
                  {t('dashboard.table.username', 'Username')} {getSortIcon('user_name')}
                </th>
                <th onClick={() => requestSort('full_name')}>
                  {t('dashboard.table.fullname', 'Full Name')} {getSortIcon('full_name')}
                </th>
                <th onClick={() => requestSort('criticity')}>
                  {t('dashboard.table.criticity', 'Criticity')} {getSortIcon('criticity')}
                </th>
                <th onClick={() => requestSort('country')}>
                  {t('dashboard.table.location', 'Location')} {getSortIcon('country')}
                </th>
                <th onClick={() => requestSort('creation_date')}>
                  {t('dashboard.table.date', 'Date')} {getSortIcon('creation_date')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((ticket) => (
                <tr 
                  key={ticket.id_issue} 
                  onClick={() => handleRowClick(ticket.id_issue)}
                  className={styles.tableRow}
                >
                  <td className={styles.tdId}>#{ticket.id_issue}</td>
                  <td className={styles.tdTitle}>{ticket.title}</td>
                  <td>
                    <span className={`${styles.badge} ${styles['status_' + ticket.status.replace(' ', '_')] || styles.badgeDefault}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles['type_' + ticket.issue_type] || styles.badgeDefault}`}>
                      {ticket.issue_type}
                    </span>
                  </td>
                  <td>{ticket.user_name}</td>
                  <td>{ticket.full_name}</td>
                  <td>
                  <span className={`${styles.badge} ${styles['criticity_' + ticket.criticity] || styles.criticity_DEFAULT}`}>
                  {ticket.criticity}
                  </span>
                  </td>
                  <td className={styles.tdLocation}>{ticket.country}</td>
                  <td className={styles.tdDate}>{ticket.creation_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Dashboard