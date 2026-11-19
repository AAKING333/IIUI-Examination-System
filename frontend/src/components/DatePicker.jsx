import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from './icons.jsx';
import {
  formatLongDate,
  formatMonthYear,
  firstOfMonthISO,
  getTodayISO,
  isValidISODate,
  parseISODate,
  shiftMonthISO,
  toISODate,
} from '../utils/date.js';

const PANEL_WIDTH = 322;
const PANEL_HEIGHT = 396;

/**
 * Calendar date field that can never move before the supplied minimum date.
 * Past days and earlier months stay visible but grayed out, and choosing one
 * produces a clear validation message instead of silently doing nothing.
 */
export default function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = 'Select a date',
  onInvalid,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [today, setToday] = useState(() => getTodayISO());
  const [viewMonth, setViewMonth] = useState(() => firstOfMonthISO(value || getTodayISO()));
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const minDate = min || today;
  const maxDate = max || '';
  const minMonth = firstOfMonthISO(minDate);
  const maxMonth = maxDate ? firstOfMonthISO(maxDate) : '';
  const previousMonthBlocked = viewMonth <= minMonth;
  const nextMonthBlocked = Boolean(maxMonth && viewMonth >= maxMonth);

  // Keep the floor in sync if the portal is left open across midnight.
  useEffect(() => {
    const timer = window.setInterval(() => setToday(getTodayISO()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const valueMessage = useMemo(() => {
    if (!value) return '';
    if (!isValidISODate(value)) return 'That date is not valid. Please choose a date from the calendar.';
    if (value < minDate) {
      return `This date has passed. Choose ${formatLongDate(minDate)} or a later date.`;
    }
    if (maxDate && value > maxDate) {
      return `This date is outside the allowed range. Choose a date up to ${formatLongDate(maxDate)}.`;
    }
    return '';
  }, [value, minDate, maxDate]);

  const shownError = error || valueMessage;

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    let left = rect.left;
    if (left + PANEL_WIDTH > viewportWidth - 10) {
      left = viewportWidth - PANEL_WIDTH - 10;
    }
    left = Math.max(10, left);

    let top = rect.bottom + 8;
    if (top + PANEL_HEIGHT > viewportHeight - 10) {
      const above = rect.top - PANEL_HEIGHT - 8;
      top = above >= 10 ? above : Math.max(10, viewportHeight - PANEL_HEIGHT - 10);
    }

    setPosition({ top, left });
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    };
    const handleViewportChange = () => updatePosition();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [open]);

  const openPicker = () => {
    if (disabled) return;
    const base = value && isValidISODate(value) && value >= minDate ? value : minDate;
    setViewMonth(firstOfMonthISO(base));
    setError('');
    updatePosition();
    setOpen((current) => !current);
  };

  const reportInvalid = (message) => {
    setError(message);
    onInvalid?.(message);
  };

  const goToPreviousMonth = () => {
    if (previousMonthBlocked) {
      reportInvalid(`Earlier months are locked. The earliest selectable date is ${formatLongDate(minDate)}.`);
      return;
    }
    setError('');
    setViewMonth((current) => shiftMonthISO(current, -1));
  };

  const goToNextMonth = () => {
    if (nextMonthBlocked) {
      reportInvalid(`Later months are outside the allowed range. The latest selectable date is ${formatLongDate(maxDate)}.`);
      return;
    }
    setError('');
    setViewMonth((current) => shiftMonthISO(current, 1));
  };

  const chooseDay = (iso, blocked) => {
    if (blocked) {
      if (minDate && iso < minDate) {
        reportInvalid(`Past date not allowed: ${formatLongDate(iso)} has already passed. Choose ${formatLongDate(minDate)} or a later date.`);
      } else {
        reportInvalid(`Date out of range: choose a date up to ${formatLongDate(maxDate)}.`);
      }
      return;
    }
    setError('');
    onChange?.(iso);
    setOpen(false);
  };

  const chooseToday = () => {
    if (today < minDate) {
      reportInvalid(`Today is outside the allowed range. The earliest selectable date is ${formatLongDate(minDate)}.`);
      return;
    }
    setError('');
    onChange?.(today);
    setOpen(false);
  };

  const monthDate = parseISODate(viewMonth);
  const daysInMonth = monthDate
    ? new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    : 0;
  const leadingBlanks = monthDate
    ? (new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay() + 6) % 7
    : 0;
  const cells = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      toISODate(new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1))
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="date-picker">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`date-picker__trigger form-control${shownError ? ' date-picker__trigger--invalid' : ''}`}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
      >
        <CalendarIcon size={16} aria-hidden="true" />
        <span className={`date-picker__value${value ? '' : ' date-picker__value--placeholder'}`}>
          {value ? formatLongDate(value) : placeholder}
        </span>
        <ChevronDownIcon size={15} className={`date-picker__chevron${open ? ' date-picker__chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {shownError && !open && (
        <span className="date-picker__error" role="alert">
          {shownError}
        </span>
      )}

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="date-picker__panel"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
            role="dialog"
            aria-label="Choose examination date"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <div className="date-picker__header">
              <button
                type="button"
                className={`date-picker__nav${previousMonthBlocked ? ' date-picker__nav--blocked' : ''}`}
                onClick={goToPreviousMonth}
                aria-disabled={previousMonthBlocked}
                aria-label="Previous month"
                title={previousMonthBlocked ? `Earliest selectable date is ${formatLongDate(minDate)}` : 'Previous month'}
              >
                <ChevronLeftIcon size={17} />
              </button>
              <div className="date-picker__title">{formatMonthYear(viewMonth)}</div>
              <button
                type="button"
                className={`date-picker__nav${nextMonthBlocked ? ' date-picker__nav--blocked' : ''}`}
                onClick={goToNextMonth}
                aria-disabled={nextMonthBlocked}
                aria-label="Next month"
                title={nextMonthBlocked ? `Latest selectable date is ${formatLongDate(maxDate)}` : 'Next month'}
              >
                <ChevronRightIcon size={17} />
              </button>
            </div>

            <div className="date-picker__weekdays" aria-hidden="true">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="date-picker__grid" role="grid">
              {cells.map((iso, index) => {
                if (!iso) {
                  return <span key={`blank-${index}`} className="date-picker__blank" aria-hidden="true" />;
                }
                const blocked = iso < minDate || Boolean(maxDate && iso > maxDate);
                const isSelected = iso === value;
                const isToday = iso === today;
                const isPast = iso < today;
                return (
                  <button
                    key={iso}
                    type="button"
                    className={[
                      'date-picker__day',
                      blocked ? 'date-picker__day--blocked' : '',
                      isPast ? 'date-picker__day--past' : '',
                      isSelected ? 'date-picker__day--selected' : '',
                      isToday ? 'date-picker__day--today' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => chooseDay(iso, blocked)}
                    aria-disabled={blocked}
                    aria-pressed={isSelected}
                    aria-label={
                      blocked
                        ? `${formatLongDate(iso)} — not selectable`
                        : isSelected
                          ? `${formatLongDate(iso)} — selected`
                          : formatLongDate(iso)
                    }
                    title={blocked ? 'This date is locked' : formatLongDate(iso)}
                  >
                    {parseISODate(iso).getDate()}
                  </button>
                );
              })}
            </div>

            <div className="date-picker__footer">
              <span className="date-picker__floor">Today: {formatLongDate(today)}</span>
              <button type="button" className="date-picker__today" onClick={chooseToday}>
                Today
              </button>
            </div>

            {error && (
              <div className="date-picker__error date-picker__error--panel" role="alert">
                {error}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
