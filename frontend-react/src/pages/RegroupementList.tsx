import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchAllRegroupements, triggerAiClustering, validateAiSuggestion, rejectAiSuggestion } from '../api/regroupements'
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
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false)

  // Filtres de Statuts
  const [classicStatuses, setClassicStatuses] = useState<string[]>(['OPEN'])
  const [aiStatuses, setAiStatuses] = useState<string[]>(['SUGGESTED'])
  
  // Tri
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'id_regroupment', direction: 'desc' })

  // Recherche Indépendante (Classic)
  const classicSearchQuery = searchParams.get('search') || ''
  const classicSearchColumn = searchParams.get('column') || 'ALL'

  // Recherche Indépendante (IA)
  const aiSearchQuery = searchParams.get('aiSearch') || ''
  const aiSearchColumn = searchParams.get('aiColumn') || 'ALL'

  const updateUrlParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) newParams.set(key, value)
    else newParams.delete(key)
    setSearchParams(newParams)
  }

  const loadData = () => {
    setLoading(true)
    fetchAllRegroupements()
      .then((response) => {
        setRegroupements(response.data || [])
        setLoading(false)
      })
      .catch((err) => {
        toast.error(t('regroupements.error.network', 'Network error: {{message}}', { message: err.message }))
        setLoading(false)
      })
  }

  useEffect(() => {
    loadData()
  }, [t])

  // --- ACTIONS IA ---
  const handleTriggerAi = async () => {
    setIsAiLoading(true);
    toast.loading(t('regroupements.ai.analyzing', 'AI analysis in progress...'), { id: 'ai-toast' });
    try {
      const response = await triggerAiClustering();
      const createdCount = response.data.suggested_groups_created || 0;
      toast.success(t('regroupements.ai.success', 'Done! {{count}} regroupement(s) suggested.', { count: createdCount }), { id: 'ai-toast' });
      if (createdCount > 0 && !aiStatuses.includes('SUGGESTED')) {
        setAiStatuses([...aiStatuses, 'SUGGESTED']);
      }
      loadData();
    } catch (err: any) {
      toast.error(t('regroupements.ai.error', 'AI Error: {{message}}', { message: err.message }), { id: 'ai-toast' });
    } finally {
      setIsAiLoading(false);
    }
  }

  const handleValidateSuggestion = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await validateAiSuggestion(id);
      toast.success(t('regroupements.ai.validated', 'Regroupement #{{id}} validated!', { id }));
      loadData();
    } catch (err: any) {
      toast.error(t('regroupements.error.validate', 'Error during validation.'));
    }
  }

  const handleRejectSuggestion = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await rejectAiSuggestion(id);
      toast.success(t('regroupements.ai.rejected', 'Suggestion #{{id}} rejected.', { id }));
      loadData();
    } catch (err: any) {
      toast.error(t('regroupements.error.reject', 'Error during rejection.'));
    }
  }

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  // --- SEPARATION & FILTERING ---
  const classicList = regroupements.filter(r => r.status === 'OPEN' || r.status === 'CLOSED');
  const aiList = regroupements.filter(r => r.status === 'SUGGESTED' || r.status === 'REJECTED');

  const openCount = classicList.filter(r => r.status === 'OPEN').length;
  const closedCount = classicList.filter(r => r.status === 'CLOSED').length;
  const suggestedCount = aiList.filter(r => r.status === 'SUGGESTED').length;
  const rejectedCount = aiList.filter(r => r.status === 'REJECTED').length;

  const filterBySearch = (list: any[], query: string, column: string) => {
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(grp => {
      if (column === 'ALL') {
        return Object.values(grp).some(val => String(val).toLowerCase().includes(q));
      }
      return String(grp[column] || '').toLowerCase().includes(q);
    });
  }

  const visibleClassic = filterBySearch(classicList.filter(r => classicStatuses.includes(r.status)), classicSearchQuery, classicSearchColumn);
  const visibleAi = filterBySearch(aiList.filter(r => aiStatuses.includes(r.status)), aiSearchQuery, aiSearchColumn);

  const sortData = (list: any[]) => {
    return [...list].sort((a, b) => {
      const key = sortConfig.key
      let valA = a[key]
      let valB = b[key]
      if (key === 'id_regroupment') return sortConfig.direction === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0)
      if (String(valA || '').toLowerCase() < String(valB || '').toLowerCase()) return sortConfig.direction === 'asc' ? -1 : 1
      if (String(valA || '').toLowerCase() > String(valB || '').toLowerCase()) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }

  const toggleClassicStatus = (status: string) => setClassicStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  const toggleAiStatus = (status: string) => setAiStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);

  const searchColumns = [
    { value: 'ALL', label: t('dashboard.search.all_columns', 'All Columns') },
    { value: 'id_regroupment', label: t('regroupements.table.id', 'ID') },
    { value: 'title', label: t('dashboard.search.title', 'Title') },
    { value: 'created_by', label: t('regroupements.table.creator', 'Creator') }
  ]

  const commonColumns: TableColumn<any>[] = [
    { key: 'id_regroupment', label: t('regroupements.table.id', 'ID'), render: (item) => <span style={{ fontWeight: 'bold', color: '#0052cc' }}>#{item.id_regroupment}</span> },
    { key: 'title', label: t('dashboard.search.title', 'Title'), render: (item) => <strong>{item.title}</strong> },
    { key: 'created_by', label: t('regroupements.table.creator', 'Created By') },
    { key: 'ticket_count', label: t('regroupements.table.issues', 'Issues') }
  ]

  const classicColumns: TableColumn<any>[] = [
    ...commonColumns,
    { key: 'status', label: t('dashboard.search.status', 'Status'), render: (item) => (
      <span style={{ background: item.status === 'CLOSED' ? '#dfe1e6' : '#deebff', color: item.status === 'CLOSED' ? '#42526e' : '#0052cc', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
        {item.status}
      </span>
    )}
  ]

  const aiColumns: TableColumn<any>[] = [
    ...commonColumns,
    { key: 'status', label: t('dashboard.search.status', 'Status'), render: (item) => (
      <span style={{ background: item.status === 'REJECTED' ? '#ffebe6' : '#eae6ff', color: item.status === 'REJECTED' ? '#bf2600' : '#403294', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
        {item.status}
      </span>
    )},
    { key: 'actions', label: t('regroupements.table.actions', 'Actions'), render: (item) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          {item.status === 'SUGGESTED' && (
            <>
              <button onClick={(e) => handleValidateSuggestion(e, item.id_regroupment)} style={{ background: '#e3fcef', color: '#006644', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>✅ {t('regroupements.action.accept', 'Accept')}</button>
              <button onClick={(e) => handleRejectSuggestion(e, item.id_regroupment)} style={{ background: '#ffebe6', color: '#bf2600', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>❌ {t('regroupements.action.reject', 'Reject')}</button>
            </>
          )}
          {item.status === 'REJECTED' && (
            <button onClick={(e) => handleValidateSuggestion(e, item.id_regroupment)} style={{ background: '#deebff', color: '#0052cc', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>↺ {t('regroupements.action.reaccept', 'Re-accept')}</button>
          )}
        </div>
      )
    }
  ]

  if (loading) return <p style={{ padding: '40px', textAlign: 'center' }}>{t('common.loading', 'Loading data...')}</p>

  return (
    <div className={styles.container}>
      
      {/* ======================= */}
      {/* 1. BLOC CLASSIQUE       */}
      {/* ======================= */}
      <div className={styles.header}>
        <h1 className={styles.title}>{t('regroupements.classic_dashboard', 'Classic Regroupements Dashboard')}</h1>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <StatCard label={t('regroupements.status.open', 'Open')} count={openCount} color="#0052cc" isActive={classicStatuses.includes('OPEN')} onClick={() => toggleClassicStatus('OPEN')} />
        <StatCard label={t('regroupements.status.closed', 'Closed')} count={closedCount} color="#42526e" isActive={classicStatuses.includes('CLOSED')} onClick={() => toggleClassicStatus('CLOSED')} />
      </div>

      <div className={styles.actionBar}>
        <SearchBar 
          columns={searchColumns} 
          searchColumn={classicSearchColumn} 
          onColumnChange={(val) => updateUrlParam('column', val)}
          searchQuery={classicSearchQuery}
          onSearchChange={(val) => updateUrlParam('search', val)}
          placeholder={t('dashboard.search.placeholder', 'Search in classic...')}
        />
        <button className={styles.createBtn} onClick={() => navigate('/regroupements/new')}>
          📁 {t('regroupements.create_manual', 'Create Manual')}
        </button>
      </div>

      <GenericTable 
        columns={classicColumns} data={sortData(visibleClassic)} 
        sortConfig={sortConfig} onSort={requestSort} 
        onRowClick={(item) => navigate(`/regroupements/${item.id_regroupment}`)} 
        rowKey={(item) => item.id_regroupment}
      />

      <hr style={{ margin: '50px 0', border: '1px solid #dfe1e6' }} />

      {/* ======================= */}
      {/* 2. BLOC IA / AIOps      */}
      {/* ======================= */}
      <div className={styles.header}>
        <h2 className={styles.title} style={{ color: '#403294' }}>✨ {t('regroupements.ai_dashboard', 'AIOps Suggestions')}</h2>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <StatCard label={t('regroupements.status.suggested', 'Suggested')} count={suggestedCount} color="#403294" isActive={aiStatuses.includes('SUGGESTED')} onClick={() => toggleAiStatus('SUGGESTED')} />
        <StatCard label={t('regroupements.status.refused', 'Refused')} count={rejectedCount} color="#bf2600" isActive={aiStatuses.includes('REJECTED')} onClick={() => toggleAiStatus('REJECTED')} />
      </div>

      <div className={styles.actionBar}>
        <SearchBar 
          columns={searchColumns} 
          searchColumn={aiSearchColumn} 
          onColumnChange={(val) => updateUrlParam('aiColumn', val)}
          searchQuery={aiSearchQuery}
          onSearchChange={(val) => updateUrlParam('aiSearch', val)}
          placeholder={t('dashboard.search.placeholder_ai', 'Search in AI suggestions...')}
        />
        <button className={styles.aiBtn} onClick={handleTriggerAi} disabled={isAiLoading}>
          {isAiLoading ? `⏳ ${t('regroupements.ai.analyzing', 'Analysis in progress...')}` : `✨ ${t('regroupements.generate_ai', 'Generate New Suggestions')}`}
        </button>
      </div>

      {visibleAi.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{t('regroupements.empty_ai', 'No AI suggestions to display.')}</p>
        </div>
      ) : (
        <GenericTable 
          columns={aiColumns} data={sortData(visibleAi)} 
          sortConfig={sortConfig} onSort={requestSort} 
          onRowClick={(item) => navigate(`/regroupements/${item.id_regroupment}`)} 
          rowKey={(item) => item.id_regroupment}
        />
      )}
    </div>
  )
}

export default RegroupementList

