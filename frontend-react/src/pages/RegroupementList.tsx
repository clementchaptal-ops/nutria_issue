import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchAllRegroupements, triggerAiClustering, validateAiSuggestion, rejectAiSuggestion } from '../api/regroupements'
import styles from './RegroupementList.module.css'

import StatCard from '../components/StatCard'
import GenericTable, { TableColumn } from '../components/GenericTable'

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
}

function RegroupementList() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [regroupements, setRegroupements] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  
  // États IA
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false)

  // Filtres Haut (Classique) et Bas (IA)
  const [classicStatuses, setClassicStatuses] = useState<string[]>(['OPEN'])
  const [aiStatuses, setAiStatuses] = useState<string[]>(['SUGGESTED'])
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'id_regroupment', direction: 'desc' })

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
    toast.loading('Analyse IA en cours...', { id: 'ai-toast' });
    try {
      const response = await triggerAiClustering();
      const createdCount = response.data.suggested_groups_created || 0;
      toast.success(`Terminé ! ${createdCount} regroupement(s) suggéré(s).`, { id: 'ai-toast' });
      if (createdCount > 0 && !aiStatuses.includes('SUGGESTED')) {
        setAiStatuses([...aiStatuses, 'SUGGESTED']);
      }
      loadData();
    } catch (err: any) {
      toast.error(`Erreur IA : ${err.message}`, { id: 'ai-toast' });
    } finally {
      setIsAiLoading(false);
    }
  }

  const handleValidateSuggestion = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); // Empêche le clic de rediriger vers les détails
    try {
      await validateAiSuggestion(id);
      toast.success(`Regroupement #${id} validé !`);
      loadData();
    } catch (err: any) {
      toast.error('Erreur lors de la validation.');
    }
  }

  const handleRejectSuggestion = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await rejectAiSuggestion(id);
      toast.success(`Suggestion #${id} rejetée.`);
      loadData();
    } catch (err: any) {
      toast.error('Erreur lors du rejet.');
    }
  }

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  // --- SÉPARATION DES LISTES ---
  const classicList = regroupements.filter(r => r.status === 'OPEN' || r.status === 'CLOSED');
  const aiList = regroupements.filter(r => r.status === 'SUGGESTED' || r.status === 'REJECTED');

  // Compteurs
  const openCount = classicList.filter(r => r.status === 'OPEN').length;
  const closedCount = classicList.filter(r => r.status === 'CLOSED').length;
  const suggestedCount = aiList.filter(r => r.status === 'SUGGESTED').length;
  const rejectedCount = aiList.filter(r => r.status === 'REJECTED').length;

  // Filtrage final
  const visibleClassic = classicList.filter(r => classicStatuses.includes(r.status));
  const visibleAi = aiList.filter(r => aiStatuses.includes(r.status));

  // Tri
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

  const toggleClassicStatus = (status: string) => {
    setClassicStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])
  }
  
  const toggleAiStatus = (status: string) => {
    setAiStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])
  }

  // Colonnes Communes
  const commonColumns: TableColumn<any>[] = [
    { key: 'id_regroupment', label: 'ID', render: (item) => <span style={{ fontWeight: 'bold', color: '#0052cc' }}>#{item.id_regroupment}</span> },
    { key: 'title', label: 'Title', render: (item) => <strong>{item.title}</strong> },
    { key: 'created_by', label: 'Created By' },
    { key: 'ticket_count', label: 'Issues' }
  ]

  const classicColumns: TableColumn<any>[] = [
    ...commonColumns,
    { key: 'status', label: 'Status', render: (item) => (
      <span style={{ background: item.status === 'CLOSED' ? '#dfe1e6' : '#deebff', color: item.status === 'CLOSED' ? '#42526e' : '#0052cc', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
        {item.status}
      </span>
    )}
  ]

  const aiColumns: TableColumn<any>[] = [
    ...commonColumns,
    { key: 'status', label: 'Status', render: (item) => (
      <span style={{ background: item.status === 'REJECTED' ? '#ffebe6' : '#eae6ff', color: item.status === 'REJECTED' ? '#bf2600' : '#403294', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
        {item.status}
      </span>
    )},
    { key: 'actions', label: 'Actions', render: (item) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          {item.status === 'SUGGESTED' && (
            <>
              <button onClick={(e) => handleValidateSuggestion(e, item.id_regroupment)} style={{ background: '#e3fcef', color: '#006644', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>✅ Accepter</button>
              <button onClick={(e) => handleRejectSuggestion(e, item.id_regroupment)} style={{ background: '#ffebe6', color: '#bf2600', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>❌ Refuser</button>
            </>
          )}
          {item.status === 'REJECTED' && (
            <button onClick={(e) => handleValidateSuggestion(e, item.id_regroupment)} style={{ background: '#deebff', color: '#0052cc', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>↺ Ré-accepter</button>
          )}
        </div>
      )
    }
  ]

  if (loading) return <p style={{ padding: '40px', textAlign: 'center' }}>Loading data...</p>

  return (
    <div className={styles.container}>
      {/* 1. BLOC CLASSIQUE */}
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard Regroupements</h1>
        <button className={styles.createBtn} onClick={() => navigate('/regroupements/new')}>📁 Créer Manuel</button>
      </div>
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <StatCard label="Open" count={openCount} color="#0052cc" isActive={classicStatuses.includes('OPEN')} onClick={() => toggleClassicStatus('OPEN')} />
        <StatCard label="Closed" count={closedCount} color="#42526e" isActive={classicStatuses.includes('CLOSED')} onClick={() => toggleClassicStatus('CLOSED')} />
      </div>
      <GenericTable 
        columns={classicColumns} data={sortData(visibleClassic)} 
        sortConfig={sortConfig} onSort={requestSort} 
        onRowClick={(item) => navigate(`/regroupements/${item.id_regroupment}`)} 
        rowKey={(item) => item.id_regroupment}
      />

      <hr style={{ margin: '50px 0', border: '1px solid #dfe1e6' }} />

      {/* 2. BLOC IA / AIOps */}
      <div className={styles.header} style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 className={styles.title} style={{ color: '#403294' }}>✨ AIOps Suggestions</h2>
        </div>
        <button className={styles.aiBtn} onClick={handleTriggerAi} disabled={isAiLoading}>
          {isAiLoading ? '⏳ Analyse en cours...' : '✨ Générer Nouvelles Suggestions'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <StatCard label="Suggested" count={suggestedCount} color="#403294" isActive={aiStatuses.includes('SUGGESTED')} onClick={() => toggleAiStatus('SUGGESTED')} />
        <StatCard label="Refused" count={rejectedCount} color="#bf2600" isActive={aiStatuses.includes('REJECTED')} onClick={() => toggleAiStatus('REJECTED')} />
      </div>

      {visibleAi.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Aucune suggestion IA à afficher.</p>
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