import React from 'react'
import styles from './TicketCard.module.css'

interface TicketCardProps {
  ticket: {
    id_issue: number;
    title: string;
    issue_type: string;
    status: string;
    user_name: string;
    full_name: string; // <-- Ajouté
    country: string;
    creation_date: string;
  }
}

const TicketCard: React.FC<TicketCardProps> = ({ ticket }) => {
  return (
    <div className={styles.card}>
      <div className={styles.mainInfo}>
        <div className={styles.topRow}>
          <span className={styles.ticketId}>NUTRIA-{ticket.id_issue}</span>
          <span className={styles.badgeCountry}>{ticket.country}</span>
        </div>
        <h3 className={styles.title}>{ticket.title}</h3>
        <span className={styles.meta}>
          Reported by <strong>{ticket.full_name}</strong> ({ticket.user_name}) • {ticket.creation_date}
        </span>
      </div>
      
      <div className={styles.badges}>
        <span className={`${styles.badgeType} ${styles[ticket.issue_type] || ''}`}>
          {ticket.issue_type}
        </span>
        <span className={`${styles.badgeStatus} ${styles[ticket.status] || ''}`}>
          {ticket.status}
        </span>
      </div>
    </div>
  )
}

export default TicketCard