import { useLanguage } from '../contexts/LanguageContext';
import React from 'react';
import './Sidebar.css';

const Sidebar = ({ activePanel, onTogglePanel }) => {
  const { tx } = useLanguage();
  const buttons = [
    { id: 'checklist', label: tx("Checklist"), icon: '📋', disabled: false },
    { id: 'flight_computer', label: tx("F-Comp"), icon: '💻', disabled: false },
    { id: 'systems', label: tx("Systems"), icon: '🔧', disabled: false },
    { id: 'timer', label: tx("Timer"), icon: '⏱️', disabled: false },
    { id: 'save_load', label: tx("Save/Load"), icon: '💾', disabled: false },
    { id: 'inspect', label: tx("Inspect"), icon: '🔍', disabled: false },
    { id: 'settings', label: tx("Settings"), icon: '⚙️', disabled: false },
  ];

  return (
    <div className="flight-sidebar">
      {buttons.map((btn) => (
        <button
          key={btn.id}
          className={`sidebar-btn ${activePanel === btn.id ? 'active' : ''} ${btn.disabled ? 'disabled' : ''}`}
          onClick={() => !btn.disabled && onTogglePanel(btn.id)}
          title={tx(btn.label)}
        >
          <span className="sidebar-icon">{btn.icon}</span>
          <span className="sidebar-label">{tx(btn.label)}</span>
        </button>
      ))}
    </div>
  );
};

export default Sidebar;
