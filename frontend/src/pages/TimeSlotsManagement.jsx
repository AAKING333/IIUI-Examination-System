import React, { useState, useMemo, useEffect } from 'react';
import Modal from '../components/Modal.jsx';
import { masterDataService } from '../services/index.js';
import { formatTime12, formatTimeRange12, formatSlotTime, formatDateAndSlotTime } from '../utils/timeFormat.js';

export default function TimeSlotsManagement({ slots = [], onRefresh, showBanner }) {
  // Auto-generate modal state
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [generateMode, setGenerateMode] = useState('preset'); // 'preset' | 'custom'
  const [autoForm, setAutoForm] = useState({
    from_date: '2026-11-10',
    to_date: '2026-11-12',
    start_time: '08:30',
    end_time: '17:40',
    duration_minutes: 90,
    break_minutes: 15,
    skip_weekends: true,
    replace_existing: true,
  });

  // Single Slot Add / Edit modal state
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [singleFormData, setSingleFormData] = useState({
    date: '2026-10-26',
    start_time: '08:45',
    end_time: '10:15',
    label: 'Morning 1',
    slot_type: 'written',
  });
  const [presetDate, setPresetDate] = useState('2026-10-26');
  const [studyHolidays, setStudyHolidays] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('midterm'); // 'midterm' | 'terminal'

  // Editable Preset Templates
  const [presetTemplates, setPresetTemplates] = useState({
    midterm: {
      name: 'Midterm Examination',
      days: 8,
      sessions: [
        { start_time: '08:45', end_time: '10:15', label: 'Morning 1', slot_type: 'written' },
        { start_time: '10:30', end_time: '12:00', label: 'Morning 2', slot_type: 'written' },
        { start_time: '14:30', end_time: '16:00', label: 'Afternoon 1', slot_type: 'written' },
        { start_time: '16:15', end_time: '17:45', label: 'Afternoon 2', slot_type: 'written' },
      ],
    },
    terminal: {
      name: 'Terminal Examination',
      days: 18,
      sessions: [
        { start_time: '08:45', end_time: '11:45', label: 'Morning', slot_type: 'written' },
        { start_time: '14:30', end_time: '17:30', label: 'Afternoon', slot_type: 'written' },
      ],
    },
  });

  const [editingPresetKey, setEditingPresetKey] = useState(null); // 'midterm' | 'terminal' | null
  const [presetEditForm, setPresetEditForm] = useState(null);

  useEffect(() => {
    masterDataService.getPresetTemplates()
      .then((data) => {
        if (data && data.midterm && data.terminal) {
          setPresetTemplates(data);
        }
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
      sessions: (current.sessions || []).map((s) => ({ ...s })),
    });
  };

  const handleSavePresetEdit = async () => {
    if (!editingPresetKey || !presetEditForm) return;
    const updated = {
      ...presetTemplates,
      [editingPresetKey]: {
        ...presetTemplates[editingPresetKey],
        ...presetEditForm,
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
      const dStart = new Date(autoForm.from_date);
      const dEnd = new Date(autoForm.to_date);

      if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime()) || dEnd < dStart) {
        return { valid: false, error: 'End date must be greater than or equal to start date.' };
      }

      const startMin = timeToMin(autoForm.start_time);
      const endMin = timeToMin(autoForm.end_time);
      const duration = Number(autoForm.duration_minutes) || 0;
      const breakMin = Number(autoForm.break_minutes) || 0;

      if (duration <= 0) {
        return { valid: false, error: 'Slot duration must be greater than 0.' };
      }
      if (endMin <= startMin) {
        return { valid: false, error: 'Day end time must be later than start time.' };
      }
      if (endMin - startMin < duration) {
        return { valid: false, error: 'Day time window is shorter than a single slot duration.' };
      }

      // Compute day slots
      const daySlots = [];
      let curr = startMin;
      let sessionIndex = 1;

      while (curr + duration <= endMin) {
        const slotEnd = curr + duration;
        let label = `Session ${sessionIndex}`;
        if (sessionIndex === 1) label = 'Morning 1';
        else if (sessionIndex === 2) label = 'Morning 2';
        else if (sessionIndex === 3) label = 'Afternoon 1';
        else if (sessionIndex === 4) label = 'Afternoon 2';
        else if (sessionIndex === 5) label = 'Evening 1';

        daySlots.push({
          start: minToTime(curr),
          end: minToTime(slotEnd),
          label,
        });

        sessionIndex += 1;
        curr = slotEnd + breakMin;
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
            sampleDates.push(curDate.toISOString().slice(0, 10));
          }
        }
        curDate.setDate(curDate.getDate() + 1);
      }

      return {
        valid: true,
        slotsPerDay: daySlots.length,
        daySlots,
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
          end_time: autoForm.end_time,
          duration_minutes: Number(autoForm.duration_minutes),
          break_minutes: Number(autoForm.break_minutes),
          skip_weekends: autoForm.skip_weekends,
          replace_existing: autoForm.replace_existing,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to auto-generate slots.');
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
      date: slots.length ? slots[slots.length - 1].date : '2026-10-26',
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
    if (!presetDate) {
      showBanner('Choose a start date for the exam preset.', 'danger');
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
          custom_sessions: template?.sessions,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || 'Preset creation failed.');
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
      showBanner('Date, start time, and end time are required.', 'danger');
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
        if (!res.ok) throw new Error(await res.text());
        showBanner(`Time Slot "${editingSlot.id}" updated successfully.`, 'success');
      } else {
        const res = await fetch('/api/time-slots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(singleFormData),
        });
        if (!res.ok) throw new Error(await res.text());
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

  const formatDisplayDate = (dStr) => {
    try {
      const d = new Date(dStr);
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dStr;
    }
  };

  return (
    <div className="itms-dash__main">
      <div className="itms-dash__pageHeader">
        <div>
          <h1 className="itms-dash__pageTitle">Exam Dates &amp; Time Slots</h1>
          <p className="itms-dash__pageSub">
            Configure examination dates, daily operational windows, and session timings (Morning/Afternoon).
          </p>
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

      <div className="card-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Slot ID</th>
              <th>Calendar Date</th>
              <th>Day of Week</th>
              <th>Session Window</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="badge badge--info">{s.id}</span>
                </td>
                <td>
                  <strong>{s.date}</strong>
                </td>
                <td>{formatDisplayDate(s.date)}</td>
                <td>
                  <span className="badge badge--muted" style={{ fontWeight: 600 }}>
                    {formatTimeRange12(s.start_time, s.end_time)}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
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
                </td>
              </tr>
            ))}
            {slots.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>
                  <p style={{ margin: 0, fontWeight: 500, color: 'var(--itms-text-muted)' }}>
                    No time slots configured. Click "Auto Generate Time Slots" above to generate them automatically.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Generation & Presets Modal */}
      <Modal
        isOpen={isAutoModalOpen}
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

        {generateMode === 'preset' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Exam Start Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={presetDate}
                  onChange={(e) => setPresetDate(e.target.value)}
                  required
                />
                <span className="form-hint">First examination date</span>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Study Holidays (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={studyHolidays}
                  onChange={(e) => setStudyHolidays(e.target.value)}
                  placeholder="e.g. 2026-11-01, 2026-11-05"
                />
                <span className="form-hint">Comma-separated dates to skip (YYYY-MM-DD)</span>
              </div>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
                Select Preset Schedule
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
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
                <input
                  type="date"
                  className="form-control"
                  value={autoForm.from_date}
                  onChange={(e) => setAutoForm({ ...autoForm, from_date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">To Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={autoForm.to_date}
                  onChange={(e) => setAutoForm({ ...autoForm, to_date: e.target.value })}
                  required
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
                <span className="form-hint">e.g. 08:30 (Morning start)</span>
              </div>
              <div className="form-group">
                <label className="form-label">Daily Exam End Time</label>
                <input
                  type="time"
                  className="form-control"
                  value={autoForm.end_time}
                  onChange={(e) => setAutoForm({ ...autoForm, end_time: e.target.value })}
                  required
                />
                <span className="form-hint">e.g. 17:40 (Evening close)</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Slot Duration (Minutes)</label>
                <input
                  type="number"
                  min="15"
                  max="300"
                  step="5"
                  className="form-control"
                  value={autoForm.duration_minutes}
                  onChange={(e) =>
                    setAutoForm({ ...autoForm, duration_minutes: parseInt(e.target.value, 10) || 0 })
                  }
                  required
                />
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    { m: 90, label: '1 hr 30 mins (90m)' },
                    { m: 75, label: '1 hr 15 mins (75m)' },
                    { m: 120, label: '2 hrs (120m)' },
                  ].map((preset) => (
                    <button
                      key={preset.m}
                      type="button"
                      className={`btn btn--sm ${autoForm.duration_minutes === preset.m ? 'btn--primary' : 'btn--outline'}`}
                      onClick={() => setAutoForm({ ...autoForm, duration_minutes: preset.m })}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Interval / Break Between Slots (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  step="5"
                  className="form-control"
                  value={autoForm.break_minutes}
                  onChange={(e) =>
                    setAutoForm({ ...autoForm, break_minutes: parseInt(e.target.value, 10) || 0 })
                  }
                />
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    { m: 15, label: '15 mins break' },
                    { m: 10, label: '10 mins break' },
                    { m: 0, label: 'No break (0m)' },
                  ].map((preset) => (
                    <button
                      key={preset.m}
                      type="button"
                      className={`btn btn--sm ${autoForm.break_minutes === preset.m ? 'btn--primary' : 'btn--outline'}`}
                      onClick={() => setAutoForm({ ...autoForm, break_minutes: preset.m })}
                    >
                      {preset.label}
                    </button>
                  ))}
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
            <label className="form-label">Examination Date (YYYY-MM-DD)</label>
            <input
              type="date"
              className="form-control"
              value={singleFormData.date}
              onChange={(e) => setSingleFormData({ ...singleFormData, date: e.target.value })}
              required
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
              <div className="form-group" style={{ maxWidth: '140px' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Total Days</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  className="form-control"
                  value={presetEditForm.days}
                  onChange={(e) => setPresetEditForm({ ...presetEditForm, days: parseInt(e.target.value, 10) || 1 })}
                  required
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                  Daily Examination Sessions ({presetEditForm.sessions.length})
                </label>
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  onClick={() => {
                    const newSession = {
                      start_time: '08:45',
                      end_time: '10:15',
                      label: `Session ${presetEditForm.sessions.length + 1}`,
                      slot_type: 'written',
                    };
                    setPresetEditForm({
                      ...presetEditForm,
                      sessions: [...presetEditForm.sessions, newSession],
                    });
                  }}
                  style={{ fontSize: '0.74rem', padding: '2px 8px' }}
                >
                  + Add Session
                </button>
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
                    {presetEditForm.sessions.length > 1 && (
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        style={{ padding: '2px 6px', fontSize: '0.74rem' }}
                        onClick={() => {
                          const copy = presetEditForm.sessions.filter((_, i) => i !== sIdx);
                          setPresetEditForm({ ...presetEditForm, sessions: copy });
                        }}
                        title="Remove session"
                      >
                        Delete
                      </button>
                    )}
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
