/**
 * Decodes the stored JWT token from localStorage to extract user payload information.
 * 
 * @returns {any | null} The decoded token payload containing user details, or null if invalid or missing.
 */
const getDecodedToken = () => {
  const token = localStorage.getItem('nutria_token');
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
};

import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import FileUploader from '../components/FileUploader'
import toast from 'react-hot-toast'
import styles from './IssueForm.module.css'
import { openSafeUrl } from '../utils/security'
import { showConfirmToast } from '../components/Notifications'
import { 
  fetchIssueById, fetchUserMe, createIssue, validateIssue, 
  cancelTicket, closeTicket, fetchIssueComments, addIssueComment, 
  uploadIssueAttachments, uploadCommentAttachments, deleteIssueAttachment, downloadIssueFile 
} from '../api/issues'

/**
 * IssueForm component provides a comprehensive interface for creating new support tickets,
 * viewing existing ticket details, updating contextual LIMS data, and managing conversations
 * through comments and file attachments.
 * 
 * @returns {JSX.Element} The rendered issue management form.
 */
function IssueForm() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const ticketId = searchParams.get('id')
  const isNewTicket = searchParams.get('new') === 'true'
  
  const navigate = useNavigate()

  // Redirect invalid configurations back to the central dashboard
  useEffect(() => {
    if (!ticketId && !isNewTicket) {
      navigate('/dashboard', { replace: true })
    }
  }, [ticketId, isNewTicket, navigate])

  // UI state and view permissions management
  const [isLoading, setIsLoading] = useState(true)
  const [status, setStatus] = useState('PRETICKET') 
  const [isEditing, setIsEditing] = useState(false) 
  const [canEdit, setCanEdit] = useState(false)
  
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Primary ticket detail form field state hooks
  const [title, setTitle] = useState('')
  const [issueType, setIssueType] = useState('')     
  const [criticity, setCriticity] = useState('')     
  const [frequency, setFrequency] = useState('')     
  const [blockingIssue, setBlockingIssue] = useState('F') 
  const [description, setDescription] = useState('')
  
  // File attachments state tracking
  const [attachments, setAttachments] = useState<File[]>([])         
  const [existingFiles, setExistingFiles] = useState<any[]>([])   
  const [isCreatedFromWeb, setIsCreatedFromWeb] = useState(false)  
  
  // Discussion thread and comment states
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [isPostingComment, setIsPostingComment] = useState(false)
  
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, type: string} | null>(null)
  
  // Target user and workspace environment attributes
  const [userInfo, setUserInfo] = useState({
    user_name: '', full_name: '', user_email: '', created_on: '', current_role: '', lab: '', location: '', env: ''
  })

  // LIMS workflow contextual properties
  const [currentContext, setCurrentContext] = useState({
    current_project: '', current_batch: '', current_sample: '', current_analysis: '', current_analysis_variation: '', current_customer: '', citrix_session: ''
  })

  // Network metrics and local client identity
  const [networkInfo, setNetworkInfo] = useState({
    ip_adress: '', ip_config: '', current_pc: '', ping: '',
  })

  /**
   * Fetches comment history associated with the current ticket.
   */
  const loadComments = useCallback(async () => {
    if (!ticketId) return
    try {
      const data = await fetchIssueComments(ticketId)
      if (Array.isArray(data)) setComments(data)
      else if (data && Array.isArray(data.comments)) setComments(data.comments)
      else setComments([]) 
    } catch (error) {
      setComments([]) 
    }
  }, [ticketId])

  /**
   * Orchestrates population of core ticket data, fallback profiles, or creates basic details for a new ticket.
   */
  const loadTicketData = useCallback(async () => {
    setIsLoading(true)
    if (isNewTicket) {
      // Setup edit configuration defaults for target workflow
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
        location: currentUser?.location || t('common.na', 'N/A'),
        env: currentUser?.env || currentUser?.environment || t('common.na', 'N/A')
      }
      
      setUserInfo(backupUser)

      try {
        const profile = await fetchUserMe()
        setUserInfo({
          user_name: profile.user_name || backupUser.user_name,
          full_name: profile.full_name || backupUser.full_name, 
          user_email: profile.user_email || backupUser.user_email,
          created_on: t('common.na', 'N/A'),
          current_role: profile.current_role || backupUser.current_role, 
          lab: profile.lab || backupUser.lab,
          location: profile.location || backupUser.location,
          env: profile.env || profile.environment || backupUser.env
        })
      } catch (error) {
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
      const data = await fetchIssueById(ticketId)
      const currentStatus = data.status || 'PRETICKET'
      setStatus(currentStatus)
      
      setTitle(data.title || '')
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
        current_role: data.current_active_role || data.current_role || '',
        lab: data.creator_lab || '',
        location: data.creator_location || '',
        env: data.env || data.environment || 'N/A'
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
        current_pc: data.current_pc || '',
        ping: data.ping || ''
      })

      // Evaluate role capabilities and locate ownership matches for modification actions
      const currentUser = getDecodedToken()
      if (currentUser && currentStatus !== 'CANCELED' && currentStatus !== 'CLOSED') {
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

    } catch (err: any) {
      if (err.response && (err.response.status === 404 || err.response.status === 403)) {
        toast.error(t('ticket.not_found', 'Ticket not found or access denied.'))
        navigate('/dashboard', { replace: true })
      } else {
        toast.error(t('ticket.error.fetch', 'Error loading ticket data.'))
      }
    } finally {
      setIsLoading(false)
    }
  }, [ticketId, isNewTicket, navigate, t])

  // Triggers initial lookup for ticket state metadata and chat history
  useEffect(() => {
    loadTicketData()
    if (ticketId && !isNewTicket) loadComments()
  }, [loadTicketData, loadComments, ticketId, isNewTicket])

  /**
   * Downloads context log files or working directories related to diagnostics.
   * 
   * @param {'working_dir' | 'logs'} type The file target type.
   * @param {string} defaultFilename Fallback filename for downloading.
   */
  const handleFileDownload = async (type: 'working_dir' | 'logs', defaultFilename: string) => {
    if (!ticketId) return
    try {
      const data = await downloadIssueFile(ticketId, type)
      if (data.file_path) {
        const link = document.createElement('a')
        link.href = data.file_path
        link.setAttribute('download', data.file_name || defaultFilename)
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        link.remove()
      } else {
        toast.error(t('ticket.download_error', 'File link not found.'))
      }
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        toast.error(t('ticket.error.file_too_large', 'Error: The logs/working directory file is too large to be uploaded by LabWare.'));
      } else {
        toast.error(t('ticket.download_error', 'Failed to download file.'));
      }
    }
  }

  const isFormValid = title.trim() !== '' && issueType !== '' && frequency !== '' && description.trim() !== ''

  /**
   * Event handler that submits completed fields to update an existing issue or register a new ticket.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid || isSubmitting) return

    setIsSubmitting(true)

    const payloadData = {
      title, issue_type: issueType, criticity: 'MEDIUM', frequency, blocking_issue: blockingIssue, description,
      current_project: currentContext.current_project, current_batch: currentContext.current_batch,
      current_sample: currentContext.current_sample ? Number(currentContext.current_sample) : null,
      current_analysis: currentContext.current_analysis, current_analysis_variation: currentContext.current_analysis_variation,
      current_customer: currentContext.current_customer
    }

    try {
      let targetTicketId = ticketId;
      if (isNewTicket) {
        const responseData = await createIssue(payloadData)
        targetTicketId = responseData.id_issue
      } else {
        await validateIssue(ticketId!, payloadData)
      }

      // Handle raw secondary attachment uploads if added during view interaction
      if (attachments.length > 0 && targetTicketId) {
        const formData = new FormData()
        attachments.forEach((file) => formData.append('file', file))
        try {
          await uploadIssueAttachments(targetTicketId, formData)
        } catch (uploadError) {
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
      
      if (isNewTicket) {
        navigate('/dashboard')
      } else {
        loadTicketData()
        loadComments()
      }
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail || t('ticket.error.submit_failed', 'An error occurred during submission.')
      toast.error(t('common.error_detail', 'Error: {{detail}}', { detail: errorDetail }))
    } finally {
      setIsSubmitting(false) 
    }
  }

  /**
   * Submits request to set ticket status configuration to canceled state.
   */
  const executeCancelTicket = async () => {
    if (!ticketId) return
    try {
      await cancelTicket(ticketId)
      setStatus('CANCELED')
      setIsEditing(false)
      setCanEdit(false) 
      toast.success(t('ticket.cancel_success', 'Ticket successfully canceled.'))
    } catch (err: any) {
      const detail = err.response?.data?.detail || t('ticket.error.network_cancel', 'Network error while canceling ticket.')
      toast.error(t('common.error_detail', 'Error: {{detail}}', { detail }))
    }
  }

  /**
   * Prompts user with a configuration alert before executing the ticket cancellation request.
   */
  const handleCancelTicket = () => {
    showConfirmToast({
      message: t('ticket.confirm_cancel', 'Are you sure you want to cancel this ticket? This action cannot be undone.'), 
      confirmText: t('common.yes_confirm', 'Yes, confirm'), 
      cancelText: t('common.no_cancel', 'No, cancel'), 
      onConfirm: executeCancelTicket
    })
  }

  /**
   * Submits state validation changes for resolution tracking or formal closure.
   */
  const executeCloseTicket = async (targetStatus: 'ACT KNOWLEDGE' | 'CLOSED') => {
    if (!ticketId) return
    try {
      await closeTicket(ticketId, targetStatus)
      setStatus(targetStatus)
      setIsEditing(false)
      setCanEdit(false)
      
      const successMessage = targetStatus === 'ACT KNOWLEDGE'
        ? t('ticket.resolve_success', 'Ticket successfully acknowledged.')
        : t('ticket.close_success', 'Ticket successfully closed.')
      toast.success(successMessage)
    } catch (err: any) {
      const detail = err.response?.data?.detail || t('ticket.error.network_status', 'Network error while changing status.')
      toast.error(t('common.error_detail', 'Error: {{detail}}', { detail }))
    }
  }

  /**
   * Standardized status handler wrapping status change requests with a safety check dialog.
   */
  const handleCloseTicket = (targetStatus: 'ACT KNOWLEDGE' | 'CLOSED') => {
    const confirmMessage = targetStatus === 'ACT KNOWLEDGE' 
      ? t('ticket.confirm_resolve', 'Are you sure you want to acknowledge this ticket?')
      : t('ticket.confirm_close', 'Are you sure you want to close this ticket?');
    
    showConfirmToast({
      message: confirmMessage, 
      confirmText: t('common.yes_confirm', 'Yes, confirm'), 
      cancelText: t('common.no_cancel', 'No, cancel'), 
      onConfirm: () => executeCloseTicket(targetStatus)
    })
  }

  /**
   * Instructs LIMS storage interface to discard a specific media or document file.
   */
  const executeDeleteAttachment = async (filename: string) => {
    if (!ticketId) return
    try {
      await deleteIssueAttachment(ticketId, filename)
      setExistingFiles(prev => prev.filter(f => f.attachment_name !== filename));
      toast.success(t('ticket.success.file_deleted', 'File deleted successfully.'));
    } catch (err: any) {
      const detail = err.response?.data?.detail || t('ticket.error.network_delete', 'Network error while deleting file.')
      toast.error(t('common.error_detail', 'Error: {{detail}}', { detail }));
    }
  }

  /**
   * Intercepts media removal click sequence with structured warning alerts.
   */
  const handleDeleteAttachment = (filename: string) => {
    showConfirmToast({
      message: t('ticket.confirm_delete_file', 'Are you sure you want to delete this file?'), 
      confirmText: t('common.yes_confirm', 'Yes, confirm'), 
      cancelText: t('common.no_cancel', 'No, cancel'), 
      onConfirm: () => executeDeleteAttachment(filename)
    })
  };

  /**
   * Resets active configurations and toggles the dynamic editing mode off.
   */
  const handleCancelEdit = () => {
    if (isNewTicket) navigate('/dashboard');
    else {
      setIsEditing(false);
      loadTicketData();
    }
  };

  /**
   * Commits the composed discussion thread comment, linking pending file binaries where configured.
   */
  const handlePostComment = async () => {
    if (!newComment.trim() || isPostingComment || !ticketId) return
    setIsPostingComment(true)

    try {
      const data = await addIssueComment(ticketId, newComment)
      const newCommentId = data.id_comment

      if (commentFiles.length > 0 && newCommentId) {
        const formData = new FormData()
        commentFiles.forEach((file) => formData.append('file', file))
        await uploadCommentAttachments(ticketId, newCommentId, formData)
      }

      setNewComment('') 
      setCommentFiles([]) 
      loadComments()   
    } catch (err: any) {
      const detail = err.response?.data?.detail || t('ticket.error.network_comment', 'Network error while posting comment.')
      toast.error(t('common.error_detail', 'Error: {{detail}}', { detail }))
    } finally {
      setIsPostingComment(false)
    }
  }

  // Render initial standard loader overlay
  if (isLoading) {
    return <div className={styles.loading}>{t('common.loading', 'Loading ticket data...')}</div>
  }
  
  return (
    <div className={styles.pageContainer}>
      
      {/* Top action layout containing dynamic flow settings, states and state actions */}
      <div className={`${styles.statusBanner} ${styles[status.toLowerCase().replace(' ', '_')]}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className={styles.statusInfo}>
            <span className={styles.statusLabel}>{t('ticket.current_status', 'Current Status:')}</span>
            <span className={styles.statusBadge}>{status}</span>
          </div>
          {ticketId && <span className={styles.ticketIdText}>{t('ticket.lims_id', 'LIMS ID:')} #{ticketId}</span>}
        </div>
        
        {canEdit && (
          <div style={{ display: 'flex', gap: '10px' }}>
            {!isEditing && status !== 'CLOSED' && status !== 'CANCELED' && (
              <>
                {status !== 'ACT KNOWLEDGE' && (
                  <button type="button" onClick={() => handleCloseTicket('ACT KNOWLEDGE')} style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #36b37e', background: '#e3fcef', color: '#006644', cursor: 'pointer', fontWeight: 'bold' }}>
                    ✅ {t('ticket.act_knowledge', 'Act Knowledge')}
                  </button>
                )}
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

      {/* Main split viewport split between primary form fields and secondary sidebar details */}
      <div className={styles.gridContainer}>
        
        {/* Left container displaying description input structures and file lists */}
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

              <div className={styles.row2}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{t('ticket.issue_type', 'Issue Type')} <span className={styles.required}>*</span></label>
                  <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className={styles.select} required>
                    <option value="">-- {t('common.select', 'Select')} --</option>
                    <option value="SLOW">{t('issues.SLOW', 'SLOW')}</option>
                    <option value="CRASH">{t('issues.CRASH', 'CRASH')}</option>
                    <option value="ILLOGICAL">{t('issues.ILLOGICAL', 'ILLOGICAL')}</option>
                    <option value="OTHER">{t('issues.OTHER', 'OTHER')}</option>
                  </select>
                </div>
              </div>

              <div className={styles.row2}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{t('ticket.frequency', 'Frequency')} <span className={styles.required}>*</span></label>
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={styles.select} required>
                    <option value="">-- {t('common.select', 'Select')} --</option>
                    <option value="ONE_TIME">{t('ticket.frequency_one_time', 'ONE_TIME')}</option>
                    <option value="LOW">{t('ticket.frequency_low', 'LOW')}</option>
                    <option value="MEDIUM">{t('ticket.frequency_medium', 'MEDIUM')}</option>
                    <option value="HIGH">{t('ticket.frequency_high', 'HIGH')}</option>
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

          {/* Existing uploaded media and diagnostics preview blocks */}
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
                    const displayName = file.attachment_name || t('ticket.unknown_file', 'Unknown_File');
                    const fileUrl = file.url_path;
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
                            <div className={styles.videoPreviewBox} onClick={() => setLightboxMedia({ url: fileUrl, type: fileType })} title={t('ticket.click_to_watch', 'Click to watch video')}>▶️</div>
                            <span onClick={() => setLightboxMedia({ url: fileUrl, type: fileType })} className={styles.downloadLink} title={displayName}>📺 {t('ticket.watch', 'Watch:')} {displayName}</span>
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
          
          {/* Automated diagnostic data card sections */}
          {!isNewTicket && !isCreatedFromWeb && (
            <div className={styles.autoFilesSection} style={{ marginTop: '30px' }}>
              <h4 className={styles.autoFilesTitle}>{t('ticket.auto_collected', 'Auto-collected Context Files:')}</h4>
              <div className={styles.downloadLinksContainer}>
                <div onClick={() => handleFileDownload('working_dir', `Issue_${ticketId}_WorkingDir.zip`)} className={styles.downloadCard} style={{ cursor: 'pointer' }}>
                  <span className={styles.downloadIcon}>📂</span>
                  <div className={styles.downloadText}>
                    <strong>{t('ticket.download_workdir', 'Working Directory')}</strong>
                  </div>
                </div>
                <div onClick={() => handleFileDownload('logs', `Issue_${ticketId}_Logs.zip`)} className={styles.downloadCard} style={{ cursor: 'pointer' }}>
                  <span className={styles.downloadIcon}>📄</span>
                  <div className={styles.downloadText}>
                    <strong>{t('ticket.download_logs', 'System Logs')}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Right sidebar tracking organizational identity parameters */}
        <div className={styles.rightColumn}>
          <div className={`${styles.sidebarCard} ${styles.readOnlyCard}`}>
            <h3 className={styles.cardTitle}>👤 {t('sidebar.user_title', 'User Information')}</h3>
            <div className={styles.cardContent}>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.username', 'Username:')}</span><span className={styles.infoValue}>{userInfo.user_name}</span></div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>{t('sidebar.user.fullname', 'Full Name:')}</span>
                <span className={styles.infoValue}>{userInfo.full_name?.trim() ? userInfo.full_name : (userInfo.user_name || t('common.unknown', 'Unknown'))}</span>
              </div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.role', 'Role:')}</span><span className={styles.infoValue}>{userInfo.current_role || t('common.na', 'N/A')}</span></div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.lab', 'Lab:')}</span><span className={styles.infoValue}>{userInfo.lab || t('common.na', 'N/A')}</span></div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.location', 'Location:')}</span><span className={styles.infoValue}>{userInfo.location || t('common.na', 'N/A')}</span></div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.env', 'Environment:')}</span><span className={styles.infoValue}>{userInfo.env || t('common.na', 'N/A')}</span></div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.email', 'Email:')}</span><span className={styles.infoValue}>{userInfo.user_email}</span></div>
              <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.user.created_on', 'Created On:')}</span><span className={styles.infoValue}>{userInfo.created_on || t('common.na', 'N/A')}</span></div>
            </div>
          </div>

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
          
          {/* Diagnostic diagnostic lists regarding routing nodes */}
          {!isNewTicket && !isCreatedFromWeb && (
            <div className={`${styles.sidebarCard} ${styles.readOnlyCard}`}>
              <h3 className={styles.cardTitle}>🌐 {t('sidebar.network_title', 'Network & Infrastructure')}</h3>
              <div className={styles.cardContent}>
                <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.network.citrix', 'Citrix Session:')}</span><span className={styles.infoValue}>{currentContext.citrix_session || t('common.na', 'N/A')}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.network.ip', 'IP Address:')}</span><span className={styles.infoValue}>{networkInfo.ip_adress || t('common.na', 'N/A')}</span></div>
                <div className={styles.infoRow}><span className={styles.infoLabel}>{t('sidebar.network.pc', 'Current PC:')}</span><span className={styles.infoValue}>{networkInfo.current_pc || t('common.na', 'N/A')}</span></div>
                
                <div className={styles.infoBlock}>
                  <details className={styles.accordion}>
                    <summary className={styles.accordionSummary}>🖥️ {t('sidebar.network.show_ipconfig', 'Show IP Configuration logs')}</summary>
                    <div className={styles.codeBlock}>{networkInfo.ip_config || t('common.na', 'N/A')}</div>
                  </details>
                </div>
                
                <div className={styles.infoBlock}>
                  <details className={styles.accordion}>
                    <summary className={styles.accordionSummary}>📡 {t('sidebar.network.show_ping', 'Show Ping 8.8.8.8 results')}</summary>
                    <div className={`${styles.codeBlock} ${styles.pingBlock}`}>{networkInfo.ping || t('common.na', 'N/A')}</div>
                  </details>
                </div>
              </div>
            </div>
          )}
        </div>
      </div> 

      {/* Structured dialog discussion flow interface */}
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
                              openSafeUrl(fileUrl);
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

      {/* Lightbox asset preview modal rendering layer */}
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

export default IssueForm