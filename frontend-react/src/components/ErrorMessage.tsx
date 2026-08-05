import React from 'react'
import styles from './ErrorMessage.module.css'

/**
 * Props for the ErrorMessage component.
 */
interface ErrorMessageProps {
  /** The error message text to be displayed, or null if no error exists. */
  message: string | null
}

/**
 * ErrorMessage component that displays an alert banner with a message.
 * If the message prop is null or empty, the component renders nothing.
 */
const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  // Guard clause to prevent rendering if there is no error message
  if (!message) return null

  // Render the styled alert container with the error message text
  return (
    <div className={styles.alert}>
      <span>{message}</span>
    </div>
  )
}

export default ErrorMessage