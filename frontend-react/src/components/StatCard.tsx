import React from 'react'

type StatCardProps = {
  label: string
  count: number
  color: string
  isActive: boolean
  onClick: () => void
}

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
        boxShadow: isActive ? `0 0 0 2px ${color}` : 'none' 
      }}
    >
      <div style={{ fontSize: '12px', color: '#7a869a' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: color }}>{count}</div>
    </div>
  )
}

export default StatCard