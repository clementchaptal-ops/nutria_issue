import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { createRegroupement } from '../api/regroupements'
import { fetchAllIssues } from '../api/issues' // 🚨 Import API pour charger les issues
import styles from './IssueForm.module.css' 

function RegroupementForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [availableIssues, setAvailableIssues] = useState<any[]>([])

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    ssp_ticket: '',
    issue_ids: [] as number[] // 🚨 Ajout du tableau d'IDs
  })

  useEffect(() => {
    fetchAllIssues().then(res => {
       // On garde les issues actives qui n'appartiennent à aucun regroupement
       const issuesToLink = (res.data || []).filter((i: any) => 
           !['CLOSED', 'CANCELED'].includes(i.status) && !i.id_regroupment
       )
       setAvailableIssues(issuesToLink)
    }).catch(() => {
       toast.error("Impossible de charger les issues disponibles.")
    })
  }, [])

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
    if (!formData.title || !formData.description) {
      toast.error(t('form.missing_fields', 'Please fill all required fields.'))
      return
    }

    setLoading(true)
    try {
      const response = await createRegroupement(formData)
      toast.success(t('regroupements.success_created', 'Regroupement created successfully!'))
      
      // 🚨 Redirection immédiate vers le détail
      navigate(`/regroupements/${response.data.id_regroupment}`)
    } catch (error: any) {
      toast.error(t('error.generic', 'An error occurred'))
      setLoading(false)
    }
  }

  return (
    <div className={styles.formContainer} style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2>📁 {t('regroupements.create_title', 'Create a new Regroupement')}</h2>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
            {t('form.title', 'Title')} *
          </label>
          <input 
            type="text" 
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #dfe1e6' }}
            required 
          />
        </div>

        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
            {t('form.description', 'Description')} *
          </label>
          <textarea 
            rows={5}
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #dfe1e6', resize: 'vertical' }}
            required 
          />
        </div>

        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
            {t('form.ssp_ticket', 'SSP Ticket Number (Optional)')}
          </label>
          <input 
            type="text" 
            placeholder="Ex: 440827"
            value={formData.ssp_ticket}
            onChange={(e) => setFormData({...formData, ssp_ticket: e.target.value})}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #dfe1e6' }}
          />
          <small style={{ color: '#7a869a' }}>{t('form.ssp_help', 'Just enter the number, the link will be generated automatically.')}</small>
        </div>

        {/* 🚨 Bloc de sélection d'issues à lier */}
        <div style={{ background: '#f4f5f7', padding: '15px', borderRadius: '4px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>
            Lier des issues existantes ({formData.issue_ids.length} sélectionnée(s))
          </label>
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #dfe1e6', padding: '10px', background: '#fff' }}>
            {availableIssues.length === 0 ? <p style={{ color: '#7a869a', margin: 0 }}>Aucune issue orpheline disponible.</p> : null}
            {availableIssues.map(issue => (
              <label key={issue.id_issue} style={{ display: 'flex', alignItems: 'center', margin: '8px 0', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={formData.issue_ids.includes(issue.id_issue)}
                  onChange={() => toggleIssue(issue.id_issue)}
                  style={{ marginRight: '10px' }}
                />
                <span>
                  <strong>#{issue.id_issue}</strong> - {issue.title} 
                  <span style={{ color: '#7a869a', fontSize: '12px', marginLeft: '5px' }}>({issue.status})</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
          <button type="button" onClick={() => navigate('/regroupements')} style={{ padding: '10px 20px', background: '#f4f5f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button type="submit" disabled={loading} style={{ padding: '10px 20px', background: '#0052cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {loading ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default RegroupementForm