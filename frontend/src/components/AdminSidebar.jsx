import React from 'react';
import logoImg from '../assets/iiui-logo.png';
import IIUICrest from './IIUICrest.jsx';
import {
  AlertIcon,
  BookIcon,
  CalendarClockIcon,
  CalendarIcon,
  CollapseIcon,
  DoorIcon,
  ExpandIcon,
  GraduationIcon,
  GridIcon,
  ShieldIcon,
  TicketIcon,
  UsersIcon,
} from './icons.jsx';

const NAV_ITEMS = [
  // Dashboard is temporarily hidden from active portal as requested (code preserved in src/pages/Dashboard.jsx)
  { id: 'slots', label: 'Exam Slots', icon: CalendarClockIcon },
  { id: 'rooms', label: 'Rooms', icon: DoorIcon },
  { id: 'courses', label: 'Courses', icon: BookIcon },
  { id: 'instructors', label: 'Instructors', icon: GraduationIcon },
  { id: 'students', label: 'Students', icon: UsersIcon },
  { id: 'datesheet', label: 'Datesheet', icon: CalendarIcon },
  { id: 'seating', label: 'Seating Plan', icon: GridIcon },
  { id: 'invigilators', label: 'Invigilators', icon: ShieldIcon },
  { id: 'umc', label: 'UMC Discipline', icon: AlertIcon },
  { id: 'rollslip', label: 'Roll No Slips', icon: TicketIcon },
];

export default function AdminSidebar({
  active = 'dashboard',
  onNavigate,
  expanded = true,
  onToggle,
  mobileOpen = false,
}) {
  const showLabels = expanded || mobileOpen;

  return (
    <aside
      id="portal-sidebar"
      className={`itms-sidebar${expanded ? ' itms-sidebar--expanded' : ' itms-sidebar--collapsed'}${
        mobileOpen ? ' itms-sidebar--mobileOpen' : ''
      }`}
      aria-label="Portal sections"
    >
      <div className="itms-sidebar__header">
        <div className="itms-sidebar__brandWrapper">
          <div className="itms-sidebar__logoBox">
            {showLabels ? (
              <img
                src={logoImg}
                alt="International Islamic University Islamabad"
                className="itms-sidebar__logoImg"
              />
            ) : (
              <IIUICrest size={34} />
            )}
          </div>
        </div>
      </div>

      <hr className="itms-sidebar__hr" />

      <nav className="itms-dash__nav" aria-label="Portal Navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={active === id ? 'page' : undefined}
            aria-label={!showLabels ? label : undefined}
            title={!showLabels ? label : undefined}
            className={`itms-dash__navBtn ${active === id ? 'itms-dash__navBtn--active' : ''}`}
          >
            <Icon className="itms-dash__navIcon" size={18} strokeWidth={1.9} aria-hidden="true" />
            {showLabels && <span className="itms-dash__navLabel">{label}</span>}
          </button>
        ))}
      </nav>

      <div className="itms-sidebar__footer">
        <button
          type="button"
          className="itms-sidebar__toggle"
          onClick={onToggle}
          aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          title={expanded ? 'Collapse navigation' : 'Expand navigation'}
        >
          {expanded ? (
            <CollapseIcon size={17} aria-hidden="true" />
          ) : (
            <ExpandIcon size={17} aria-hidden="true" />
          )}
          {expanded && <span>Collapse menu</span>}
        </button>
      </div>
    </aside>
  );
}
