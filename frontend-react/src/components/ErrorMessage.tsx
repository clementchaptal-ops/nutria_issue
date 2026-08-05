import React from 'react'
import styles from './ErrorMessage.module.css'

/** Properties for the ErrorMessage component. */
interface ErrorMessageProps {
  message: string | null
}

/** Renders an alert message banner if an error message is provided. */
const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  if (!message) return null

  return (
    <div className={styles.alert}>
      <span>{message}</span>
    </div>
  )
}

export default ErrorMessage