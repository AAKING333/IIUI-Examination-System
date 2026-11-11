import React from 'react';
import logoImg from '../assets/iiui-logo.png';
import IIUICrest from './IIUICrest.jsx';

const NAV_ITEMS = [
  // Dashboard is temporarily hidden from active portal as requested (code preserved in src/pages/Dashboard.jsx)
  { id: 'slots', label: 'Time Slots', short: 'TS' },
  { id: 'rooms', label: 'Rooms & Capacity', short: 'RC' },
  { id: 'courses', label: 'Courses Directory', short: 'CD' },
  { id: 'instructors', label: 'Instructor Assignments', short: 'IA' },
  { id: 'students', label: 'Students & Enrolments', short: 'SE' },
  { id: 'datesheet', label: 'Datesheet', short: 'DS' },
  { id: 'seating', label: 'Seating Plan Matrix', short: 'SP' },
  { id: 'rollslip', label: 'Roll No Slips', short: 'RS' },
];

export default function AdminSidebar({ active = 'dashboard', onNavigate, expanded = true, onToggle }) {
  return (
    <aside className={`itms-sidebar${expanded ? ' itms-sidebar--expanded' : ' itms-sidebar--collapsed'}`}>
      <div className="itms-sidebar__header">
        <div className="itms-sidebar__brandWrapper">
          <div className="itms-sidebar__logoBox">
            {logoImg ? (
              <img
                src={logoImg}
                alt="International Islamic University Islamabad Logo"
                className="itms-sidebar__logoImg"
              />
            ) : (
              <IIUICrest size={44} />
            )}
            <hr className="itms-sidebar__hr" />
          </div>
        </div>
      </div>

      <nav className="itms-dash__nav" aria-label="Portal Navigation">
        {NAV_ITEMS.map(({ id, label, short }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={active === id ? 'page' : undefined}
            title={!expanded ? label : undefined}
            className={`itms-dash__navBtn ${active === id ? 'itms-dash__navBtn--active' : ''}`}
          >
            {expanded ? <span>{label}</span> : <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>{short}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
