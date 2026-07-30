import React from 'react'
import styles from './IssueCard.module.css'

interface IssueCardProps {
  issue: {
    id_issue: number;
    title: string;
    issue_type: string;
    status: string;
    user_name: string;
    full_name: string; 
    country: string;
    creation_date: string;
  }
}

const IssueCard: React.FC<IssueCardProps> = ({ issue }) => {
  return (
    <div className={styles.card}>
      <div className={styles.mainInfo}>
        <div className={styles.topRow}>
          <span className={styles.ticketId}>NUTRIA-{issue.id_issue}</span>
          <span className={styles.badgeCountry}>{issue.country}</span>
        </div>
        <h3 className={styles.title}>{issue.title}</h3>
        <span className={styles.meta}>
          Reported by <strong>{issue.full_name}</strong> ({issue.user_name}) • {issue.creation_date}
        </span>
      </div>
      
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