import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import FileUploader from '../components/FileUploader'
import toast from 'react-hot-toast'
import styles from './TicketForm.module.css'

const getDecodedToken = () => {
  const token = localStorage.getItem('nutria_token');
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
};

// Utility function for elegant confirmations (accepts translated button texts)
const showConfirmToast = (message: string, confirmText: string, cancelText: string, onConfirm: () => void) => {
  toast((t) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span style={{ fontSize: '14px', fontWeight: 500 }}>{message}</span>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={() => toast.dismiss(t.id)}
          style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: '12px' }}
        >
          {cancelText}
        </button>
        <button
          onClick={() => {
            toast.dismiss(t.id)
            onConfirm()
          }}
          style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', background: '#de350b', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
        >
          {confirmText}
        </button>
      </div>
    </div>
  ), { duration: 6000 })
}

function TicketForm() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const ticketId = searchParams.get('id')
  const isNewTicket = searchParams.get('new') === 'true'
  
  const navigate = useNavigate()

  useEffect(() => {
    if (!ticketId && !isNewTicket) {
      navigate('/dashboard', { replace: true })
    }
  }, [ticketId, isNewTicket, navigate])

  const [isLoading, setIsLoading] = useState(true)
  const [status, setStatus] = useState('PRETICKET') 
  const [isEditing, setIsEditing] = useState(false) 
  const [canEdit, setCanEdit] = useState(false)
  
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [title, setTitle] = useState('')
  const [sspTicket, setSspTicket] = useState('')
  const [issueType, setIssueType] = useState('')      
  const [criticity, setCriticity] = useState('')      
  const [frequency, setFrequency] = useState('')      
  const [blockingIssue, setBlockingIssue] = useState('F') 
  const [description, setDescription] = useState('')
  
  const [attachments, setAttachments] = useState<File[]>([])         
  const [existingFiles, setExistingFiles] = useState<any[]>([])   
  const [isCreatedFromWeb, setIsCreatedFromWeb] = useState(false)  
  
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [isPostingComment, setIsPostingComment] = useState(false)
  
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, type: string} | null>(null)
  
  const [userInfo, setUserInfo] = useState({
    user_name: '', full_name: '', user_email: '', created_on: '', current_role: '', lab: '', location: ''
  })

  const [currentContext, setCurrentContext] = useState({
    current_project: '', current_batch: '', current_sample: '', current_analysis: '', current_analysis_variation: '', current_customer: '', citrix_session: ''
  })

  const [networkInfo, setNetworkInfo] = useState({
    ip_adress: '', ip_config: '', workstation: '', current_pc: '', ping: '',
  })

  // AI Analysis States
  const [aiAnalysis, setAiAnalysis] = useState<any>(null)
  const [isAiLoading, setIsAiLoading] = useState(false)

  const workingDirUrl = `https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/download/working_dir`
  const logsUrl = `https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/download/logs`

  const fetchComments = async () => {
    if (!ticketId) return
    try {
      const response = await fetch(`https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/comments`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}` }
      })
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) setComments(data)
        else if (data && Array.isArray(data.comments)) setComments(data.comments)
        else setComments([]) 
      }
    } catch (error) {
      setComments([]) 
    }
  }

  useEffect(() => {
    if (ticketId && !isNewTicket) fetchComments()
  }, [ticketId, isNewTicket])

  useEffect(() => {
    const fetchTicketData = async () => {
      if (isNewTicket) {
        setIsEditing(true)
        setCanEdit(true)
        setStatus('IN PROGRESS') 
        setIsCreatedFromWeb(true) 
        
        const currentUser = getDecodedToken()
        const backupUser = {
          user_name: currentUser?.sub || '',
          full_name: currentUser?.sub || '', 
          user_email: currentUser?.email || '',
          created_on: t('common.na', 'N/A'),
          current_role: currentUser?.role || 'USER',
          lab: t('common.na', 'N/A'), 
          location: currentUser?.location || t('common.na', 'N/A')
        }
        
        setUserInfo(backupUser)

        try {
          const response = await fetch('https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/users/me', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}` }
          })
          
          if (response.ok) {
            const profile = await response.json()
            setUserInfo({
              user_name: profile.user_name || backupUser.user_name,
              full_name: profile.full_name || backupUser.full_name, 
              user_email: profile.user_email || backupUser.user_email,
              created_on: t('common.na', 'N/A'),
              current_role: profile.current_role || backupUser.current_role, 
              lab: profile.lab || backupUser.lab,
              location: profile.location || backupUser.location
            })
          }
        } catch (error) {
          // Silent fallback in case of error
        } finally {
          setIsLoading(false)
        }
        return 
      }

      if (!ticketId) {
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch(`https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}` }
        })
        
        if (!response.ok) {
          if (response.status === 404 || response.status === 403) {
            toast.error(t('ticket.not_found', 'Ticket not found or access denied.'))
            navigate('/dashboard', { replace: true })
            return
          }
          throw new Error('Failed to fetch ticket')
        }
        
        const data = await response.json()
        const currentStatus = data.status || 'PRETICKET'
        setStatus(currentStatus)
        
        setTitle(data.title || '')
        setSspTicket(data.sspticket || '')
        setIssueType(data.issue_type || '')
        setCriticity(data.criticity || '')
        setFrequency(data.frequency || '')
        setBlockingIssue(data.blocking_issue || 'F')
        setDescription(data.description || '')

        if (data.attachments) setExistingFiles(data.attachments)

        const fromWeb = !data.workstation && !data.ip_adress
        setIsCreatedFromWeb(fromWeb)

        setUserInfo({
          user_name: data.user_name || '',
          full_name: data.full_name || '', 
          user_email: data.user_email || '',
          created_on: data.created_on ? new Date(data.created_on).toLocaleString() : '',
          current_role: data.current_role || '',
          lab: data.creator_lab || '',
          location: data.creator_location || ''
        })

        setCurrentContext({
          current_project: data.current_project || '',
          current_batch: data.current_batch || '',
          current_sample: data.current_sample || '',
          current_analysis: data.current_analysis || '',
          current_analysis_variation: data.current_analysis_variation || '',
          current_customer: data.current_customer || '',
          citrix_session: data.citrix_session || ''
        })

        setNetworkInfo({
          ip_adress: data.ip_adress || '',
          ip_config: data.ip_config || '',
          workstation: data.workstation || '',
          current_pc: data.current_pc || '',
          ping: data.ping || ''
        })

        const currentUser = getDecodedToken()
        if (currentUser && currentStatus !== 'CANCELED' && currentStatus !== 'CLOSED' && currentStatus !== 'RESOLVED') {
          const userRole = currentUser.role
          const userLoc = currentUser.location
          const userEmail = currentUser.email?.toLowerCase()
          const userTrigram = currentUser.sub?.toLowerCase()
          
          const ticketLoc = data.creator_location
          const ticketEmail = data.user_email?.toLowerCase()
          const ticketUserName = data.user_name?.toLowerCase()

          let hasRights = false
          if (userRole === 'IT_TEAM') hasRights = true
          else if (userRole === 'LOCAL_ADMIN' && userLoc === ticketLoc) hasRights = true
          else if (userRole === 'USER' && (userEmail === ticketEmail || userTrigram === ticketUserName)) hasRights = true
          
          setCanEdit(hasRights)
          setIsEditing(hasRights && currentStatus === 'PRETICKET')
        }

      } catch (error) {
        toast.error(t('ticket.error.fetch', 'Error loading ticket data.'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchTicketData()
  }, [ticketId, isNewTicket, navigate, t])

  const handleFileDownload = async (url: string, defaultFilename: string) => {
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}` }
      })
      if (!response.ok) throw new Error('Download impossible')

      const disposition = response.headers.get('content-disposition')
      let filename = defaultFilename
      if (disposition && disposition.includes('filename=')) {
        filename = disposition.split('filename=')[1].replace(/"/g, '').trim()
      }

      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', filename) 
      document.body.appendChild(link)
      link.click()
      
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      toast.error(t('ticket.download_error', 'Failed to download file.'))
    }
  }

  const isFormValid = title.trim() !== '' && issueType !== '' && criticity !== '' && frequency !== '' && description.trim() !== ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid || isSubmitting) return

    setIsSubmitting(true)

    const payloadData = {
      title, issue_type: issueType, criticity, frequency, blocking_issue: blockingIssue, description, sspticket: sspTicket,
      current_project: currentContext.current_project, current_batch: currentContext.current_batch,
      current_sample: currentContext.current_sample ? Number(currentContext.current_sample) : null,
      current_analysis: currentContext.current_analysis, current_analysis_variation: currentContext.current_analysis_variation,
      current_customer: currentContext.current_customer
    }

    try {
      const url = isNewTicket 
        ? `https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/create` 
        : `https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/validate`
        
      const httpMethod = isNewTicket ? 'POST' : 'PUT'

      const response = await fetch(url, {
        method: httpMethod,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadData)
      })

      if (response.ok) {
        const responseData = await response.json()
        const targetTicketId = isNewTicket ? responseData.id_issue : ticketId

        if (attachments.length > 0 && targetTicketId) {
          const formData = new FormData()
          attachments.forEach((file) => formData.append('file', file))

          const attachmentsResponse = await fetch(`https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${targetTicketId}/attachments`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}` },
            body: formData
          })

          if (!attachmentsResponse.ok) {
            toast.error(t('ticket.error.upload_attachments', 'Text saved, but files could not be uploaded.'))
          }
        }

        setStatus('IN PROGRESS')
        setIsEditing(false) 
        setAttachments([])
        
        const successMsg = isNewTicket 
          ? t('ticket.success_msg_create', 'Ticket successfully created!') 
          : t('ticket.success_msg_update', 'Ticket successfully updated!')
        
        toast.success(successMsg)
        
        if (isNewTicket) navigate('/dashboard')
        else window.location.reload()
      } else {
        const errorData = await response.json()
        toast.error(t('common.error_detail', 'Error: {{detail}}', { detail: errorData.detail }))
      }
    } catch (error) {
      toast.error(t('ticket.error.submit_failed', 'An error occurred during submission.'))
    } finally {
      setIsSubmitting(false) 
    }
  }

  // Logic extracted to be called by the toast
  const executeCancelTicket = async () => {
    try {
      const response = await fetch(`https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/cancel`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}` }
      });

      if (response.ok) {
        setStatus('CANCELED')
        setIsEditing(false)
        setCanEdit(false) 
        toast.success(t('ticket.cancel_success', 'Ticket successfully canceled.'))
      } else {
        const errorData = await response.json()
        toast.error(t('common.error_detail', 'Error: {{detail}}', { detail: errorData.detail }))
      }
    } catch (error) {
      toast.error(t('ticket.error.network_cancel', 'Network error while canceling ticket.'))
    }
  }

  const handleCancelTicket = () => {
    showConfirmToast(
      t('ticket.confirm_cancel', 'Are you sure you want to cancel this ticket? This action cannot be undone.'), 
      t('common.yes_confirm', 'Yes, confirm'), 
      t('common.no_cancel', 'No, cancel'), 
      executeCancelTicket
    )
  }

  // Logic extracted to be called by the toast
  const executeCloseTicket = async (targetStatus: 'RESOLVED' | 'CLOSED') => {
    try {
      const response = await fetch(`https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/close`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: targetStatus })
      });

      if (response.ok) {
        setStatus(targetStatus)
        setIsEditing(false)
        setCanEdit(false)
        
        const successMessage = targetStatus === 'RESOLVED'
          ? t('ticket.resolve_success', 'Ticket successfully resolved.')
          : t('ticket.close_success', 'Ticket successfully closed.')
        toast.success(successMessage)
      } else {
        const errorData = await response.json()
        toast.error(t('common.error_detail', 'Error: {{detail}}', { detail: errorData.detail }))
      }
    } catch (error) {
      toast.error(t('ticket.error.network_status', 'Network error while changing status.'))
    }
  }

  const handleCloseTicket = (targetStatus: 'RESOLVED' | 'CLOSED') => {
    const confirmMessage = targetStatus === 'RESOLVED' 
      ? t('ticket.confirm_resolve', 'Are you sure you want to resolve this ticket?')
      : t('ticket.confirm_close', 'Are you sure you want to close this ticket?');
    
    showConfirmToast(
      confirmMessage, 
      t('common.yes_confirm', 'Yes, confirm'), 
      t('common.no_cancel', 'No, cancel'), 
      () => executeCloseTicket(targetStatus)
    )
  }

  // Logic extracted to be called by the toast
  const executeDeleteAttachment = async (filename: string) => {
    try {
      const response = await fetch(`https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/attachments/${filename}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}` }
      });

      if (response.ok) {
        setExistingFiles(prev => prev.filter(f => f.attachment_name !== filename));
        toast.success(t('ticket.success.file_deleted', 'File deleted successfully.'));
      } else {
        const err = await response.json();
        toast.error(t('common.error_detail', 'Error: {{detail}}', { detail: err.detail }));
      }
    } catch (error) {
      toast.error(t('ticket.error.network_delete', 'Network error while deleting file.'));
    }
  }

  const handleDeleteAttachment = (filename: string) => {
    showConfirmToast(
      t('ticket.confirm_delete_file', 'Are you sure you want to delete this file?'), 
      t('common.yes_confirm', 'Yes, confirm'), 
      t('common.no_cancel', 'No, cancel'), 
      () => executeDeleteAttachment(filename)
    )
  };

  const handleCancelEdit = () => {
    if (isNewTicket) navigate('/dashboard');
    else {
      setIsEditing(false);
      window.location.reload();
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>{t('common.loading', 'Loading ticket data...')}</div>
  }
  
  const handlePostComment = async () => {
    if (!newComment.trim() || isPostingComment) return
    setIsPostingComment(true)

    try {
      const response = await fetch(`https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_text: newComment })
      })

      if (response.ok) {
        const data = await response.json()
        const newCommentId = data.id_comment

        if (commentFiles.length > 0 && newCommentId) {
          const formData = new FormData()
          commentFiles.forEach((file) => formData.append('file', file))
          await fetch(`https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/comments/${newCommentId}/attachments`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('nutria_token')}` },
            body: formData
          })
        }

        setNewComment('') 
        setCommentFiles([]) 
        fetchComments()   
      } else {
        const err = await response.json()
        toast.error(t('common.error_detail', 'Error: {{detail}}', { detail: err.detail }))
      }
    } catch (error) {
      toast.error(t('ticket.error.network_comment', 'Network error while posting comment.'))
    } finally {
      setIsPostingComment(false)
    }
  }

  // AI Mock Fetch Function
  const fetchAiAnalysis = async () => {
    setIsAiLoading(true)
    
    // Simulate network delay for fetching the JSON from GCS Bucket
    setTimeout(() => {
      // Mocked JSON structure that Python will eventually generate
      setAiAnalysis({
        category: "NETWORK_TIMEOUT",
        confidence: "95%",
        summary: "The logs indicate a recurring timeout when trying to reach the Oracle database from this specific Citrix node. The IP config shows standard parameters, but the ping dropped 2 packets.",
        similar_tickets: [102, 108, 145]
      })
      setIsAiLoading(false)
    }, 1500)
  }
  
  return (
    <div className={styles.pageContainer}>
      
      {/* STATUS BANNER */}
      <div className={`${styles.statusBanner} ${styles[status.toLowerCase().replace(' ', '_')]}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className={styles.statusInfo}>
            <span className={styles.statusLabel}>{t('ticket.current_status', 'Current Status:')}</span>
            <span className={styles.statusBadge}>{status}</span>
          </div>
          {ticketId && <span className={styles.ticketIdText}>LIMS ID: #{ticketId}</span>}
        </div>
        
        {canEdit && (
          <div style={{ display: 'flex', gap: '10px' }}>
            {!isEditing && status !== 'CLOSED' && status !== 'RESOLVED' && status !== 'CANCELED' && (
              <>
                <button type="button" onClick={() => handleCloseTicket('RESOLVED')} style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #36b37e', background: '#e3fcef', color: '#006644', cursor: 'pointer', fontWeight: 'bold' }}>
                  ✅ {t('ticket.resolve', 'Resolve')}
                </button>
                <button type="button" onClick={() => handleCloseTicket('CLOSED')} style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #42526e', background: '#ebecf0', color: '#42526e', cursor: 'pointer', fontWeight: 'bold' }}>
                  🔒 {t('ticket.close', 'Close')}
                </button>
                <button type="button" onClick={() => setIsEditing(true)} style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #0052cc', background: '#fff', color: '#0052cc', cursor: 'pointer', fontWeight: 'bold' }}>
                  ✏️ {t('ticket.edit', 'Edit')}
                </button>
              </>
            )}

            {isEditing && (
              <button type="button" onClick={handleCancelEdit} style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #42526e', background: '#fff', color: '#42526e', cursor: 'pointer', fontWeight: 'bold' }}>
                ❌ {t('common.cancel', 'Cancel Changes')}
              </button>
            )}

            {status === 'PRETICKET' && (
              <button type="button" onClick={handleCancelTicket} style={{ padding: '6px 16px', borderRadius: '4px', border: 'none', background: '#ffebe6', color: '#bf2600', cursor: 'pointer', fontWeight: 'bold' }}>
                🗑️ {t('ticket.cancel', 'Cancel Ticket')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.gridContainer}>
        
        {/* === LEFT COLUMN: FORM & ATTACHMENTS === */}
        <div className={styles.leftColumn}>
          <form onSubmit={handleSubmit}>
            <fieldset disabled={!isEditing} style={{ border: 'none', padding: 0, margin: 0 }}>
              <h2 className={styles.sectionTitle}>
                {isNewTicket ? t('ticket.main_info_title_create', 'Create New Ticket') : t('ticket.main_info_title_update', 'Ticket Completion')}
              </h2>
              
              <div className={styles.formGroup}>
                <label className={styles.label}>{t('ticket.title', 'Issue Title')} <span className={styles.required}>*</span></label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={styles.input} required />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>{t('ticket.ssp_ticket', 'SSP Ticket Link (Optional)')}</label>
                <input type="text" value={sspTicket} onChange={(e) => setSspTicket(e.target.value)} placeholder="SSP-12345" className={styles.input} />
              </div>

              <div className={styles.row2}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{t('ticket.issue_type', 'Issue Type')} <span className={styles.required}>*</span></label>
                  <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className={styles.select} required>
                    <option value="">-- {t('common.select', 'Select')} --</option>
                    <option value="SLOW">SLOW</option>
                    <option value="CRASH">CRASH</option>
                    <option value="ILLOGICAL">ILLOGICAL</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>{t('ticket.criticity', 'Criticity')} <span className={styles.required}>*</span></label>
                  <select value={criticity} onChange={(e) => setCriticity(e.target.value)} className={styles.select} required>
                    <option value="">-- {t('common.select', 'Select')} --</option>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>
              </div>

              <div className={styles.row2}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{t('ticket.frequency', 'Frequency')} <span className={styles.required}>*</span></label>
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={styles.select} required>
                    <option value="">-- {t('common.select', 'Select')} --</option>
                    <option value="ONE_TIME">ONE_TIME</option>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>{t('ticket.blocking_issue', 'Blocking Issue?')}</label>
                  <select value={blockingIssue} onChange={(e) => setBlockingIssue(e.target.value)} className={styles.select}>
                    <option value="F">{t('common.no', 'No')} (F)</option>
                    <option value="T">{t('common.yes', 'Yes')} (T)</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>{t('ticket.description', 'Description')} <span className={styles.required}>*</span></label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={styles.textarea} rows={6} required />
              </div>

              {isEditing && (
                <div className={styles.formGroup} style={{ marginTop: '20px' }}>
                  <label className={styles.label}>{t('ticket.attachments', 'Add New Attachments')}</label>
                  <FileUploader files={attachments} onFilesChange={(files: File[]) => setAttachments(files)} />
                </div>
              )}

              {isEditing && (
                <div className={styles.actionContainer}>
                  <button 
                    type="submit" 
                    disabled={!isFormValid || isSubmitting} 
                    className={`${styles.submitBtn} ${isFormValid && !isSubmitting ? styles.active : styles.disabled}`}
                  >
                    {isSubmitting 
                      ? '⏳...' 
                      : (isNewTicket ? t('ticket.submit_create', 'Create Ticket') : t('ticket.submit_update', 'Submit & Update Ticket'))
                    }
                  </button>
                </div>
              )}
            </fieldset>
          </form>

          {/* TICKET ATTACHMENTS GALLERY */}
          {existingFiles && existingFiles.some(f => {
            const name = (f.attachment_name || '').toLowerCase();
            const path = (f.url_path || '').toLowerCase();
            return !name.includes('workingdir') && !name.includes('logs.zip') && 
                   !path.includes('workingdir') && !path.includes('logs.zip');
          }) && (
            <div className={styles.attachmentsContainer}>
              <h3 className={styles.attachmentsTitle}>📁 {t('ticket.existing_files', 'Ticket Attachments')}</h3>
              
              <div className={styles.attachmentsList}>
                {existingFiles
                  .filter(file => {
                    const name = (file.attachment_name || '').toLowerCase();
                    const path = (file.url_path || '').toLowerCase();
                    return !name.includes('workingdir') && !name.includes('logs.zip') && 
                           !path.includes('workingdir') && !path.includes('logs.zip');
                  })
                  .map((file, index) => {
                    const displayName = file.attachment_name || 'Unknown_File';
                    const fileUrl = file.url_path || `https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/issues/${ticketId}/attachments/${file.attachment_name}`;
                    const fileType = file.attachment_type;
                  
                    return (
                      <div key={index} className={styles.attachmentItem}>
                        {(fileType === 'IMAGE' || fileType?.includes('IMAGE')) && (
                          <div className={styles.imagePreviewContainer}>
                            <img 
                              src={fileUrl} 
                              alt={displayName} 
                              className={styles.imagePreview} 
                              onClick={() => setLightboxMedia({ url: fileUrl, type: 'IMAGE' })} 
                            />
                            <span className={styles.fileName}>{displayName}</span>
                          </div>
                        )}
                  
                        {fileType === 'VIDEO' && (
                          <div className={styles.fileItemContainer}>
                            <div className={styles.videoPreviewBox} onClick={() => setLightboxMedia({ url: fileUrl, type: fileType })} title="Click to watch video">▶️</div>
                            <span onClick={() => setLightboxMedia({ url: fileUrl, type: fileType })} className={styles.downloadLink} title={displayName}>📺 Watch: {displayName}</span>
                          </div>
                        )}
                  
                        {fileType !== 'IMAGE' && !fileType?.includes('IMAGE') && fileType !== 'VIDEO' && (
                          <div className={styles.fileItemContainer}>
                            <div className={styles.filePreviewBox}>📄</div>
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={styles.downloadLink} title={displayName}>{displayName}</a>
                          </div>
                        )}
                  
                        {isEditing && (
                          <button type="button" onClick={() => handleDeleteAttachment(file.attachment_name || '')} className={styles.deleteBtn} title={t('common.delete', 'Delete file')}>🗑️</button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          
          {/* AUTO FILES */}
          {!isNewTicket && !isCreatedFromWeb && (
            <div className={styles.autoFilesSection} style={{ marginTop: '30px' }}>
              <h4 className={styles.autoFilesTitle}>{t('ticket.auto_collected', 'Auto-collected Context Files:')}</h4>
              <div className={styles.downloadLinksContainer}>
                <div onClick={() => handleFileDownload(workingDirUrl, `Issue_${ticketId}_WorkingDir.zip`)} className={styles.downloadCard} style={{ cursor: 'pointer' }}>
                  <span className={styles.downloadIcon}>📂</span>
                  <div className={styles.downloadText}>
                    <strong>{t('ticket.download_workdir', 'Working Directory')}</strong>
                  </div>
                </div>
                <div onClick={() => handleFileDownload(logsUrl, `Issue_${ticketId}_Logs.zip`)} className={styles.downloadCard} style={{ cursor: 'pointer' }}>
                  <span className={styles.downloadIcon}>📄</span>
                  <div className={styles.downloadText}>
                    <strong>{t('ticket.download_logs', 'System Logs')}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* === RIGHT COLUMN: READ ONLY === */}
        <div className={styles.rightColumn}>
          <div className={`${styles.sidebarCard} ${styles.readOnlyCard}`}>
            <h3 className={styles.cardTitle}>👤 {t('sidebar.user_title', 'User Information')}</h3>
            <div className={styles.cardContent}>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.username', 'Username:')}</span><span className={styles.infoValue}>{userInfo.user_name}</span></div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>{t('sidebar.user.fullname', 'Full Name:')}</span>
                <span className={styles.infoValue}>{userInfo.full_name?.trim() ? userInfo.full_name : (userInfo.user_name || t('common.unknown', 'Unknown'))}</span>
              </div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.role', 'Role:')}</span><span className={styles.infoValue}>{userInfo.current_role || 'N/A'}</span></div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.lab', 'Lab:')}</span><span className={styles.infoValue}>{userInfo.lab || 'N/A'}</span></div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.location', 'Location:')}</span><span className={styles.infoValue}>{userInfo.location || 'N/A'}</span></div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.email', 'Email:')}</span><span className={styles.infoValue}>{userInfo.user_email}</span></div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.created_on', 'Created On:')}</span><span className={styles.infoValue}>{userInfo.created_on || t('common.na', 'N/A')}</span></div>
            </div>
          </div>

          {/* LIMS Context */}
          <div className={`${styles.sidebarCard} ${styles.editableCard}`}>
            <h3 className={styles.cardTitle}>⚙️ {t('sidebar.context_title', 'LIMS Context')}</h3>
            <div className={styles.cardContent}>
              <div className={styles.formGroupSub}>
                <label className={styles.subLabel}>{t('sidebar.context.project', 'Current Project')}</label>
                <input type="text" value={currentContext.current_project} onChange={(e) => setCurrentContext({...currentContext, current_project: e.target.value})} className={styles.subInput} maxLength={25} disabled={!isEditing} />
              </div>
              <div className={styles.formGroupSub}>
                <label className={styles.subLabel}>{t('sidebar.context.batch', 'Current Batch')}</label>
                <input type="text" value={currentContext.current_batch} onChange={(e) => setCurrentContext({...currentContext, current_batch: e.target.value})} className={styles.subInput} maxLength={50} disabled={!isEditing} />
              </div>
              <div className={styles.formGroupSub}>
                <label className={styles.subLabel}>{t('sidebar.context.sample', 'Current Sample')}</label>
                <input type="number" value={currentContext.current_sample} onChange={(e) => setCurrentContext({...currentContext, current_sample: e.target.value})} className={styles.subInput} disabled={!isEditing} />
              </div>
              <div className={styles.formGroupSub}>
                <label className={styles.subLabel}>{t('sidebar.context.analysis', 'Current Analysis')}</label>
                <input type="text" value={currentContext.current_analysis} onChange={(e) => setCurrentContext({...currentContext, current_analysis: e.target.value})} className={styles.subInput} maxLength={20} disabled={!isEditing} />
              </div>
              <div className={styles.formGroupSub}>
                <label className={styles.subLabel}>{t('sidebar.context.variation', 'Analysis Variation')}</label>
                <input type="text" value={currentContext.current_analysis_variation} onChange={(e) => setCurrentContext({...currentContext, current_analysis_variation: e.target.value})} className={styles.subInput} maxLength={100} disabled={!isEditing} />
              </div>
              <div className={styles.formGroupSub}>
                <label className={styles.subLabel}>{t('sidebar.context.customer', 'Current Customer')}</label>
                <input type="text" value={currentContext.current_customer} onChange={(e) => setCurrentContext({...currentContext, current_customer: e.target.value})} className={styles.subInput} maxLength={20} disabled={!isEditing} />
              </div>
            </div>
          </div>
          
          {!isNewTicket && !isCreatedFromWeb && (
            <div className={`${styles.sidebarCard} ${styles.readOnlyCard}`}>
              <h3 className={styles.cardTitle}>🌐 {t('sidebar.network_title', 'Network & Infrastructure')}</h3>
              <div className={styles.cardContent}>
                <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.network.citrix', 'Citrix Session:')}</span><span className={styles.infoValue}>{currentContext.citrix_session || 'N/A'}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.network.ip', 'IP Address:')}</span><span className={styles.infoValue}>{networkInfo.ip_adress || 'N/A'}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.network.workstation', 'Workstation:')}</span><span className={styles.infoValue}>{networkInfo.workstation || 'N/A'}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.network.pc', 'Current PC:')}</span><span className={styles.infoValue}>{networkInfo.current_pc || 'N/A'}</span></div>
                
                <div className={styles.infoBlock}>
                  <details className={styles.accordion}>
                    <summary className={styles.accordionSummary}>🖥️ {t('sidebar.network.show_ipconfig', 'Show IP Configuration logs')}</summary>
                    <div className={styles.codeBlock}>{networkInfo.ip_config || 'N/A'}</div>
                  </details>
                </div>
                
                <div className={styles.infoBlock}>
                  <details className={styles.accordion}>
                    <summary className={styles.accordionSummary}>📡 {t('sidebar.network.show_ping', 'Show Ping 8.8.8.8 results')}</summary>
                    <div className={`${styles.codeBlock} ${styles.pingBlock}`}>{networkInfo.ping || 'N/A'}</div>
                  </details>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              🤖 AI ANALYSIS CARD
          ========================================================= */}
          {!isNewTicket && (
            <div className={`${styles.sidebarCard} ${styles.editableCard}`} style={{ borderColor: '#6554c0', background: '#eae6ff', marginTop: '20px' }}>
              <h3 className={styles.cardTitle} style={{ color: '#403294' }}>🤖 {t('ai.title', 'AI Analysis')}</h3>
              
              <div className={styles.cardContent}>
                {!aiAnalysis ? (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <p style={{ color: '#5e6c84', fontSize: '13px', marginBottom: '15px' }}>
                      {t('ai.no_analysis', 'No AI analysis available yet for this ticket.')}
                    </p>
                    <button 
                      type="button"
                      onClick={fetchAiAnalysis} 
                      disabled={isAiLoading}
                      style={{ background: '#6554c0', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      {isAiLoading ? '⏳...' : `✨ ${t('ai.generate_btn', 'Generate Analysis')}`}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '14px', color: '#172b4d' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span><strong>{t('ai.category', 'Category:')}</strong> <span style={{ background: '#ff5630', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '12px' }}>{aiAnalysis.category}</span></span>
                      <span><strong>{t('ai.confidence', 'Confidence:')}</strong> {aiAnalysis.confidence}</span>
                    </div>
                    
                    <div style={{ background: '#ffffff', padding: '10px', borderRadius: '4px', border: '1px solid #dfe1e6', marginBottom: '15px' }}>
                      <strong style={{ display: 'block', marginBottom: '5px' }}>{t('ai.summary', 'Summary')}</strong>
                      {aiAnalysis.summary}
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                      <strong>{t('ai.similar_tickets', 'Similar Tickets:')}</strong>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                        {aiAnalysis.similar_tickets.map((simId: number) => (
                          <a key={simId} href={`/?id=${simId}`} style={{ background: '#0052cc', color: 'white', padding: '4px 8px', borderRadius: '12px', textDecoration: 'none', fontSize: '12px', fontWeight: 'bold' }}>
                            #{simId}
                          </a>
                        ))}
                      </div>
                    </div>

                    <button 
                      type="button"
                      onClick={() => toast.success("PDF Download simulation")} 
                      style={{ width: '100%', background: '#ffffff', color: '#403294', border: '1px solid #6554c0', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      📄 {t('ai.download_pdf', 'Download PDF Report')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div> 

      {/* =========================================================
          💬 COMMENTS SECTION (FULL WIDTH)
      ========================================================= */}
      {!isNewTicket && !isEditing && (
        <div className={styles.commentsSection} style={{ width: '100%', marginTop: '30px' }}>
          <h3 className={styles.commentsTitle}>💬 {t('ticket.discussion', 'Discussion')}</h3>
          
          <div className={styles.commentsList}>
            {comments.length === 0 ? (
              <p className={styles.noComments}>{t('ticket.no_comments', 'No comment for the moment')}</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id_comment} className={styles.commentBubble}>
                  <div className={styles.commentHeader}>
                    <strong>{comment.full_name}</strong>
                    <span className={styles.commentDate}>{comment.created_on}</span>
                  </div>
                  <div className={styles.commentBody}>
                    {comment.comment_text.split('\n').map((line: string, i: number) => (
                      <React.Fragment key={i}>
                        {line}
                        <br />
                      </React.Fragment>
                    ))}
                  </div>
                  
                  {comment.attachments && comment.attachments.length > 0 && (
                    <div className={styles.commentAttachmentsRow}>
                      {comment.attachments.map((file: any, i: number) => {
                        const fileUrl = file.url_path;
                        const isImg = file.attachment_type === 'IMAGE' || file.attachment_type?.includes('IMAGE');
                        
                        return (
                          <div key={i} className={styles.commentAttachmentPill} onClick={() => {
                            if (isImg || file.attachment_type === 'VIDEO') {
                              setLightboxMedia({ url: fileUrl, type: isImg ? 'IMAGE' : 'VIDEO' })
                            } else {
                              window.open(fileUrl, '_blank')
                            }
                          }}>
                            {isImg ? '🖼️' : file.attachment_type === 'VIDEO' ? '🎥' : '📄'} 
                            <span className={styles.pillText}>{file.attachment_name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className={styles.commentInputArea}>
            <textarea 
              value={newComment} 
              onChange={(e) => setNewComment(e.target.value)} 
              placeholder={t('ticket.type_comment', 'Type your comment here...')} 
              className={styles.commentTextarea}
              rows={3}
            />
            
            <div style={{ marginTop: '10px' }}>
              <FileUploader files={commentFiles} onFilesChange={(files: File[]) => setCommentFiles(files)} />
            </div>

            <button 
              type="button" 
              onClick={handlePostComment} 
              disabled={!newComment.trim() || isPostingComment}
              className={styles.commentBtn}
              style={{ marginTop: '10px' }}
            >
              {isPostingComment ? '⏳...' : t('ticket.button_send', '✉️ Send')}
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          🖼️ OVERLAY LIGHTBOX CLEAN & ROBUST
      ========================================================= */}
      {lightboxMedia && (
        <div 
          className={styles.lightboxOverlay}
          onClick={() => setLightboxMedia(null)}
        >
          <span className={styles.lightboxClose}>&times;</span>

          <div onClick={(e) => e.stopPropagation()}>
            {lightboxMedia.type === 'IMAGE' ? (
              <img
                src={lightboxMedia.url} 
                alt={t('ticket.lightbox_preview', 'Enlarged preview')} 
                className={styles.lightboxMedia} 
              />
            ) : (
              <video 
                src={lightboxMedia.url} 
                controls 
                autoPlay
                className={styles.lightboxMedia} 
              />
            )}
          </div>
        </div>
      )}

    </div>
  )
}

export default TicketForm