import React, { useEffect, useState } from 'react';
import { CalendarIcon, CloseIcon, MenuIcon } from './icons.jsx';
import IIUICrest from './IIUICrest.jsx';
import { formatLongDate, getTodayISO } from '../utils/date.js';

export default function AdminTopbar({ health = null, onMenuClick, mobileNavOpen = false }) {
  const [todayISO, setTodayISO] = useState(getTodayISO());

  useEffect(() => {
    const timer = window.setInterval(() => setTodayISO(getTodayISO()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const status = health ? 'online' : 'pending';
  const statusLabel = health ? 'System online' : 'Connecting';

  return (
    <header className="itms-topbar">
      <div className="itms-topbar__inner">
        <button
          type="button"
          className="itms-topbar__menuBtn"
          onClick={onMenuClick}
          aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-controls="portal-sidebar"
          aria-expanded={mobileNavOpen}
        >
          {mobileNavOpen ? (
            <CloseIcon size={20} aria-hidden="true" />
          ) : (
            <MenuIcon size={20} aria-hidden="true" />
          )}
        </button>

        <div className="itms-topbar__brand">
          <span className="itms-topbar__crest" aria-hidden="true">
            <IIUICrest size={34} />
          </span>
          <div className="itms-topbar__brandText">
            <div className="itms-topbar__mainTitle">
              International Islamic University, Islamabad
            </div>
            <div className="itms-topbar__subTitle">
              Examinations Management Portal
              <span className="itms-topbar__dot" aria-hidden="true" />
              <span className="itms-topbar__department">
                Department of Computer Science &amp; IT
              </span>
            </div>
          </div>
        </div>

        <div className="itms-topbar__meta">
          <span className={`itms-topbar__status itms-topbar__status--${status}`}>
            <span className="itms-topbar__statusDot" aria-hidden="true" />
            {statusLabel}
          </span>
          <span className="itms-topbar__date">
            <CalendarIcon size={15} aria-hidden="true" />
            <span className="itms-topbar__dateLabel">Today</span>
            {formatLongDate(todayISO)}
          </span>
        </div>
      </div>
    </header>
  );
}
