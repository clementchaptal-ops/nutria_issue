import React from 'react'

/**
 * Properties configuration for the StatCard component.
 */
type StatCardProps = {
  /** The descriptive text label for the metric. */
  label: string
  /** The numeric value to display. */
  count: number
  /** The theme color used for the count text and active border shadow. */
  color: string
  /** Indicates whether the card is in an active/selected state. */
  isActive: boolean
  /** Callback triggered upon clicking the card. */
  onClick: () => void
}

/**
 * An interactive card component designed to display a specific metric count and label.
 * It highlights itself visually using a colored border shadow when active.
 */
const StatCard: React.FC<StatCardProps> = ({ label, count, color, isActive, onClick }) => {
  return (
    <div 
      onClick={onClick} 
      style={{ 
        flex: 1, 
        padding: '15px', 
        background: '#fff', 
        borderRadius: '8px', 
        border: '1px solid #dfe1e6', 
        cursor: 'pointer', 
        textAlign: 'center', 
        // Apply a colored ring using shadow if the card is currently active
        boxShadow: isActive ? `0 0 0 2px ${color}` : 'none' 
      }}
    >
      {/* Container displaying the descriptor label */}
      <div style={{ fontSize: '12px', color: '#7a869a' }}>{label}</div>
      {/* Container showcasing the numeric metric value in the designated theme color */}
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: color }}>{count}</div>
    </div>
  )
}

export default StatCard