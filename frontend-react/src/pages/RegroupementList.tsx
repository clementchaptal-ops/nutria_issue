import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchAllRegroupements, triggerAiClustering } from '../api/regroupements'
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
  
  // --- NOUVEAUX ÉTATS POUR L'IA ---
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false)
  const [hasRunAi, setHasRunAi] = useState<boolean>(false)
  const [aiResultCount, setAiResultCount] = useState<number | null>(null)

  const searchQuery = searchParams.get('search') || ''
  const searchColumn = searchParams.get('column') || 'ALL'
  
  const statusParam = searchParams.get('status')
  // On ajoute 'SUGGESTED' par défaut si on veut les voir d'emblée
  const activeStatuses = statusParam !== null ? (statusParam ? statusParam.split(',') : []) : ['OPEN', 'SUGGESTED']
  
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

  // --- FONCTION DE DÉCLENCHEMENT IA ---
  const handleTriggerAi = async () => {
    if (hasRunAi || isAiLoading) return;
    
    setIsAiLoading(true);
    toast.loading(t('regroupements.ai.loading', 'Analyse IA en cours... cela peut prendre quelques secondes.'), { id: 'ai-toast' });

    try {
      const response = await triggerAiClustering();
      const createdCount = response.data.suggested_groups_created || 0;
      
      setAiResultCount(createdCount);
      setHasRunAi(true); // Bloque le bouton pour cette session
      
      toast.success(t('regroupements.ai.success', `Terminé ! ${createdCount} regroupement(s) suggéré(s).`), { id: 'ai-toast' });
      
      // Si l'IA a trouvé des choses, on rafraîchit le tableau et on active le filtre "SUGGESTED"
      if (createdCount > 0) {
        if (!activeStatuses.includes('SUGGESTED')) {
           toggleStatusFilter('SUGGESTED');
        }
        loadData();
      }
    } catch (err: any) {
      toast.error(t('regroupements.ai.error', 'Erreur IA : {{message}}', { message: err.message }), { id: 'ai-toast' });
    } finally {
      setIsAiLoading(false);
    }
  }

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
  const suggestedCount = regroupements.filter(r => r.status === 'SUGGESTED').length

  // Filtering
  let filteredList = regroupements.filter((grp) => {
    if (!activeStatuses.includes(grp.status)) return false
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
      render: (item) => {
        let bg = '#deebff';
        let color = '#0052cc';
        if (item.status === 'CLOSED') { bg = '#dfe1e6'; color = '#42526e'; }
        if (item.status === 'SUGGESTED') { bg = '#eae6ff'; color = '#403294'; } // Violet pour l'IA
        
        return (
          <span style={{ background: bg, color: color, padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
            {item.status}
          </span>
        )
      }
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
        <StatCard label="Suggested (AI)" count={suggestedCount} color="#6554C0" isActive={activeStatuses.includes('SUGGESTED')} onClick={() => toggleStatusFilter('SUGGESTED')} />
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

        <div style={{ display: 'flex', gap: '10px' }}>
          {/* BOUTON IA */}
          <button 
            className={styles.aiBtn} 
            onClick={handleTriggerAi}
            disabled={isAiLoading || hasRunAi}
          >
            {isAiLoading ? '⏳ Analyse...' : '✨ Suggest AI'}
          </button>

          <button className={styles.createBtn} onClick={() => navigate('/regroupements/new')}>
            📁 {t('regroupements.create_button', 'Create Regroupement')}
          </button>
        </div>
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

      {/* PANNEAU DE RÉSULTAT IA AFFICHÉ EN BAS APRÈS L'EXÉCUTION */}
      {hasRunAi && aiResultCount !== null && (
        <div className={styles.aiResultPanel}>
          <h3 className={styles.aiResultTitle}>✨ Analyse IA Terminée</h3>
          {aiResultCount > 0 ? (
            <p>L'IA a détecté <strong>{aiResultCount}</strong> nouvelle(s) corrélation(s). Les groupes ont été créés avec le statut <strong>SUGGESTED</strong> et sont visibles dans le tableau ci-dessus.</p>
          ) : (
            <p>L'IA a analysé les tickets ouverts mais n'a trouvé aucune forte corrélation technique à regrouper pour le moment.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default RegroupementList