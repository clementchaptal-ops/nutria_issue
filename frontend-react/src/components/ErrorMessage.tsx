import React from 'react'
import styles from './ErrorMessage.module.css' // <-- On importe le CSS sous forme d'objet !

interface ErrorMessageProps {
  message: string | null
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  if (!message) return null

  return (
    <div className={styles.alert}>
      <span>{message}</span>
    </div>
  )
}

export default ErrorMessage