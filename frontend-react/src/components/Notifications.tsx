import toast from 'react-hot-toast'

/**
 * Props configuration for the custom confirmation toast notification.
 */
interface ShowConfirmToastProps {
  message: string
  confirmText: string
  cancelText: string
  onConfirm: () => void
}

/**
 * Triggers a customizable confirmation toast utilizing react-hot-toast.
 * Displays an explicit message and action buttons for confirmation or cancellation.
 *
 * @param props - The properties configuration object for the toast.
 */
export const showConfirmToast = ({
  message,
  confirmText,
  cancelText,
  onConfirm
}: ShowConfirmToastProps) => {
  // Render a custom interactive toast layout containing the message and action triggers
  toast((t) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span style={{ fontSize: '14px', fontWeight: 500 }}>{message}</span>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={() => toast.dismiss(t.id)}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {cancelText}
        </button>
        <button
          onClick={() => {
            // Dismiss the active toast immediately and invoke the confirmation callback
            toast.dismiss(t.id)
            onConfirm()
          }}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: 'none',
            background: '#de350b',
            color: '#fff',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {confirmText}
        </button>
      </div>
    </div>
  ), { duration: 6000 }) // Keep the toast visible for a sufficient grace period
}