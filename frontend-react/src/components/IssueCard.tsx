import React from 'react'
import { useTranslation } from 'react-i18next'
import styles from './IssueCard.module.css'

/**
 * Properties expected by the IssueCard component.
 */
interface IssueCardProps {
  issue: {
    /** The unique identifier for the issue. */
    id_issue: number;
    /** Summary or title of the issue. */
    title: string;
    /** The categorization type of the issue. */
    issue_type: string;
    /** Current workflow status of the issue. */
    status: string;
    /** The system username of the reporter. */
    user_name: string;
    /** The full name of the reporter. */
    full_name: string; 
    /** Target country or region code. */
    country: string;
    /** Formatted date string representing when the issue was created. */
    creation_date: string;
  }
}

/**
 * A presentation component that displays issue metadata and status information
 * in a standardized, structured card format.
 *
 * @component
 */
const IssueCard: React.FC<IssueCardProps> = ({ issue }) => {
  // Initialize translation hook for multi-language support
  const { t } = useTranslation() 

  return (
    <div className={styles.card}>
      {/* Primary issue information area */}
      <div className={styles.mainInfo}>
        <div className={styles.topRow}>
          <span className={styles.ticketId}>NUTRIA-{issue.id_issue}</span>
          <span className={styles.badgeCountry}>{issue.country}</span>
        </div>
        <h3 className={styles.title}>{issue.title}</h3>
        {/* Attribution and creation timestamp metadata */}
        <span className={styles.meta}>
          {t('ticket.reported_by', 'Reported by')} <strong>{issue.full_name}</strong> ({issue.user_name}) • {issue.creation_date}
        </span>
      </div>
      
      {/* Badges container representing classification and current workflow status */}
      <div className={styles.badges}>
        <span className={`${styles.badgeType} ${styles[issue.issue_type] || ''}`}>
          {issue.issue_type}
        </span>
        <span className={`${styles.badgeStatus} ${styles[issue.status] || ''}`}>
          {issue.status}
        </span>
      </div>
    </div>
  )
}

export default IssueCard