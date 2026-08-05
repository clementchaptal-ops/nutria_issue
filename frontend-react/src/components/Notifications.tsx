import toast from 'react-hot-toast'

/** Properties required for the confirmation toast. */
interface ShowConfirmToastProps {
  message: string
  confirmText: string
  cancelText: string
  onConfirm: () => void
}

/** Displays a toast notification requiring user confirmation before proceeding. */
export const showConfirmToast = ({
  message,
  confirmText,
  cancelText,
  onConfirm
}: ShowConfirmToastProps) => {
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
  ), { duration: 6000 })
}