import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { createRegroupement, uploadRegroupementAttachments } from '../api/regroupements'
import { fetchAllIssues } from '../api/issues'
import FileUploader from '../components/FileUploader'
import styles from './IssueForm.module.css' 

function RegroupementForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [availableIssues, setAvailableIssues] = useState<any[]>([])
  
  // Attachments state
  const [attachments, setAttachments] = useState<File[]>([])

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    ssp_ticket: '',
    issue_ids: [] as number[]
  })

  useEffect(() => {
    fetchAllIssues()
      .then(res => {
        const issuesToLink = (res.data || []).filter((i: any) => 
          !['CLOSED', 'CANCELED'].includes(i.status) && !i.id_regroupment
        )
        setAvailableIssues(issuesToLink)
      })
      .catch(() => {
        toast.error(t('regroupements.error.fetch_issues', 'Could not load available issues.'))
      })
  }, [t])

  const toggleIssue = (id: number) => {
    setFormData(prev => ({
      ...prev,
      issue_ids: prev.issue_ids.includes(id) 
        ? prev.issue_ids.filter(i => i !== id) 
        : [...prev.issue_ids, id]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim() || !formData.description.trim()) {
      toast.error(t('form.missing_fields', 'Please fill all required fields.'))
      return
    }

    setLoading(true)
    try {
      // 1. Create regroupement
      const response = await createRegroupement(formData)
      const newRegroupementId = response.data.id_regroupment
      
      // 2. Upload attachments if present
      if (attachments.length > 0 && newRegroupementId) {
        const uploadData = new FormData()
        attachments.forEach((file) => uploadData.append('files', file))
        
        try {
          await uploadRegroupementAttachments(newRegroupementId, uploadData)
        } catch (uploadError) {
          toast.error(t('regroupements.error.partial_upload', 'Regroupement created, but some attachments could not be uploaded.'))
        }
      }

      toast.success(t('regroupements.success_created', 'Regroupement created successfully!'))
      // 3. Redirect to detail view
      navigate(`/regroupements/${newRegroupementId}`)
    } catch (error: any) {
      toast.error(t('common.error_detail', 'Error: {{detail}}', { detail: error.message || 'An error occurred' }))
      setLoading(false)
    }
  }

  return (
    <div className={styles.pageContainer} style={{ maxWidth: '800px', margin: '40px auto' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 className={styles.sectionTitle}>📁 {t('regroupements.create_title', 'Create a new Regroupement')}</h2>
        
        <div className={styles.formGroup} style={{ marginTop: '20px' }}>
          <label className={styles.label}>
            {t('form.title', 'Title')} <span className={styles.required}>*</span>
          </label>
          <input 
            type="text" 
            className={styles.input}
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            required 
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>
            {t('form.description', 'Description')} <span className={styles.required}>*</span>
          </label>
          <textarea 
            rows={5}
            className={styles.textarea}
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            required 
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>
            {t('form.ssp_ticket', 'SSP Ticket Number (Optional)')}
          </label>
          <input 
            type="text" 
            className={styles.input}
            placeholder="Ex: 440827"
            value={formData.ssp_ticket}
            onChange={(e) => setFormData({...formData, ssp_ticket: e.target.value})}
          />
          <small style={{ color: '#7a869a', marginTop: '4px', display: 'block' }}>
            {t('form.ssp_help', 'Just enter the number, the link will be generated automatically.')}
          </small>
        </div>

        {/* ATTACHMENTS BLOCK */}
        <div className={styles.formGroup} style={{ marginTop: '20px' }}>
          <label className={styles.label}>{t('ticket.attachments', 'Add Attachments')}</label>
          <FileUploader files={attachments} onFilesChange={(files: File[]) => setAttachments(files)} />
        </div>

        {/* ISSUE SELECTION BLOCK */}
        <div style={{ background: '#f4f5f7', padding: '16px', borderRadius: '6px', marginTop: '20px' }}>
          <label className={styles.label} style={{ marginBottom: '8px' }}>
            {t('regroupements.link_issues', 'Link existing issues')} ({formData.issue_ids.length})
          </label>
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #dfe1e6', padding: '10px', background: '#fff', borderRadius: '4px' }}>
            {availableIssues.length === 0 ? (
              <p style={{ color: '#7a869a', margin: 0, fontSize: '13px' }}>{t('regroupements.no_issues_available', 'No unlinked issues available.')}</p>
            ) : null}
            {availableIssues.map(issue => (
              <label key={issue.id_issue} style={{ display: 'flex', alignItems: 'center', margin: '8px 0', cursor: 'pointer', fontSize: '14px' }}>
                <input 
                  type="checkbox" 
                  checked={formData.issue_ids.includes(issue.id_issue)}
                  onChange={() => toggleIssue(issue.id_issue)}
                  style={{ marginRight: '10px' }}
                />
                <span>
                  <strong>#{issue.id_issue}</strong> - {issue.title} 
                  <span style={{ color: '#7a869a', fontSize: '12px', marginLeft: '6px' }}>({issue.status})</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.actionContainer} style={{ marginTop: '24px', justifyContent: 'flex-end', display: 'flex', gap: '10px' }}>
          <button type="button" onClick={() => navigate('/regroupements')} style={{ padding: '8px 16px', background: '#f4f5f7', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: '#42526e' }}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button type="submit" disabled={loading} className={`${styles.submitBtn} ${styles.active}`}>
            {loading ? '⏳...' : t('common.save', 'Save')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default RegroupementForm