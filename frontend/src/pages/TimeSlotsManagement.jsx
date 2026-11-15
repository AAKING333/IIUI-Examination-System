import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Sparkles, Calendar, Settings } from 'lucide-react';
import Modal from '../components/Modal.jsx';

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
      const res = await fetch('/api/time-slots/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset,
          from_date: presetDate,
          study_holidays: studyHolidays.split(',').map((date) => date.trim()).filter(Boolean),
          replace_existing: true,
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
            <Plus size={16} />
            Add Single Slot
          </button>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setGenerateMode('preset');
              setIsAutoModalOpen(true);
            }}
          >
            <Sparkles size={16} />
            Generate Time Slots
          </button>

          {slots.length > 0 && (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => setClearAllConfirm(true)}
              title="Delete all slots"
            >
              <Trash2 size={15} />
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
                  <span className="badge badge--muted">
                    {s.start_time} &ndash; {s.end_time}
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
                      <Trash2 size={13} /> Delete
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
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setIsAutoModalOpen(false)}
            >
              Close
            </button>
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
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--itms-border)', paddingBottom: '0.75rem' }}>
          <button
            type="button"
            className={`btn btn--sm ${generateMode === 'preset' ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setGenerateMode('preset')}
          >
            <Calendar size={14} style={{ marginRight: '0.35rem' }} />
            Official IIUI Presets
          </button>
          <button
            type="button"
            className={`btn btn--sm ${generateMode === 'custom' ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setGenerateMode('custom')}
          >
            <Settings size={14} style={{ marginRight: '0.35rem' }} />
            Custom Range Generator
          </button>
        </div>

        {generateMode === 'preset' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--iiui-green-50)', padding: '0.85rem 1.15rem', borderRadius: 'var(--itms-radius-sm)', border: '1px solid var(--iiui-green-200)' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--iiui-green-900)', fontWeight: 500 }}>
                Choose an official IIUI examination preset. The system will automatically build morning and afternoon examination sessions for the entire semester.
              </span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Preset Start Date</label>
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
                <label className="form-label">Study Holidays (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={studyHolidays}
                  onChange={(e) => setStudyHolidays(e.target.value)}
                  placeholder="YYYY-MM-DD, YYYY-MM-DD"
                />
                <span className="form-hint">Comma-separated dates to skip as study preparation days</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
              <div
                style={{
                  border: '1px solid var(--itms-border)',
                  borderRadius: 'var(--itms-radius)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'var(--itms-card-bg, #fff)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--iiui-navy)' }}>📘 IIUI Midterm Preset</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--itms-text-muted)', margin: 0, lineHeight: 1.45 }}>
                    Standard IIUI midterm schedule: 2 daily sessions (Morning 08:45–10:15 &amp; Morning 10:45–12:15) across 8 consecutive working days.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ marginTop: '1rem', width: '100%' }}
                  onClick={() => handleRequestPreset('midterm')}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Applying...' : 'Apply Midterm Preset'}
                </button>
              </div>

              <div
                style={{
                  border: '1px solid var(--itms-border)',
                  borderRadius: 'var(--itms-radius)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'var(--itms-card-bg, #fff)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--iiui-navy)' }}>🎓 Terminal Exam Preset</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--itms-text-muted)', margin: 0, lineHeight: 1.45 }}>
                    Comprehensive terminal exam schedule: 3 daily sessions (Morning 1, Morning 2, Afternoon) across 15–18 days with scheduled prep breaks.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ marginTop: '1rem', width: '100%' }}
                  onClick={() => handleRequestPreset('terminal')}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Applying...' : 'Apply Terminal Preset'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAutoGenerateSubmit}>
            <div style={{ background: 'var(--iiui-green-50)', padding: '0.85rem 1.15rem', borderRadius: 'var(--itms-radius-sm)', marginBottom: '1.25rem', border: '1px solid var(--iiui-green-200)' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--iiui-green-900)', fontWeight: 500 }}>
                Specify custom examination date ranges, operational hours, and session lengths. The engine will automatically compute and divide each day into chronological examination slots.
              </span>
            </div>

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
              <label className="form-label">Session Start Time (HH:MM)</label>
              <input
                type="time"
                className="form-control"
                value={singleFormData.start_time}
                onChange={(e) => setSingleFormData({ ...singleFormData, start_time: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Session End Time (HH:MM)</label>
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
          <strong>{deleteConfirm?.date}</strong> ({deleteConfirm?.start_time} &ndash;{' '}
          {deleteConfirm?.end_time})?
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
