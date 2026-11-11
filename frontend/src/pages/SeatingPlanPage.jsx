import React, { useState, useEffect, useMemo } from 'react';
import { Printer, Download, RotateCcw, Clock, Calendar, Layers } from 'lucide-react';
import Modal from '../components/Modal.jsx';

const getCleanTeacher = (inst) => {
  if (!inst) return '';
  let cleaned = inst.replace(/\s*\((?:BSCS|BSIT|BSSE|BS)[^)]*\)/gi, '').trim();
  if (!cleaned.includes('|') && !cleaned.includes(':')) return cleaned;

  // If text has pipe-separated program sections: "BSCS F24 Sec A: Dr. Sajid Ali Khan | BSIT F24 Sec A: Engr. Tariq Saleem"
  const parts = cleaned.split('|').map((p) => p.trim()).filter(Boolean);
  const teachers = [];
  parts.forEach((p) => {
    let name = p;
    if (name.includes(':')) {
      name = name.split(':')[1].trim();
    }
    name = name.replace(/\([^)]*\)/g, '').trim();
    if (name && !teachers.includes(name)) {
      teachers.push(name);
    }
  });

  return teachers.length > 0 ? teachers.join(' / ') : cleaned;
};

export default function SeatingPlanPage({ slots = [], datesheet = { datesheet: [] }, courses = [] }) {
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [plan, setPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Bulk print state
  const [isPrintingAll, setIsPrintingAll] = useState(false);
  const [bulkPlans, setBulkPlans] = useState([]);
  const [bulkScope, setBulkScope] = useState('date'); // 'date' | 'all'
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printScope, setPrintScope] = useState('current'); // 'current' | 'date' | 'all'

  const distinctDates = useMemo(() => {
    return Array.from(new Set(slots.map((s) => s.date))).filter(Boolean);
  }, [slots]);

  const courseMap = useMemo(() => {
    const map = {};
    (courses || []).forEach((c) => {
      map[c.code] = c.instructor;
    });
    ((datesheet && datesheet.datesheet) || []).forEach((d) => {
      if (!map[d.course_code] && d.instructor) {
        map[d.course_code] = d.instructor;
      }
    });
    return map;
  }, [courses, datesheet]);

  // Set default slot & date if none selected
  useEffect(() => {
    if (slots.length > 0) {
      if (!selectedSlotId || !slots.some((s) => s.id === selectedSlotId)) {
        setSelectedSlotId(slots[0].id);
        setSelectedDate(slots[0].date);
      } else if (!selectedDate) {
        const found = slots.find((s) => s.id === selectedSlotId);
        if (found) setSelectedDate(found.date);
      }
    }
  }, [slots, selectedSlotId, selectedDate]);

  const availableSlotsForDate = useMemo(() => {
    if (!selectedDate) return slots;
    return slots.filter((s) => s.date === selectedDate);
  }, [slots, selectedDate]);

  const currentSlot = useMemo(() => {
    return slots.find((s) => s.id === selectedSlotId);
  }, [slots, selectedSlotId]);

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    const slotsForDate = slots.filter((s) => s.date === newDate);
    if (slotsForDate.length > 0) {
      setSelectedSlotId(slotsForDate[0].id);
    }
    setBulkPlans([]);
  };

  const handleTimeChange = (newSlotId) => {
    setSelectedSlotId(newSlotId);
    const found = slots.find((s) => s.id === newSlotId);
    if (found && found.date !== selectedDate) {
      setSelectedDate(found.date);
    }
    setBulkPlans([]);
  };

  const formatDateLabel = (dStr) => {
    try {
      const d = new Date(dStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dStr;
    }
  };

  // Load single plan when selectedSlotId changes
  const fetchPlan = async (slotId) => {
    if (!slotId) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seating-plan?slot_id=${slotId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch seating plan for this slot.');
      }
      const data = await res.json();
      setPlan(data);
    } catch (err) {
      setPlan(null);
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSlotId) {
      fetchPlan(selectedSlotId);
    }
  }, [selectedSlotId]);

  const handleRegenerate = async () => {
    if (!selectedSlotId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/seating-plan/generate?slot_id=${selectedSlotId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Regeneration failed.');
      const data = await res.json();
      setPlan(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch and print all plans for day or entire schedule
  const handlePrintAll = async (scope = 'date') => {
    const targetSlots = scope === 'all'
      ? slots
      : slots.filter((s) => s.date === selectedDate);

    if (!targetSlots.length) {
      setErrorMsg('No examination slots found for the selected printing scope.');
      return;
    }

    setIsPrintingAll(true);
    setBulkScope(scope);
    setErrorMsg('');

    try {
      const responses = await Promise.all(
        targetSlots.map((s) =>
          fetch(`/api/seating-plan?slot_id=${s.id}`).then((r) => (r.ok ? r.json() : null))
        )
      );
      const loadedPlans = responses.filter(Boolean);
      if (!loadedPlans.length) {
        throw new Error('Unable to generate seating sheets for the selected slots.');
      }

      setBulkPlans(loadedPlans);

      // Give React a tick to mount all the sheets into the DOM before opening the print dialog
      setTimeout(() => {
        window.print();
        setIsPrintingAll(false);
      }, 400);
    } catch (err) {
      setErrorMsg(err.message || 'Error occurred while loading bulk seating sheets.');
      setIsPrintingAll(false);
    }
  };

  const handleExecutePrint = () => {
    setIsPrintModalOpen(false);
    if (printScope === 'current') {
      setBulkPlans([]);
      setTimeout(() => window.print(), 120);
    } else if (printScope === 'date') {
      handlePrintAll('date');
    } else if (printScope === 'all') {
      handlePrintAll('all');
    }
  };

  const renderDcsSheets = (planData) => {
    if (!planData || !planData.rooms || !planData.rooms.length) {
      return (
        <div
          className="card-table-wrapper"
          style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--itms-text-muted)' }}
        >
          No rooms or seating allocations found for this examination slot.
        </div>
      );
    }

    return planData.rooms.map((room) => {
      const sheet = room.seating_sheet;
      if (!sheet || !sheet.columns) return null;
      const maxRows = Math.max(room.rows || 0, ...sheet.columns.map((c) => c.roll_nos.length), 0);

      return (
        <div
          key={`${planData.slot_id || planData.date}-${room.room_id}`}
          className="dcs-seating-sheet"
        >
          <div className="dcs-seating-sheet__header">
            <h2>INTERNATIONAL ISLAMIC UNIVERSITY, ISLAMABAD</h2>
            <h3>DEPARTMENT OF COMPUTER SCIENCE &amp; INFORMATION TECHNOLOGY</h3>
            <h4>OFFICIAL EXAMINATION SEATING ARRANGEMENT SHEET</h4>
            <p>
              <strong>Date:</strong> {planData.date} &bull; <strong>Time Slot:</strong> {planData.start_time} &ndash;{' '}
              {planData.end_time} &bull; <strong>Room:</strong> {room.room_name}
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              className="data-table"
              style={{
                textAlign: 'center',
                border: '1px solid #000',
                width: '100%',
                tableLayout: 'auto',
              }}
            >
              <thead>
                <tr>
                  {sheet.columns.map((col) => (
                    <th
                      key={col.column_no}
                      style={{
                        background: 'var(--iiui-green-50)',
                        color: 'var(--iiui-green-900)',
                        textAlign: 'center',
                        borderRight: '1px solid #cbd5e1',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '6px 4px',
                        minWidth: '85px',
                        maxWidth: '120px',
                      }}
                    >
                      Column {String(col.column_no).padStart(2, '0')}
                    </th>
                  ))}
                </tr>
                <tr>
                  {sheet.columns.map((col) => {
                    const isVacant = !col.paper || col.paper === '—' || col.paper.includes('Vacant');
                    const spacedCode = (col.paper || '').replace(/^([A-Za-z]+)(\d+)/, '$1 $2');
                    const rawInst = col.instructor || courseMap[col.paper] || '';
                    const cleanInst = getCleanTeacher(rawInst);
                    const rawHeader = isVacant
                      ? '— (Vacant)'
                      : col.paper_header || (cleanInst ? `${spacedCode} - ${cleanInst}` : spacedCode);
                    const headerText = rawHeader.replace(/\s*\((?:BSCS|BSIT|BSSE|BS)[^)]*\)/gi, '').trim();

                    return (
                      <th
                        key={col.column_no}
                        style={{
                          background: isVacant ? 'var(--itms-surface-muted)' : 'var(--iiui-navy-50)',
                          color: isVacant ? 'var(--itms-text-muted)' : 'var(--iiui-navy)',
                          textAlign: 'center',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          borderRight: '1px solid #cbd5e1',
                          padding: '5px 4px',
                          minWidth: '85px',
                          maxWidth: '120px',
                          whiteSpace: 'normal',
                          lineHeight: 1.25,
                        }}
                        title={headerText}
                      >
                        {isVacant ? (
                          <span style={{ color: 'var(--itms-text-muted)' }}>&mdash; (Vacant)</span>
                        ) : (
                          <div style={{ maxWidth: '115px', margin: '0 auto', wordBreak: 'break-word' }}>
                            {headerText}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxRows }, (_, ri) => (
                  <tr key={ri}>
                    {sheet.columns.map((col) => {
                      const isVacant = !col.paper || col.paper === '—' || col.paper.includes('Vacant');
                      return (
                        <td
                          key={col.column_no}
                          style={{
                            borderRight: '1px solid #cbd5e1',
                            fontWeight: col.roll_nos[ri] ? 600 : 400,
                            fontSize: '0.74rem',
                            fontFamily: 'monospace',
                            background: isVacant ? '#fafafa' : 'transparent',
                            padding: '4px 6px',
                            minWidth: '85px',
                            maxWidth: '120px',
                            height: '26px',
                          }}
                        >
                          {col.roll_nos[ri] || ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="itms-dash__main">
      <div
        className="itms-dash__pageHeader no-print"
        style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem', marginBottom: '1.5rem' }}
      >
        {/* Title row */}
        <div>
          <h1 className="itms-dash__pageTitle">Room Seating Plan Matrix &amp; Arrangements</h1>
          <p className="itms-dash__pageSub">
            Official DCS examination seating arrangement sheet with column rotation enforcing no same-course adjacent seating.
          </p>
        </div>

        {/* Filters and action buttons row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.85rem',
          }}
        >
          {/* Left filters: Date and Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--itms-text-muted)' }}>Date:</span>
              <select
                className="form-control"
                style={{ width: 'auto', fontWeight: 600, fontSize: '0.84rem', padding: '6px 10px' }}
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                title="Select examination date"
              >
                {distinctDates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateLabel(d)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--itms-text-muted)' }}>Time:</span>
              <select
                className="form-control"
                style={{ width: 'auto', fontWeight: 600, fontSize: '0.84rem', padding: '6px 10px' }}
                value={selectedSlotId}
                onChange={(e) => handleTimeChange(e.target.value)}
                title="Select session time slot"
              >
                {availableSlotsForDate.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.start_time} &ndash; {s.end_time}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right actions - Clean, compact hierarchy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--outline"
              onClick={handleRegenerate}
              disabled={isLoading || !selectedSlotId || isPrintingAll}
              title="Recalculate allocations for this slot"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <RotateCcw size={14} />
              {isLoading ? 'Recalculating...' : 'Recalculate'}
            </button>

            <a
              href={`/api/seating-plan/export.xlsx?slot_id=${selectedSlotId}`}
              className={`btn btn--outline ${!plan ? 'disabled' : ''}`}
              download
              style={{
                pointerEvents: !plan ? 'none' : 'auto',
                opacity: !plan ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
              title="Download Excel spreadsheet for this slot"
            >
              <Download size={14} />
              Export Excel
            </a>

            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setIsPrintModalOpen(true)}
              disabled={isPrintingAll || !plan}
              title="Open print options popup"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <Printer size={15} />
              {isPrintingAll ? 'Preparing Print...' : 'Print Seating Plans...'}
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert-banner alert-banner--warning no-print">
          <div>
            <strong>Notice:</strong> {errorMsg}
          </div>
        </div>
      )}

      {/* Bulk Print Mode active banner */}
      {bulkPlans.length > 0 && (
        <div
          className="alert-banner alert-banner--info no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            background: 'var(--iiui-green-50)',
            border: '1px solid var(--iiui-green-300)',
            color: 'var(--iiui-green-900)',
          }}
        >
          <div>
            <strong>Bulk Print Mode:</strong> Showing all{' '}
            {bulkPlans.reduce((acc, p) => acc + (p.rooms?.length || 0), 0)} room seating sheets across{' '}
            {bulkPlans.length} examination slots ({bulkScope === 'all' ? 'All Dates' : selectedDate}).
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => window.print()}
            >
              Print Again
            </button>
            <button
              type="button"
              className="btn btn--sm btn--outline"
              onClick={() => setBulkPlans([])}
            >
              Back to Single Slot
            </button>
          </div>
        </div>
      )}

      {/* DCS Seating Sheets */}
      <div className="dcs-sheets-container">
        {bulkPlans.length > 0 ? (
          bulkPlans.map((bp) => renderDcsSheets(bp))
        ) : (
          plan && renderDcsSheets(plan)
        )}
      </div>

      {/* Print Options Modal Popup */}
      <Modal
        isOpen={isPrintModalOpen}
        title="Print Seating Arrangements"
        size="default"
        onClose={() => setIsPrintModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setIsPrintModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleExecutePrint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <Printer size={15} />
              Print Selected Sheets
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.25rem 0' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.84rem', color: 'var(--itms-text-secondary)' }}>
            Choose which examination session sheets you want to generate for printing:
          </p>

          {/* Option 1: Current Slot */}
          <div
            onClick={() => setPrintScope('current')}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              border: printScope === 'current' ? '2px solid var(--iiui-green)' : '1px solid var(--itms-border)',
              background: printScope === 'current' ? 'var(--iiui-green-50)' : 'var(--itms-surface)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            <div
              style={{
                color: printScope === 'current' ? 'var(--iiui-green)' : 'var(--itms-text-muted)',
                background: printScope === 'current' ? '#ffffff' : '#f1f5f9',
                padding: '0.5rem',
                borderRadius: '6px',
                marginTop: '2px',
              }}
            >
              <Clock size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--iiui-navy)' }}>
                  Current Slot Only
                </strong>
                {printScope === 'current' && (
                  <span style={{ color: 'var(--iiui-green)', fontWeight: 700, fontSize: '0.78rem' }}>Selected</span>
                )}
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>
                Prints active halls for <strong>{selectedDate}</strong> ({currentSlot?.start_time || ''} &ndash; {currentSlot?.end_time || ''}).
              </p>
            </div>
          </div>

          {/* Option 2: Today's Slots */}
          <div
            onClick={() => setPrintScope('date')}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              border: printScope === 'date' ? '2px solid var(--iiui-green)' : '1px solid var(--itms-border)',
              background: printScope === 'date' ? 'var(--iiui-green-50)' : 'var(--itms-surface)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            <div
              style={{
                color: printScope === 'date' ? 'var(--iiui-green)' : 'var(--itms-text-muted)',
                background: printScope === 'date' ? '#ffffff' : '#f1f5f9',
                padding: '0.5rem',
                borderRadius: '6px',
                marginTop: '2px',
              }}
            >
              <Calendar size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--iiui-navy)' }}>
                  Today's Slots ({availableSlotsForDate.length} Sessions)
                </strong>
                {printScope === 'date' && (
                  <span style={{ color: 'var(--iiui-green)', fontWeight: 700, fontSize: '0.78rem' }}>Selected</span>
                )}
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>
                Prints all rooms across all session windows on <strong>{selectedDate}</strong> in chronological order.
              </p>
            </div>
          </div>

          {/* Option 3: All Dates */}
          <div
            onClick={() => setPrintScope('all')}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              border: printScope === 'all' ? '2px solid var(--iiui-green)' : '1px solid var(--itms-border)',
              background: printScope === 'all' ? 'var(--iiui-green-50)' : 'var(--itms-surface)',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            <div
              style={{
                color: printScope === 'all' ? 'var(--iiui-green)' : 'var(--itms-text-muted)',
                background: printScope === 'all' ? '#ffffff' : '#f1f5f9',
                padding: '0.5rem',
                borderRadius: '6px',
                marginTop: '2px',
              }}
            >
              <Layers size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--iiui-navy)' }}>
                  All Exam Dates ({slots.length} Total Sessions)
                </strong>
                {printScope === 'all' && (
                  <span style={{ color: 'var(--iiui-green)', fontWeight: 700, fontSize: '0.78rem' }}>Selected</span>
                )}
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>
                Batch compiles and prints the full seating roster for all examination dates in the semester.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
