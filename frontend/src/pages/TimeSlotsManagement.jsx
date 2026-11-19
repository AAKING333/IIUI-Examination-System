import React, { useState, useMemo, useEffect } from 'react';
import Modal from '../components/Modal.jsx';
import DatePicker from '../components/DatePicker.jsx';
import { masterDataService } from '../services/index.js';
import { extractErrorMessage } from '../services/apiClient.js';
import { formatTime12, formatTimeRange12, formatSlotTime, formatDateAndSlotTime } from '../utils/timeFormat.js';
import {
  addDaysISO,
  daysBetweenISO,
  formatLongDate,
  getTodayISO,
  isValidISODate,
  parseISODate,
  toISODate,
} from '../utils/date.js';

const EXPECTED_DAILY_SESSIONS = { midterm: 4, terminal: 2 };
const MORNING_SESSIONS = { midterm: 2, terminal: 1 };
const LONG_BREAK_OPTIONS = [30, 45, 60, 75, 90, 105, 120];
const DURATION_OPTIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 75, label: '1 hr 15 min' },
  { minutes: 90, label: '1 hr 30 min' },
  { minutes: 105, label: '1 hr 45 min' },
  { minutes: 120, label: '2 hours' },
  { minutes: 150, label: '2 hr 30 min' },
  { minutes: 180, label: '3 hours' },
];
const SESSION_BREAK_OPTIONS = [15, 30, 45, 60];

const minutesFromTime = (value) => {
  if (!value || !value.includes(':')) return 0;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const timeFromMinutes = (value) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, value));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

/** Keep the morning sessions fixed and re-time the afternoon sessions so the long break matches. */
const applyLongBreak = (sessions, breakMinutes, presetKey) => {
  const split = MORNING_SESSIONS[presetKey];
  if (!split || sessions.length <= split) return sessions;
  const gap = minutesFromTime(sessions[split].start_time) - minutesFromTime(sessions[split - 1].end_time);
  const delta = Number(breakMinutes) - gap;
  if (!delta) return sessions;
  return sessions.map((session, index) => (
    index < split
      ? session
      : {
          ...session,
          start_time: timeFromMinutes(minutesFromTime(session.start_time) + delta),
          end_time: timeFromMinutes(minutesFromTime(session.end_time) + delta),
        }
  ));
};

