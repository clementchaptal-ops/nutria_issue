import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { openSafeUrl } from '../utils/security';
import FileUploader from '../components/FileUploader'
import { 
  fetchRegroupement, 
  closeRegroupement, 
  updateRegroupement,
  fetchRegroupementComments, 
  addRegroupementComment, 
  uploadRegroupementCommentAttachments, 
  uploadRegroupementAttachments, 
  deleteRegroupementAttachment 
} from '../api/regroupements'
import styles from './IssueForm.module.css'

function RegroupementDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const regroupementId = Number(id)

  const [regroupement, setRegroupement] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(true)
  
  // Edit Mode state
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [editFormData, setEditFormData] = useState({ title: '', description: '', ssp_ticket: '' })
  
  // Attachments & Comments states
  const [attachments, setAttachments] = useState<File[]>([])
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const [isPostingComment, setIsPostingComment] = useState(false)
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, type: string} | null>(null)

  const loadData = async () => {
    if (!regroupementId) return
    try {
      const res = await fetchRegroupement(regroupementId)
      setRegroupement(res.data)
      setEditFormData({
        title: res.data.title || '',
        description: res.data.description || '',
        ssp_ticket: res.data.ssp_ticket || ''
      })
      await fetchComments()
    } catch (err) {
      toast.error(t('regroupements.error.load_failed', 'Failed to load regroupement details.'))
    } finally {
      setLoading(false)
    }
  }

  const fetchComments = async () => {
    if (!regroupementId) return
    try {
      const res = await fetchRegroupementComments(regroupementId)
      if (Array.isArray(res.data)) setComments(res.data)
      else setComments([])
    } catch (err) {
      setComments([])
    }
  }

  useEffect(() => {
    loadData()
  }, [regroupementId])

  const handleClose = async () => {
    if (!window.confirm(t('regroupements.confirm_close', 'Are you sure you want to close this regroupement?'))) return
    try {
      await closeRegroupement(regroupementId)
      toast.success(t('regroupements.closed_success', 'Regroupement closed successfully!'))
      loadData()
    } catch (err) {
      toast.error(t('regroupements.error.close_failed', 'Failed to close regroupement.'))
    }
  }

  // Save changes handler
  const handleSaveChanges = async () => {
    try {
      await updateRegroupement(regroupementId, editFormData)
      
      // Upload new attachments if present
      if (attachments.length > 0) {
        const formData = new FormData()
        attachments.forEach((file) => formData.append('files', file))
        await uploadRegroupementAttachments(regroupementId, formData)
      }
      
      toast.success(t('regroupements.success_updated', 'Changes saved successfully!'))
      setIsEditing(false)
      setAttachments([]) // Reset uploader state
      loadData()
    } catch (err) {
      toast.error(t('regroupements.error.update_failed', 'Error while saving changes.'))
    }
  }

  const handleDeleteAttachment = async (filename: string) => {
    if (!window.confirm(t('ticket.confirm_delete_file', 'Are you sure you want to delete this file?'))) return
    try {
      await deleteRegroupementAttachment(regroupementId, filename)
      toast.success(t('ticket.success.file_deleted', 'File deleted successfully.'))
      loadData()
    } catch (err) {
      toast.error(t('ticket.error.network_delete', 'Error deleting file.'))
    }
  }

  const handlePostComment = async () => {
    if (!newComment.trim() || isPostingComment) return
    setIsPostingComment(true)
    try {
      const res = await addRegroupementComment(regroupementId, newComment)
      const commentId = res.data.id_comment

      if (commentFiles.length > 0 && commentId) {
        const formData = new FormData()
        commentFiles.forEach((f) => formData.append('files', f))
        await uploadRegroupementCommentAttachments(regroupementId, commentId, formData)
      }

      setNewComment('')
      setCommentFiles([])
      fetchComments()
    } catch (err) {
      toast.error(t('ticket.error.network_comment', 'Error posting comment.'))
    } finally {
      setIsPostingComment(false)
    }
  }

  if (loading) {
    return <div className={styles.loading}>{t('common.loading', 'Loading regroupement data...')}</div>
  }

  if (!regroupement) {
    return <div className={styles.pageContainer}><p>{t('regroupements.not_found', 'Regroupement not found.')}</p></div>
  }

  const sspUrl = regroupement.ssp_ticket ? `https://it-ssp.mxns.com/a/tickets/${regroupement.ssp_ticket}` : null

  return (
    <div className={styles.pageContainer}>
      
      {/* STATUS BANNER & ACTION BUTTONS */}
      <div className={`${styles.statusBanner} ${regroupement.status === 'CLOSED' ? styles.closed : styles.in_progress}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button onClick={() => navigate('/regroupements')} style={{ background: 'none', border: 'none', color: '#0052cc', cursor: 'pointer', fontWeight: 'bold' }}>
            ← {t('common.back', 'Back')}
          </button>
          <div className={styles.statusInfo}>
            <span className={styles.statusLabel}>{t('ticket.current_status', 'Current Status:')}</span>
            <span className={styles.statusBadge}>{regroupement.status}</span>
          </div>
          <span className={styles.ticketIdText}>{t('regroupements.group_id_badge', 'GROUP')} #{regroupement.id_regroupment}</span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {/* EDIT BUTTON */}
          {!isEditing && regroupement.status !== 'CLOSED' && (
            <>
              <button type="button" onClick={() => setIsEditing(true)} style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #0052cc', background: '#fff', color: '#0052cc', cursor: 'pointer', fontWeight: 'bold' }}>
                ✏️ {t('ticket.edit', 'Edit')}
              </button>
              <button type="button" onClick={handleClose} style={{ padding: '6px 16px', borderRadius: '4px', border: 'none', background: '#de350b', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>
                🔒 {t('regroupements.close_button', 'Close Regroupement')}
              </button>
            </>
          )}

          {/* SAVE / CANCEL BUTTONS (When in Edit mode) */}
          {isEditing && (
            <>
              <button type="button" onClick={() => { setIsEditing(false); setAttachments([]); }} style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #42526e', background: '#fff', color: '#42526e', cursor: 'pointer', fontWeight: 'bold' }}>
                ❌ {t('common.cancel', 'Cancel')}
              </button>
              <button type="button" onClick={handleSaveChanges} style={{ padding: '6px 16px', borderRadius: '4px', border: 'none', background: '#0052cc', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>
                💾 {t('common.save', 'Save Changes')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className={styles.gridContainer}>
        {/* =========================================
            LEFT COLUMN: DETAILS & ATTACHMENTS 
            ========================================= */}
        <div className={styles.leftColumn}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            
            {/* TITLE */}
            {isEditing ? (
              <div className={styles.formGroup} style={{ marginBottom: '15px' }}>
                <label className={styles.label}>{t('form.title', 'Title')} <span className={styles.required}>*</span></label>
                <input 
                  type="text" 
                  className={styles.input} 
                  value={editFormData.title} 
                  onChange={(e) => setEditFormData({...editFormData, title: e.target.value})} 
                />
              </div>
            ) : (
              <h2 className={styles.sectionTitle}>📁 {regroupement.title}</h2>
            )}
            
            <p style={{ color: '#7a869a', fontSize: '13px', marginBottom: '20px' }}>
              {t('regroupements.created_by_info', 'Created by {{user}} on {{date}}', { user: regroupement.created_by, date: regroupement.created_on })}
            </p>

            {/* DESCRIPTION */}
            <div className={styles.formGroup}>
              <label className={styles.label}>{t('form.description', 'Description')}</label>
              {isEditing ? (
                <textarea 
                  rows={5} 
                  className={styles.textarea} 
                  value={editFormData.description} 
                  onChange={(e) => setEditFormData({...editFormData, description: e.target.value})} 
                />
              ) : (
                <div style={{ background: '#f4f5f7', padding: '12px', borderRadius: '4px', whiteSpace: 'pre-wrap', color: '#172b4d' }}>
                  {regroupement.description}
                </div>
              )}
            </div>

            {/* SSP TICKET */}
            <div className={styles.formGroup} style={{ marginTop: '15px' }}>
              <label className={styles.label}>{t('form.ssp_ticket', 'SSP Ticket')}</label>
              {isEditing ? (
                <input 
                  type="text" 
                  className={styles.input} 
                  value={editFormData.ssp_ticket} 
                  onChange={(e) => setEditFormData({...editFormData, ssp_ticket: e.target.value})} 
                />
              ) : (
                sspUrl ? (
                  <a href={sspUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0052cc', fontWeight: 'bold', fontSize: '15px' }}>
                    #{regroupement.ssp_ticket} 🔗
                  </a>
                ) : <span style={{ color: '#7a869a' }}>-</span>
              )}
            </div>
          </div>

          {/* ATTACHMENTS GALLERY */}
          <div className={styles.attachmentsContainer} style={{ marginTop: '20px' }}>
            <h3 className={styles.attachmentsTitle}>📁 {t('ticket.existing_files', 'Regroupement Attachments')}</h3>

            {regroupement.attachments && regroupement.attachments.length > 0 ? (
              <div className={styles.attachmentsList}>
                {regroupement.attachments.map((file: any, index: number) => {
                  const displayName = file.attachment_name;
                  const fileUrl = file.url_path;
                  const fileType = file.attachment_type;
                  const isImg = fileType === 'IMAGE' || fileType?.includes('IMAGE');

                  return (
                    <div key={index} className={styles.attachmentItem}>
                      {isImg && (
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
                          <div className={styles.videoPreviewBox} onClick={() => setLightboxMedia({ url: fileUrl, type: 'VIDEO' })}>▶️</div>
                          <span onClick={() => setLightboxMedia({ url: fileUrl, type: 'VIDEO' })} className={styles.downloadLink}>📺 {displayName}</span>
                        </div>
                      )}

                      {!isImg && fileType !== 'VIDEO' && (
                        <div className={styles.fileItemContainer}>
                          <div className={styles.filePreviewBox}>📄</div>
                          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={styles.downloadLink}>{displayName}</a>
                        </div>
                      )}

                      {/* Deletion allowed only in Edit Mode */}
                      {isEditing && (
                        <button type="button" onClick={() => handleDeleteAttachment(file.attachment_name)} className={styles.deleteBtn}>🗑️</button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ color: '#7a869a', fontSize: '13px', marginLeft: '10px' }}>{t('regroupements.no_attachments', 'No attachments uploaded.')}</p>
            )}

            {/* MAIN FILE UPLOADER (Visible ONLY in Edit Mode) */}
            {isEditing && (
              <div style={{ marginTop: '20px', padding: '15px', border: '1px dashed #0052cc', borderRadius: '4px', background: '#e9f2ff' }}>
                <label className={styles.label} style={{ color: '#0052cc' }}>➕ {t('ticket.attachments', 'Add New Attachments')}</label>
                <FileUploader files={attachments} onFilesChange={(files: File[]) => setAttachments(files)} />
                <small style={{ display: 'block', marginTop: '10px', color: '#7a869a' }}>
                  {t('regroupements.uploader_help', 'These files will be uploaded when clicking the "Save Changes" button above.')}
                </small>
              </div>
            )}
          </div>
        </div>

        {/* =========================================
            RIGHT COLUMN: LINKED ISSUES 
            ========================================= */}
        <div className={styles.rightColumn}>
          <div className={`${styles.sidebarCard} ${styles.readOnlyCard}`}>
            <h3 className={styles.cardTitle}>📋 {t('regroupements.linked_issues', 'Linked Issues')} ({regroupement.linked_issues?.length || 0})</h3>
            <div className={styles.cardContent}>
              {(!regroupement.linked_issues || regroupement.linked_issues.length === 0) ? (
                <p style={{ color: '#7a869a', fontSize: '13px' }}>{t('regroupements.no_issues_linked', 'No issues linked yet.')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {regroupement.linked_issues.map((issue: any) => (
                    <div 
                      key={issue.id_issue} 
                      onClick={() => navigate(`/?id=${issue.id_issue}`)}
                      style={{ padding: '10px', border: '1px solid #dfe1e6', borderRadius: '4px', cursor: 'pointer', background: '#fafbfc' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#0052cc' }}>#{issue.id_issue}</strong>
                        <span style={{ background: '#e3fcef', color: '#006644', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                          {issue.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', marginTop: '4px', color: '#172b4d' }}>{issue.title}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================
          DISCUSSION / COMMENTS SECTION 
          Visible ONLY when NOT in Edit Mode
          ========================================= */}
      {!isEditing && (
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
                        {line}<br />
                      </React.Fragment>
                    ))}
                  </div>

                  {comment.attachments && comment.attachments.length > 0 && (
                    <div className={styles.commentAttachmentsRow}>
                      {comment.attachments.map((file: any, i: number) => {
                        const fileUrl = file.url_path
                        const isImg = file.attachment_type === 'IMAGE' || file.attachment_type?.includes('IMAGE')
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

          {regroupement.status !== 'CLOSED' && (
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
          )}
        </div>
      )}

      {/* =========================================
          LIGHTBOX OVERLAY FOR IMAGES AND VIDEOS 
          ========================================= */}
      {lightboxMedia && (
        <div className={styles.lightboxOverlay} onClick={() => setLightboxMedia(null)}>
          <span className={styles.lightboxClose}>&times;</span>
          <div onClick={(e) => e.stopPropagation()}>
            {lightboxMedia.type === 'IMAGE' ? (
              <img src={lightboxMedia.url} alt={t('ticket.lightbox_preview', 'Enlarged preview')} className={styles.lightboxMedia} />
            ) : (
              <video src={lightboxMedia.url} controls autoPlay className={styles.lightboxMedia} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default RegroupementDetail