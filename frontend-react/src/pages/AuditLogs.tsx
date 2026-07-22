import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ErrorMessage from '../components/ErrorMessage'

function AuditLogs() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch('https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/audit/logs', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('nutria_token')}`
          }
        })

        if (!response.ok) {
          if (response.status === 403) {
            navigate('/dashboard') // Kicks out non-admins
            return
          }
          throw new Error('Error while fetching audit logs.')
        }

        const data = await response.json()

        // ✅ Sécurisation : On s'assure que data est bien un tableau avant de faire setLogs
        if (Array.isArray(data)) {
          setLogs(data)
        } else {
          setError(data.error || 'Invalid response format from server.')
          setLogs([]) // Garde une liste vide pour éviter le crash .map() !
        }
      } catch (err: any) {
        setError(err.message)
        setLogs([]) // Sécurité supplémentaire
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [navigate])

  if (loading) return <p style={{ padding: '40px', textAlign: 'center' }}>{t('common.loading', 'Loading data...')}</p>

  return (
    <div style={{ padding: '20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>{t('audit.title', '🛡️ Audit Trail (Admin)')}</h2>
      </div>

      <ErrorMessage message={error} />

      <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f4f5f7', borderBottom: '2px solid #dfe1e6' }}>
            <tr>
              <th style={{ padding: '12px' }}>{t('audit.table.date', 'Date')}</th>
              <th style={{ padding: '12px' }}>{t('audit.table.user', 'User')}</th>
              <th style={{ padding: '12px' }}>{t('audit.table.action', 'Action')}</th>
              <th style={{ padding: '12px' }}>{t('audit.table.ticket_id', 'Ticket ID')}</th>
              <th style={{ padding: '12px' }}>{t('audit.table.details', 'Details')}</th>
              <th style={{ padding: '12px' }}>{t('audit.table.ip', 'IP Address')}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id_log} style={{ borderBottom: '1px solid #dfe1e6' }}>
                <td style={{ padding: '12px', fontSize: '14px', whiteSpace: 'nowrap' }}>{log.created_at}</td>
                <td style={{ padding: '12px', fontSize: '14px', fontWeight: 'bold' }}>{log.user_name}</td>
                <td style={{ padding: '12px', fontSize: '14px' }}>
                  <span style={{ background: '#e3fcef', color: '#006644', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                    {log.action_type}
                  </span>
                </td>
                <td style={{ padding: '12px', fontSize: '14px' }}>
                  {log.target_id !== '-' ? (
                    <a href={`/?id=${log.target_id}`} style={{ color: '#0052cc', textDecoration: 'none', fontWeight: 'bold' }}>
                      #{log.target_id}
                    </a>
                  ) : '-'}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#42526e' }}>{log.details}</td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#7a869a' }}>{log.ip_address}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#7a869a' }}>
                  {t('audit.empty', 'No logs found.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AuditLogs