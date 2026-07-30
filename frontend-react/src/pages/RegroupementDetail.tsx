import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { fetchRegroupement, closeRegroupement, uploadRegroupementAttachments } from '../api/regroupements'
import styles from './IssueForm.module.css' 

function RegroupementDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [regroupement, setRegroupement] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [uploading, setUploading] = useState<boolean>(false)

  const regroupementId = Number(id)

  const loadData = () => {
    if (!regroupementId) return
    setLoading(true)
    fetchRegroupement(regroupementId)
      .then((res) => {
        setRegroupement(res.data)
        setLoading(false)
      })
      .catch((err) => {
        toast.error(t('regroupements.error.load_failed', 'Failed to load regroupement details.'))
        setLoading(false)
      })
  }

  useEffect(() => {
    loadData()
  }, [regroupementId])

  // 🚨 Action : Clôturer le regroupement
  const handleClose = async () => {
    if (!window.confirm(t('regroupements.confirm_close', 'Are you sure you want to close this regroupement?'))) {
      return
    }
    try {
      await closeRegroupement(regroupementId)
      toast.success(t('regroupements.closed_success', 'Regroupement closed successfully!'))
      loadData() // Recharge les données pour mettre à jour le statut visuel
    } catch (err: any) {
      toast.error(t('regroupements.error.close_failed', 'Failed to close regroupement.'))
    }
  }

  // 🚨 Action : Ajouter des pièces jointes
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const formData = new FormData()
    Array.from(e.target.files).forEach((file) => {
      formData.append('files', file)
    })

    setUploading(true)
    try {
      await uploadRegroupementAttachments(regroupementId, formData)
      toast.success(t('regroupements.attachments_success', 'Files uploaded successfully!'))
      loadData()
    } catch (err) {
      toast.error(t('regroupements.error.upload_failed', 'Failed to upload files.'))
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return <p style={{ padding: '40px', textAlign: 'center' }}>{t('common.loading', 'Loading...')}</p>
  }

  if (!regroupement) {
    return <p style={{ padding: '40px', textAlign: 'center' }}>{t('regroupements.not_found', 'Regroupement not found.')}</p>
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '30px auto', padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #dfe1e6', paddingBottom: '15px' }}>
        <div>
          <button onClick={() => navigate('/regroupements')} style={{ background: 'none', border: 'none', color: '#0052cc', cursor: 'pointer', padding: 0, marginBottom: '10px' }}>
            ← {t('common.back', 'Back to list')}
          </button>
          <h1 style={{ margin: 0 }}>📁 #{regroupement.id_regroupment} - {regroupement.title}</h1>
          <p style={{ color: '#7a869a', margin: '5px 0 0 0', fontSize: '14px' }}>
            Created by <strong>{regroupement.created_by}</strong> on {regroupement.created_on}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{
            background: regroupement.status === 'CLOSED' ? '#dfe1e6' : '#deebff',
            color: regroupement.status === 'CLOSED' ? '#42526e' : '#0052cc',
            padding: '6px 12px', borderRadius: '16px', fontWeight: 'bold', fontSize: '14px'
          }}>
            {regroupement.status}
          </span>

          {regroupement.status !== 'CLOSED' && (
            <button 
              onClick={handleClose} 
              style={{ background: '#de350b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              🔒 {t('regroupements.close_button', 'Close Regroupement')}
            </button>
          )}
        </div>
      </div>

      {/* Détails du regroupement */}
      <div style={{ marginTop: '20px' }}>
        <h3>{t('form.description', 'Description')}</h3>
        <p style={{ background: '#f4f5f7', padding: '15px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>{regroupement.description}</p>
        
        {regroupement.ssp_ticket && (
          <p>
            <strong>SSP Ticket: </strong> 
            <a href={`https://ssp.example.com/${regroupement.ssp_ticket}`} target="_blank" rel="noreferrer" style={{ color: '#0052cc', fontWeight: 'bold' }}>
              #{regroupement.ssp_ticket} 🔗
            </a>
          </p>
        )}
      </div>

      {/* Section Issues liées */}
      <div style={{ marginTop: '30px' }}>
        <h3>📋 {t('regroupements.linked_issues', 'Linked Issues')} ({regroupement.linked_issues?.length || 0})</h3>
        {(!regroupement.linked_issues || regroupement.linked_issues.length === 0) ? (
          <p style={{ color: '#7a869a' }}>{t('regroupements.no_issues_linked', 'No issues linked to this regroupement yet.')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {regroupement.linked_issues.map((issue: any) => (
              <div 
                key={issue.id_issue} 
                onClick={() => navigate(`/dashboard?id=${issue.id_issue}`)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 15px', border: '1px solid #dfe1e6', borderRadius: '4px', cursor: 'pointer', background: '#fafbfc' }}
              >
                <div>
                  <strong style={{ color: '#0052cc' }}>#{issue.id_issue}</strong> - {issue.title}
                  <span style={{ color: '#7a869a', fontSize: '12px', marginLeft: '10px' }}>({issue.issue_type})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: '#7a869a' }}>{issue.user_name}</span>
                  <span style={{ background: '#e3fcef', color: '#006644', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                    {issue.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section Pièces jointes */}
      <div style={{ marginTop: '30px', borderTop: '1px solid #dfe1e6', paddingTop: '20px' }}>
        <h3>📎 {t('regroupements.attachments', 'Attachments')}</h3>
        
        {regroupement.status !== 'CLOSED' && (
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'inline-block', padding: '8px 16px', background: '#f4f5f7', border: '1px dashed #42526e', borderRadius: '4px', cursor: 'pointer' }}>
              {uploading ? t('common.uploading', 'Uploading...') : t('regroupements.add_attachments', '+ Add files')}
              <input type="file" multiple onChange={handleFileUpload} disabled={uploading} style={{ display: 'none' }} />
            </label>
          </div>
        )}

        {regroupement.attachments && regroupement.attachments.length > 0 ? (
          <ul style={{ paddingLeft: '20px' }}>
            {regroupement.attachments.map((file: any, index: number) => (
              <li key={index}>
                <a href={file.url_path} target="_blank" rel="noreferrer" style={{ color: '#0052cc' }}>
                  {file.attachment_name}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#7a869a', fontSize: '14px' }}>{t('regroupements.no_attachments', 'No attachments uploaded.')}</p>
        )}
      </div>
    </div>
  )
}

export default RegroupementDetail