const longBreakLabel = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} hr ${rest} min`;
  if (hours) return `${hours} hr${hours > 1 ? 's' : ''}`;
  return `${rest} min`;
};

const presetBreakSummary = (template, presetKey) => {
  const sessions = template?.sessions || [];
  const split = MORNING_SESSIONS[presetKey];
  if (!split || !sessions[split] || !sessions[split - 1]) return null;
  const minutes = Number(template?.long_break_minutes) || 0;
  return `${longBreakLabel(minutes)} · ${formatTime12(sessions[split - 1].end_time)} – ${formatTime12(sessions[split].start_time)}`;
};

export default function TimeSlotsManagement({ slots = [], onRefresh, showBanner }) {
  const todayISO = getTodayISO();

  // Auto-generate modal state
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [generateMode, setGenerateMode] = useState('preset'); // 'preset' | 'custom'
  const [autoForm, setAutoForm] = useState(() => {
    const start = getTodayISO();
    return {
      from_date: start,
      to_date: addDaysISO(start, 2),
      start_time: '08:30',
      end_time: '17:40',
      duration_minutes: 90,
      break_minutes: 15,
      sessions_per_day: 4,
      long_break_minutes: 120,
      skip_weekends: true,
      replace_existing: true,
    };
  });

  // Single Slot Add / Edit modal state
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [singleFormData, setSingleFormData] = useState(() => ({
    date: getTodayISO(),
    start_time: '08:45',
    end_time: '10:15',
    label: 'Morning 1',
    slot_type: 'written',
  }));
  const [presetDate, setPresetDate] = useState(() => getTodayISO());
  const [studyHolidays, setStudyHolidays] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('midterm'); // 'midterm' | 'terminal'
  const [labMode, setLabMode] = useState('separate_days'); // 'separate_days' | 'concurrent'

  // Editable Preset Templates
  const [presetTemplates, setPresetTemplates] = useState({
    midterm: {
      name: 'Midterm Examination',
      days: 8,
      long_break_minutes: 120,
      sessions: [
        { start_time: '08:45', end_time: '10:15', label: 'Morning 1', slot_type: 'written' },
        { start_time: '10:30', end_time: '12:00', label: 'Morning 2', slot_type: 'written' },
        { start_time: '14:00', end_time: '15:30', label: 'Afternoon 1', slot_type: 'written' },
        { start_time: '15:45', end_time: '17:15', label: 'Afternoon 2', slot_type: 'written' },
      ],
    },
    terminal: {
      name: 'Terminal Examination',
      days: 18,
      long_break_minutes: 120,
      sessions: [
        { start_time: '08:45', end_time: '11:45', label: 'Morning', slot_type: 'written' },
        { start_time: '13:45', end_time: '16:45', label: 'Afternoon', slot_type: 'written' },
      ],
    },
  });

  const [editingPresetKey, setEditingPresetKey] = useState(null); // 'midterm' | 'terminal' | null
  const [presetEditForm, setPresetEditForm] = useState(null);

  useEffect(() => {
    masterDataService.getPresetTemplates()
      .then((data) => {
        if (data && data.midterm && data.terminal) {
          const normalize = (key) => {
            const tpl = data[key];
            const expected = EXPECTED_DAILY_SESSIONS[key];
            const storedBreak = Number(tpl?.long_break_minutes);
            const breakMinutes = LONG_BREAK_OPTIONS.includes(storedBreak) ? storedBreak : 120;
            const sessions = (tpl?.sessions || [])
              .slice(0, expected)
              .map((session) => ({ ...session }));
            return {
              ...tpl,
              long_break_minutes: breakMinutes,
              sessions: applyLongBreak(sessions, breakMinutes, key),
            };
          };
          setPresetTemplates({ midterm: normalize('midterm'), terminal: normalize('terminal') });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/time-slots/lab-mode')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.lab_mode) setLabMode(data.lab_mode);
      })
      .catch(() => {});
  }, []);

  const handleOpenPresetEditor = (presetKey, e) => {
    e?.stopPropagation();
    const current = presetTemplates[presetKey];
    if (!current) return;
    setEditingPresetKey(presetKey);
    setPresetEditForm({
      name: current.name || (presetKey === 'midterm' ? 'Midterm Examination' : 'Terminal Examination'),
      days: current.days || (presetKey === 'midterm' ? 8 : 18),
      long_break_minutes: Number(current.long_break_minutes) || 120,
      sessions: (current.sessions || []).map((s) => ({ ...s })),
    });
  };

  const handleSavePresetEdit = async () => {
    if (!editingPresetKey || !presetEditForm) return;
    const days = Number(presetEditForm.days);
    if (isNaN(days) || days <= 0) {
      showBanner?.('Validation Error: Total days must be a positive integer.', 'danger');
      return;
    }
    if (editingPresetKey === 'midterm' && (days < 7 || days > 10)) {
      showBanner?.(`Validation Error: Midterm exam days threshold must be between 7 and 10 days. (Provided: ${days} days)`, 'danger');
      return;
    }
    if (editingPresetKey === 'terminal' && (days < 7 || days > 18)) {
      showBanner?.(`Validation Error: Terminal/Final exam days threshold cannot exceed 18 days (must be between 7 and 18 days). (Provided: ${days} days)`, 'danger');
      return;
    }
    if (days > 18) {
      showBanner?.(`Validation Error: Exam duration cannot exceed the maximum threshold of 18 days. (Provided: ${days} days)`, 'danger');
      return;
    }
    const expectedSessions = EXPECTED_DAILY_SESSIONS[editingPresetKey];
    if (presetEditForm.sessions.length !== expectedSessions) {
      showBanner?.(
        `Validation Error: ${editingPresetKey === 'midterm' ? 'Midterms' : 'Terminal exams'} must have exactly ${expectedSessions} daily sessions.`,
        'danger',
      );
      return;
    }
    const breakMinutes = Number(presetEditForm.long_break_minutes);
    if (!LONG_BREAK_OPTIONS.includes(breakMinutes)) {
      showBanner?.('Validation Error: The long break must be between 30 minutes and 2 hours.', 'danger');
      return;
    }
    let previousEnd = -1;
    for (const session of presetEditForm.sessions) {
      const start = minutesFromTime(session.start_time);
      const end = minutesFromTime(session.end_time);
      if (!session.start_time || !session.end_time || end <= start || start < previousEnd) {
        showBanner?.('Validation Error: Session times must be in order and must not overlap.', 'danger');
        return;
      }
      previousEnd = end;
    }

    const updated = {
      ...presetTemplates,
      [editingPresetKey]: {
        ...presetTemplates[editingPresetKey],
        ...presetEditForm,
        days: days,
        long_break_minutes: breakMinutes,
        sessions: applyLongBreak(presetEditForm.sessions, breakMinutes, editingPresetKey),
      },
    };
    try {
      setIsSubmitting(true);
      await masterDataService.savePresetTemplates(updated);
      setPresetTemplates(updated);
      setEditingPresetKey(null);
      setPresetEditForm(null);
      showBanner?.(`${presetEditForm.name || 'Preset'} updated and saved successfully!`, 'success');
    } catch (err) {
      showBanner?.(`Failed to save preset: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [presetConfirm, setPresetConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const distinctDays = Array.from(new Set(slots.map((s) => s.date))).length;

  // Group slots into one block per examination day.
  const dayBlocks = useMemo(() => {
    const dayMap = new Map();
    const sorted = [...slots].sort(
      (a, b) =>
        String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.start_time || '').localeCompare(String(b.start_time || ''))
    );
    sorted.forEach((slot) => {
      const key = slot.date || 'Unscheduled';
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key).push(slot);
    });

    return Array.from(dayMap.entries()).map(([date, daySlots]) => {
      const parsed = parseISODate(date);
      return {
        date,
        slots: daySlots,
        isPast: date < todayISO,
        weekday: parsed
          ? parsed.toLocaleDateString('en-US', { weekday: 'long' })
          : 'Unscheduled',
        dateDisplay: parsed
          ? parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'No date assigned',
      };
    });
  }, [slots, todayISO]);

  // Helper time math
  const timeToMin = (tStr) => {
    if (!tStr) return 0;
    const [h, m] = tStr.split(':').map((v) => parseInt(v, 10) || 0);
    return h * 60 + m;
  };

  const minToTime = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Live calculation preview for auto generation
  const previewCalculation = useMemo(() => {
    try {
      const dStart = parseISODate(autoForm.from_date);
      const dEnd = parseISODate(autoForm.to_date);

      if (!dStart || !dEnd) {
        return { valid: false, error: 'Validation Error: Please select valid examination dates.' };
      }

      const today = getTodayISO();
      if (autoForm.from_date < today) {
        return {
          valid: false,
          error: `Validation Error: Past dates are locked. From Date must be ${formatLongDate(today)} or later.`,
        };
      }

      if (autoForm.to_date < today) {
        return {
          valid: false,
          error: `Validation Error: Past dates are locked. To Date must be ${formatLongDate(today)} or later.`,
        };
      }

      if (dEnd < dStart) {
        return {
          valid: false,
          error: 'Validation Error: Start date (From Date) cannot be greater than End date (To Date). From date must be earlier than or equal to To date.',
        };
      }

      const diffDays = daysBetweenISO(autoForm.from_date, autoForm.to_date) + 1;
      if (diffDays > 18) {
        return {
          valid: false,
          error: `Validation Error: Exam duration exceeds the maximum allowed threshold of 18 days (selected: ${diffDays} days). Please select at most 18 days.`,
        };
      }

      const startMin = timeToMin(autoForm.start_time);
      const duration = Number(autoForm.duration_minutes) || 0;
      const breakMin = Number(autoForm.break_minutes) || 0;
      const sessionsPerDay = Number(autoForm.sessions_per_day) || 0;
      const longBreak = Number(autoForm.long_break_minutes) || 0;

      if (![2, 4].includes(sessionsPerDay)) {
        return { valid: false, error: 'Validation Error: Daily sessions must be 4 (midterms) or 2 (terminal exams).' };
      }
      if (breakMin <= 0) {
        return {
          valid: false,
          error: 'Validation Error: Break duration cannot be zero. Break must be at least 15 minutes (options: 15, 30, 45, or 60 minutes).',
        };
      }
      if (duration <= 0) {
        return { valid: false, error: 'Validation Error: Paper duration must be greater than 0.' };
      }
      if (longBreak < 30 || longBreak > 120) {
        return { valid: false, error: 'Validation Error: The long break must be between 30 minutes and 2 hours.' };
      }

      const morningCount = sessionsPerDay / 2;
      const daySlots = [];
      let curr = startMin;

      for (let index = 0; index < sessionsPerDay; index += 1) {
        if (index > 0) {
          curr += index === morningCount ? longBreak : breakMin;
        }
        const slotEnd = curr + duration;
        if (slotEnd > 24 * 60) {
          return { valid: false, error: 'Validation Error: Daily sessions finish after midnight. Reduce the paper duration or a break.' };
        }
        let label = `Session ${index + 1}`;
        if (sessionsPerDay === 2) {
          label = index === 0 ? 'Morning' : 'Afternoon';
        } else if (index === 0) label = 'Morning 1';
        else if (index === 1) label = 'Morning 2';
        else if (index === 2) label = 'Afternoon 1';
        else label = 'Afternoon 2';

        daySlots.push({
          start: minToTime(curr),
          end: minToTime(slotEnd),
          label,
        });
        curr = slotEnd;
      }

      // Count dates
      let dateCount = 0;
      const sampleDates = [];
      const curDate = new Date(dStart);

      while (curDate <= dEnd) {
        const dayOfWeek = curDate.getDay(); // 0 is Sun, 6 is Sat
        if (!(autoForm.skip_weekends && (dayOfWeek === 0 || dayOfWeek === 6))) {
          dateCount += 1;
          if (sampleDates.length < 5) {
            sampleDates.push(toISODate(curDate));
          }
        }
        curDate.setDate(curDate.getDate() + 1);
      }

      return {
        valid: true,
        slotsPerDay: daySlots.length,
        daySlots,
        endTime: daySlots[daySlots.length - 1].end,
        dateCount,
        sampleDates,
        totalSlots: daySlots.length * dateCount,
      };
    } catch {
      return { valid: false, error: 'Invalid parameters.' };
    }
  }, [autoForm]);

  // Execute Auto Generate
  const handleAutoGenerateSubmit = async (e) => {
    e.preventDefault();
    if (!previewCalculation.valid) {
      showBanner(previewCalculation.error || 'Invalid configuration.', 'danger');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/time-slots/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_date: autoForm.from_date,
          to_date: autoForm.to_date,
          start_time: autoForm.start_time,
          end_time: previewCalculation.endTime,
          duration_minutes: Number(autoForm.duration_minutes),
          break_minutes: Number(autoForm.break_minutes),
          sessions_per_day: Number(autoForm.sessions_per_day),
          long_break_minutes: Number(autoForm.long_break_minutes),
          skip_weekends: autoForm.skip_weekends,
          replace_existing: autoForm.replace_existing,
          lab_mode: labMode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, 'Failed to auto-generate slots.'));
      }

      const data = await res.json();
      showBanner(
        `Auto-generation complete: ${data.generated_count} examination slots created across ${previewCalculation.dateCount} days.`,
        'success'
      );
      setIsAutoModalOpen(false);
      onRefresh();
    } catch (err) {
      showBanner(`Auto-generation error: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Single Slot Handlers
  const handleOpenAddSingle = () => {
    setEditingSlot(null);
    setSingleFormData({
      date: getTodayISO(),
      start_time: '08:45',
      end_time: '10:15',
      label: 'Morning 1',
      slot_type: 'written',
    });
    setIsSingleModalOpen(true);
  };

  const handleOpenEdit = (slot) => {
    setEditingSlot(slot);
    setSingleFormData({
      date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      label: slot.label || '',
      slot_type: slot.slot_type || 'written',
    });
    setIsSingleModalOpen(true);
  };

  const handleRequestPreset = (preset) => {
    const today = getTodayISO();
    if (!presetDate || !isValidISODate(presetDate)) {
      showBanner('Validation Error: Choose a valid start date for the exam preset.', 'danger');
      return;
    }
    if (presetDate < today) {
      showBanner(
        `Validation Error: Past dates are locked. The exam start date must be ${formatLongDate(today)} or later.`,
        'danger'
      );
      return;
    }

    const holidayValues = studyHolidays
      .split(',')
      .map((date) => date.trim())
      .filter(Boolean);
    const invalidHoliday = holidayValues.find((date) => !isValidISODate(date));
    if (invalidHoliday) {
      showBanner(
        `Validation Error: "${invalidHoliday}" is not a valid study-holiday date. Use YYYY-MM-DD format.`,
        'danger'
      );
      return;
    }
    const pastHoliday = holidayValues.find((date) => date < today);
    if (pastHoliday) {
      showBanner(
        `Validation Error: Study holiday ${formatLongDate(pastHoliday)} has already passed. Only ${formatLongDate(today)} or later dates are allowed.`,
        'danger'
      );
      return;
    }

    const template = presetTemplates[preset];
    const days = Number(template?.days || (preset === 'midterm' ? 8 : 18));
    if (preset === 'midterm' && (days < 7 || days > 10)) {
      showBanner(`Validation Error: Midterm preset days must be between 7 and 10 days (currently configured: ${days} days).`, 'danger');
      return;
    }
    if (preset === 'terminal' && (days < 7 || days > 18)) {
      showBanner(`Validation Error: Terminal preset days cannot exceed 18 days (must be between 7 and 18 days, currently configured: ${days} days).`, 'danger');
      return;
    }
    if (days > 18) {
      showBanner(`Validation Error: Exam duration cannot exceed the maximum allowed threshold of 18 days (currently configured: ${days} days).`, 'danger');
      return;
    }
    if (slots.length > 0) {
      setPresetConfirm(preset);
    } else {
      executePreset(preset);
    }
  };

  const executePreset = async (preset) => {
    setIsSubmitting(true);
    try {
      const template = presetTemplates[preset];
      const res = await fetch('/api/time-slots/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset,
          from_date: presetDate,
          study_holidays: studyHolidays.split(',').map((date) => date.trim()).filter(Boolean),
          replace_existing: true,
          requested_days: template?.days,
          long_break_minutes: Number(template?.long_break_minutes) || 120,
          lab_mode: labMode,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(error, 'Preset creation failed.'));
      }
      const result = await res.json();
      showBanner(result.message, 'success');
      setPresetConfirm(null);
      setIsAutoModalOpen(false);
      onRefresh();
    } catch (error) {
      showBanner(`Preset creation failed: ${error.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!singleFormData.date || !singleFormData.start_time || !singleFormData.end_time) {
      showBanner('Validation Error: Date, start time, and end time are required.', 'danger');
      return;
    }
    if (!isValidISODate(singleFormData.date)) {
      showBanner('Validation Error: Choose a valid examination date from the calendar.', 'danger');
      return;
    }
    const today = getTodayISO();
    if (singleFormData.date < today) {
      showBanner(
        `Validation Error: ${formatLongDate(singleFormData.date)} has already passed. Choose ${formatLongDate(today)} or a later date.`,
        'danger'
      );
      return;
    }

    const startMin = timeToMin(singleFormData.start_time);
    const endMin = timeToMin(singleFormData.end_time);
    if (endMin <= startMin) {
      showBanner(`Validation Error: Slot end time (${singleFormData.end_time}) must be later than start time (${singleFormData.start_time}).`, 'danger');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingSlot) {
        const res = await fetch(`/api/time-slots/${editingSlot.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(singleFormData),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(extractErrorMessage(errData, 'Failed to update time slot.'));
        }
        showBanner(`Time Slot "${editingSlot.id}" updated successfully.`, 'success');
      } else {
        const res = await fetch('/api/time-slots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(singleFormData),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(extractErrorMessage(errData, 'Failed to create time slot.'));
        }
        showBanner('New time slot added successfully.', 'success');
      }
      setIsSingleModalOpen(false);
      onRefresh();
    } catch (err) {
      showBanner(`Operation failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (slotId) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/time-slots/${slotId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showBanner('Time slot removed successfully.', 'success');
      setDeleteConfirm(null);
      onRefresh();
    } catch (err) {
      showBanner(`Delete failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAll = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/time-slots', { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showBanner('All time slots cleared.', 'info');
      setClearAllConfirm(false);
      onRefresh();
    } catch (err) {
      showBanner(`Clear failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="itms-dash__main">
      <div className="itms-dash__pageHeader">
        <div>
          <h1 className="itms-dash__pageTitle">Exam Dates &amp; Time Slots</h1>
        </div>

        <div className="toolbar__actions">
          <button
            type="button"
            className="btn btn--outline"
            onClick={handleOpenAddSingle}
          >
            + Add Single Slot
          </button>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setGenerateMode('preset');
              setIsAutoModalOpen(true);
            }}
          >
            Generate Time Slots
          </button>

          {slots.length > 0 && (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => setClearAllConfirm(true)}
              title="Delete all slots"
            >
              Clear All Slots
            </button>
          )}
        </div>
      </div>

      <section className="itms-dash__stats">
        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Active Time Slots</span>
            <span className="itms-dash__statValue">{slots.length}</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Scheduled Exam Days</span>
            <span className="itms-dash__statValue">{distinctDays} Days</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Average Slots / Day</span>
            <span className="itms-dash__statValue">
              {distinctDays ? Math.round(slots.length / distinctDays) : 0} Sessions
            </span>
          </div>
        </article>
      </section>

      <div className="slot-day-list">
        {dayBlocks.map((group) => (
          <section
            key={group.date}
            className={`slot-day-block${group.isPast ? ' slot-day-block--past' : ''}`}
            aria-label={`${group.weekday}, ${group.dateDisplay}: ${group.slots.length} session${group.slots.length === 1 ? '' : 's'}`}
          >
            <header className="slot-day-block__header">
              <div className="slot-day-block__date">
                <span className="slot-day-block__weekday">{group.weekday}</span>
                <span className="slot-day-block__dateText">{group.dateDisplay}</span>
              </div>
              <div className="slot-day-block__meta">
                {group.isPast && <span className="badge badge--muted">Past</span>}
                {group.slots.length > 0 && group.slots.every((s) => s.slot_type === 'lab') && (
                  <span className="badge badge--info">Lab day</span>
                )}
                <span className="badge badge--info">
                  {group.slots.length} session{group.slots.length === 1 ? '' : 's'}
                </span>
              </div>
            </header>

            <div className="slot-day-block__ids" aria-label="Slot IDs for this day">
              {group.slots.map((s) => (
                <span key={s.id} className="slot-id-chip">{s.id}</span>
              ))}
            </div>

            <ul className="slot-day-block__rows">
              {group.slots.map((s) => (
                <li key={s.id} className="slot-day-row">
                  <span className="slot-day-row__id">{s.id}</span>
                  <div className="slot-day-row__session">
                    <strong>{formatTimeRange12(s.start_time, s.end_time)}</strong>
                    {s.label && <span className="slot-day-row__label">{s.label}</span>}
                  </div>
                  <div className="slot-day-row__actions">
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() => handleOpenEdit(s)}
                      title="Edit time slot"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      onClick={() => setDeleteConfirm(s)}
                      title="Delete time slot"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {slots.length === 0 && (
          <div className="slot-day-empty">
            <p>No time slots configured. Click "Auto Generate Time Slots" above to generate them automatically.</p>
          </div>
        )}
      </div>

      {/* Generation & Presets Modal */}
      <Modal
        isOpen={isAutoModalOpen}
        busy={isSubmitting}
        title="Generate Examination Time Slots"
        size="lg"
        onClose={() => setIsAutoModalOpen(false)}
        footer={
          generateMode === 'preset' ? (
            <>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setIsAutoModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => handleRequestPreset(selectedPreset)}
                disabled={isSubmitting || !presetDate}
              >
                {isSubmitting
                  ? 'Applying...'
                  : `Generate ${selectedPreset === 'midterm' ? 'Midterm' : 'Terminal'} Slots`}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setIsAutoModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleAutoGenerateSubmit}
                disabled={isSubmitting || !previewCalculation.valid}
              >
                {isSubmitting
                  ? 'Generating...'
                  : `Generate ${previewCalculation.valid ? previewCalculation.totalSlots : ''} Slots`}
              </button>
            </>
          )
        }
      >
        <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
          <button
            type="button"
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              background: generateMode === 'preset' ? '#ffffff' : 'transparent',
              color: generateMode === 'preset' ? 'var(--iiui-navy, #1e3a5f)' : '#64748b',
              boxShadow: generateMode === 'preset' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
            onClick={() => setGenerateMode('preset')}
          >
            Official Presets
          </button>
          <button
            type="button"
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              background: generateMode === 'custom' ? '#ffffff' : 'transparent',
              color: generateMode === 'custom' ? 'var(--iiui-navy, #1e3a5f)' : '#64748b',
              boxShadow: generateMode === 'custom' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
            onClick={() => setGenerateMode('custom')}
          >
            Custom Range
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: '1.1rem' }}>
          <label className="form-label" style={{ fontWeight: 600 }}>Lab Days</label>
          <select
            className="form-control"
            value={labMode}
            onChange={(e) => setLabMode(e.target.value)}
          >
            <option value="separate_days">Separate — last 2 exam days reserved for labs</option>
            <option value="concurrent">Concurrent — labs on the same day as regular papers</option>
          </select>
        </div>

        {generateMode === 'preset' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Exam Start Date</label>
                <DatePicker
                  id="preset-start-date"
                  value={presetDate}
                  onChange={setPresetDate}
                  onInvalid={(message) => showBanner(message, 'danger')}
                  placeholder="Select first examination date"
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Study Holidays (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={studyHolidays}
                  onChange={(e) => setStudyHolidays(e.target.value)}
                  placeholder="e.g. 2026-11-27, 2026-12-01"
                />
              </div>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
                Select Preset Schedule
              </label>
              <div className="preset-choice-grid">
                {/* Midterm Card */}
                <div
                  onClick={() => setSelectedPreset('midterm')}
                  style={{
                    border: selectedPreset === 'midterm' ? '1.5px solid var(--iiui-green-700, #15803d)' : '1.5px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '1rem',
                    cursor: 'pointer',
                    background: selectedPreset === 'midterm' ? '#f0fdf4' : '#ffffff',
                    boxShadow: selectedPreset === 'midterm' ? '0 1px 4px rgba(21, 128, 61, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      <input
                        type="radio"
                        name="examPreset"
                        checked={selectedPreset === 'midterm'}
                        onChange={() => setSelectedPreset('midterm')}
                        style={{ cursor: 'pointer', accentColor: 'var(--iiui-green-700, #15803d)' }}
                      />
                      <strong style={{ fontSize: '0.92rem', color: 'var(--iiui-navy, #1e3a5f)' }}>
                        {presetTemplates.midterm?.name || 'Midterm Examination'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          background: selectedPreset === 'midterm' ? '#dcfce7' : '#f1f5f9',
                          color: selectedPreset === 'midterm' ? '#166534' : '#64748b',
                        }}
                      >
                        {presetTemplates.midterm?.days || 8} Days
                      </span>
                      <button
                        type="button"
                        className="btn btn--sm btn--outline"
                        style={{ padding: '2px 7px', fontSize: '0.72rem', borderColor: '#cbd5e1' }}
                        onClick={(e) => handleOpenPresetEditor('midterm', e)}
                        title="Edit Midterm Preset sessions & timings"
                      >
                        Edit Preset
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.5, paddingLeft: '1.45rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '3px' }}>
                      {presetTemplates.midterm?.sessions?.length || 4} daily sessions (90 mins each):
                    </div>
                    {(presetTemplates.midterm?.sessions || []).map((sess, idx) => (
                      <div key={idx} style={{ color: '#475569', display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                        <span>&bull; {sess.label || `Slot ${idx + 1}`}:</span>
                        <strong style={{ color: 'var(--iiui-navy)' }}>{formatTimeRange12(sess.start_time, sess.end_time)}</strong>
                      </div>
                    ))}
                    {presetBreakSummary(presetTemplates.midterm, 'midterm') && (
                      <div style={{ marginTop: '4px', color: '#166534', fontWeight: 600 }}>
                        Long break: {presetBreakSummary(presetTemplates.midterm, 'midterm')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Terminal Card */}
                <div
                  onClick={() => setSelectedPreset('terminal')}
                  style={{
                    border: selectedPreset === 'terminal' ? '1.5px solid var(--iiui-navy, #1e3a5f)' : '1.5px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '1rem',
                    cursor: 'pointer',
                    background: selectedPreset === 'terminal' ? '#f0f9ff' : '#ffffff',
                    boxShadow: selectedPreset === 'terminal' ? '0 1px 4px rgba(30, 58, 95, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      <input
                        type="radio"
                        name="examPreset"
                        checked={selectedPreset === 'terminal'}
                        onChange={() => setSelectedPreset('terminal')}
                        style={{ cursor: 'pointer', accentColor: 'var(--iiui-navy, #1e3a5f)' }}
                      />
                      <strong style={{ fontSize: '0.92rem', color: 'var(--iiui-navy, #1e3a5f)' }}>
                        {presetTemplates.terminal?.name || 'Terminal Examination'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          background: selectedPreset === 'terminal' ? '#e0f2fe' : '#f1f5f9',
                          color: selectedPreset === 'terminal' ? '#0369a1' : '#64748b',
                        }}
                      >
                        {presetTemplates.terminal?.days || 18} Days
                      </span>
                      <button
                        type="button"
                        className="btn btn--sm btn--outline"
                        style={{ padding: '2px 7px', fontSize: '0.72rem', borderColor: '#cbd5e1' }}
                        onClick={(e) => handleOpenPresetEditor('terminal', e)}
                        title="Edit Terminal Preset sessions & timings"
                      >
                        Edit Preset
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.5, paddingLeft: '1.45rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '3px' }}>
                      {presetTemplates.terminal?.sessions?.length || 2} daily sessions (3 hrs each):
                    </div>
                    {(presetTemplates.terminal?.sessions || []).map((sess, idx) => (
                      <div key={idx} style={{ color: '#475569', display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                        <span>&bull; {sess.label || `Slot ${idx + 1}`}:</span>
                        <strong style={{ color: 'var(--iiui-navy)' }}>{formatTimeRange12(sess.start_time, sess.end_time)}</strong>
                      </div>
                    ))}
                    {presetBreakSummary(presetTemplates.terminal, 'terminal') && (
                      <div style={{ marginTop: '4px', color: '#0369a1', fontWeight: 600 }}>
                        Long break: {presetBreakSummary(presetTemplates.terminal, 'terminal')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAutoGenerateSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">From Date</label>
                <DatePicker
                  id="auto-from-date"
                  value={autoForm.from_date}
                  onChange={(date) =>
                    setAutoForm((current) => {
                      const latestEnd = addDaysISO(date, 17);
                      let nextEnd = current.to_date;
                      if (nextEnd < date) nextEnd = date;
                      if (nextEnd > latestEnd) nextEnd = latestEnd;
                      return { ...current, from_date: date, to_date: nextEnd };
                    })
                  }
                  onInvalid={(message) => showBanner(message, 'danger')}
                  placeholder="Select start date"
                />
              </div>
              <div className="form-group">
                <label className="form-label">To Date</label>
                <DatePicker
                  id="auto-to-date"
                  value={autoForm.to_date}
                  min={autoForm.from_date}
                  max={addDaysISO(autoForm.from_date, 17)}
                  onChange={(date) => setAutoForm({ ...autoForm, to_date: date })}
                  onInvalid={(message) => showBanner(message, 'danger')}
                  placeholder="Select end date"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Daily Exam Start Time</label>
                <input
                  type="time"
                  className="form-control"
                  value={autoForm.start_time}
                  onChange={(e) => setAutoForm({ ...autoForm, start_time: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Daily Sessions</label>
                <select
                  className="form-control"
                  value={autoForm.sessions_per_day}
                  onChange={(e) => setAutoForm({ ...autoForm, sessions_per_day: Number(e.target.value) })}
                >
                  <option value={4}>4 sessions (Midterms)</option>
                  <option value={2}>2 sessions (Terminal)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Paper Duration</label>
                <select
                  className="form-control"
                  value={autoForm.duration_minutes}
                  onChange={(e) => setAutoForm({ ...autoForm, duration_minutes: Number(e.target.value) })}
                >
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option.minutes} value={option.minutes}>{option.label}</option>
                  ))}
                </select>
              </div>

              {Number(autoForm.sessions_per_day) === 4 && (
                <div className="form-group">
                  <label className="form-label">Break Between Sessions</label>
                  <select
                    className="form-control"
                    value={autoForm.break_minutes}
                    onChange={(e) => setAutoForm({ ...autoForm, break_minutes: Number(e.target.value) })}
                  >
                    {SESSION_BREAK_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>{longBreakLabel(minutes)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Long Break (Morning → Afternoon)</label>
                <select
                  className="form-control"
                  value={autoForm.long_break_minutes}
                  onChange={(e) => setAutoForm({ ...autoForm, long_break_minutes: Number(e.target.value) })}
                >
                  {LONG_BREAK_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>{longBreakLabel(minutes)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Daily End Time (Auto-calculated)</label>
                <div
                  className="form-control"
                  style={{
                    background: '#f8f5ec',
                    border: '1px solid #e2e0d6',
                    fontWeight: 600,
                    color: 'var(--iiui-navy, #1e3a5f)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {previewCalculation.valid ? formatTime12(previewCalculation.endTime) : '—'}
                </div>
              </div>
            </div>

            <div className="form-group" style={{ display: 'flex', gap: '1.5rem', marginTop: '0.6rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoForm.skip_weekends}
                  onChange={(e) => setAutoForm({ ...autoForm, skip_weekends: e.target.checked })}
                />
                Skip Weekends (Saturday &amp; Sunday)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoForm.replace_existing}
                  onChange={(e) => setAutoForm({ ...autoForm, replace_existing: e.target.checked })}
                />
                Replace Existing Time Slots
              </label>
            </div>
          </form>
        )}
      </Modal>

      {/* Single Add / Edit Modal */}
      <Modal
        isOpen={isSingleModalOpen}
        busy={isSubmitting}
        title={editingSlot ? `Edit Slot ${editingSlot.id}` : 'Create Single Examination Slot'}
        onClose={() => setIsSingleModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setIsSingleModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSingleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : editingSlot ? 'Update Slot' : 'Create Slot'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSingleSubmit}>
          <div className="form-group">
            <label className="form-label">Examination Date</label>
            <DatePicker
              id="single-slot-date"
              value={singleFormData.date}
              onChange={(date) => setSingleFormData({ ...singleFormData, date })}
              onInvalid={(message) => showBanner(message, 'danger')}
              placeholder="Select examination date"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                Session Start Time {singleFormData.start_time ? `(${formatTime12(singleFormData.start_time)})` : ''}
              </label>
              <input
                type="time"
                className="form-control"
                value={singleFormData.start_time}
                onChange={(e) => setSingleFormData({ ...singleFormData, start_time: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Session End Time {singleFormData.end_time ? `(${formatTime12(singleFormData.end_time)})` : ''}
              </label>
              <input
                type="time"
                className="form-control"
                value={singleFormData.end_time}
                onChange={(e) => setSingleFormData({ ...singleFormData, end_time: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Session Label</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Morning 1, Afternoon 1"
              value={singleFormData.label}
              onChange={(e) => setSingleFormData({ ...singleFormData, label: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteConfirm)}
        busy={isSubmitting}
        title="Confirm Slot Deletion"
        onClose={() => setDeleteConfirm(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => handleDelete(deleteConfirm.id)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: '0.88rem' }}>
          Are you sure you want to delete time slot <strong>{deleteConfirm?.id}</strong> on{' '}
          <strong>{deleteConfirm?.date}</strong> ({formatTimeRange12(deleteConfirm?.start_time, deleteConfirm?.end_time)})?
        </p>
      </Modal>

      {/* Clear All Confirmation Modal */}
      <Modal
        isOpen={clearAllConfirm}
        busy={isSubmitting}
        title="Confirm Clear All Time Slots"
        onClose={() => setClearAllConfirm(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setClearAllConfirm(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={handleClearAll}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Clearing...' : 'Yes, Clear All Slots'}
            </button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: '0.88rem' }}>
          Are you sure you want to delete all <strong>{slots.length}</strong> time slots?
        </p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--itms-danger)' }}>
          You can re-generate them at any time using the <strong>Auto Generate Time Slots</strong> tool.
        </p>
      </Modal>

      {/* Preset Customization / Edit Modal */}
      <Modal
        isOpen={Boolean(editingPresetKey && presetEditForm)}
        busy={isSubmitting}
        title={`Customize ${presetEditForm?.name || 'Preset'}`}
        size="md"
        onClose={() => { setEditingPresetKey(null); setPresetEditForm(null); }}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => { setEditingPresetKey(null); setPresetEditForm(null); }}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSavePresetEdit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Preset Changes'}
            </button>
          </>
        }
      >
        {presetEditForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Preset Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={presetEditForm.name}
                  onChange={(e) => setPresetEditForm({ ...presetEditForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ maxWidth: '170px' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Total Days {editingPresetKey === 'midterm' ? '(7-10)' : '(7-18)'}
                </label>
                <input
                  type="number"
                  min={editingPresetKey === 'midterm' ? 7 : 7}
                  max={editingPresetKey === 'midterm' ? 10 : 18}
                  className="form-control"
                  value={presetEditForm.days}
                  onChange={(e) => setPresetEditForm({ ...presetEditForm, days: parseInt(e.target.value, 10) || 1 })}
                  required
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                  Daily Examination Sessions ({presetEditForm.sessions.length}) — fixed for {editingPresetKey === 'midterm' ? 'midterms' : 'terminal exams'}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <label htmlFor="preset-long-break" style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--iiui-navy)' }}>
                    Morning → Afternoon Break
                  </label>
                  <select
                    id="preset-long-break"
                    className="form-control"
                    style={{ width: 'auto', fontSize: '0.78rem', padding: '4px 8px' }}
                    value={presetEditForm.long_break_minutes}
                    onChange={(e) => {
                      const breakMinutes = Number(e.target.value);
                      setPresetEditForm({
                        ...presetEditForm,
                        long_break_minutes: breakMinutes,
                        sessions: applyLongBreak(presetEditForm.sessions, breakMinutes, editingPresetKey),
                      });
                    }}
                  >
                    {LONG_BREAK_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>{longBreakLabel(minutes)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {presetEditForm.sessions.map((sess, sIdx) => (
                  <div
                    key={sIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      padding: '0.5rem 0.75rem',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                    }}
                  >
                    <input
                      type="text"
                      className="form-control"
                      style={{ flex: 1.2, fontSize: '0.82rem' }}
                      value={sess.label}
                      placeholder="Session Label"
                      onChange={(e) => {
                        const copy = [...presetEditForm.sessions];
                        copy[sIdx].label = e.target.value;
                        setPresetEditForm({ ...presetEditForm, sessions: copy });
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="time"
                        className="form-control"
                        style={{ width: '105px', fontSize: '0.82rem', padding: '4px 6px' }}
                        value={sess.start_time}
                        onChange={(e) => {
                          const copy = [...presetEditForm.sessions];
                          copy[sIdx].start_time = e.target.value;
                          setPresetEditForm({ ...presetEditForm, sessions: copy });
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>to</span>
                      <input
                        type="time"
                        className="form-control"
                        style={{ width: '105px', fontSize: '0.82rem', padding: '4px 6px' }}
                        value={sess.end_time}
                        onChange={(e) => {
                          const copy = [...presetEditForm.sessions];
                          copy[sIdx].end_time = e.target.value;
                          setPresetEditForm({ ...presetEditForm, sessions: copy });
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--iiui-navy)', minWidth: '135px' }}>
                      {formatTimeRange12(sess.start_time, sess.end_time)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Preset Replace Confirmation Modal */}
      <Modal
        isOpen={Boolean(presetConfirm)}
        busy={isSubmitting}
        title="Confirm Preset Application"
        onClose={() => setPresetConfirm(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setPresetConfirm(null)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => executePreset(presetConfirm)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Applying...' : 'Yes, Replace & Generate'}
            </button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--itms-text)' }}>
          Replace existing <strong>{slots.length}</strong> time slot(s) with the{' '}
          <strong>{presetConfirm === 'midterm' ? 'IIUI Midterm' : 'Terminal Exam'}</strong> preset?
        </p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--itms-text-muted)', lineHeight: 1.45 }}>
          This will replace all current examination slots and generate the official preset starting from{' '}
          <strong>{presetDate}</strong>.
        </p>
      </Modal>
    </div>
  );
}
