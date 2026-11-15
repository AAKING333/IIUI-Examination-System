import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  Download,
  RotateCcw,
  Clock,
  Calendar,
  Layers,
  Edit3,
  Save,
  X,
  Trash2,
  ArrowRightLeft,
  Plus,
  Check,
  AlertCircle,
} from 'lucide-react';
import Modal from '../components/Modal.jsx';
import { seatingService } from '../services/index.js';

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

  // Interactive Editing State
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null); // { roomIdx, colIdx, rowIdx, roll, roomName, columnNo, ... }
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [transferModal, setTransferModal] = useState(null); // { sourceRoomIdx, sourceRoomName, targetRoomIdx }
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

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
    if (isEditMode && hasChanges) {
      if (!window.confirm('You have unsaved changes in the current seating plan. Discard and switch date?')) {
        return;
      }
    }
    setIsEditMode(false);
    setSelectedSeat(null);
    setHasChanges(false);
    setSelectedDate(newDate);
    const slotsForDate = slots.filter((s) => s.date === newDate);
    if (slotsForDate.length > 0) {
      setSelectedSlotId(slotsForDate[0].id);
    }
    setBulkPlans([]);
  };

  const handleTimeChange = (newSlotId) => {
    if (isEditMode && hasChanges) {
      if (!window.confirm('You have unsaved changes in the current seating plan. Discard and switch slot?')) {
        return;
      }
    }
    setIsEditMode(false);
    setSelectedSeat(null);
    setHasChanges(false);
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
      const data = await seatingService.getSeatingPlan(slotId);
      setPlan(data);
      setSelectedSeat(null);
      setHasChanges(false);
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
      const data = await seatingService.regeneratePlan(selectedSlotId);
      setPlan(data);
      setSelectedSeat(null);
      setHasChanges(false);
      setSaveSuccessMsg('Seating plan reset to algorithmic default.');
      setTimeout(() => setSaveSuccessMsg(''), 5000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Save customized plan to SQLite backend
  const handleSaveCustomPlan = async () => {
    if (!plan || !selectedSlotId) return;
    setIsSaving(true);
    setErrorMsg('');
    setSaveSuccessMsg('');
    try {
      const result = await seatingService.saveCustomPlan(plan);
      setPlan(result.plan);
      setHasChanges(false);
      setIsEditMode(false);
      setSelectedSeat(null);
      setSaveSuccessMsg('Seating plan saved successfully! Datesheet room allocations have been synchronized.');
      setTimeout(() => setSaveSuccessMsg(''), 7000);
    } catch (err) {
      setErrorMsg(err.message || 'Error occurred while saving seating plan.');
    } finally {
      setIsSaving(false);
    }
  };

  // Cell Click / Move / Swap logic
  const handleCellClick = (roomIdx, colIdx, rowIdx) => {
    if (!isEditMode) return;

    const room = plan.rooms[roomIdx];
    if (!room || !room.seating_sheet || !room.seating_sheet.columns) return;
    const col = room.seating_sheet.columns[colIdx];
    if (!col) return;
    const roll = (col.roll_nos[rowIdx] || '').trim();

    if (!selectedSeat) {
      // Must select an occupied seat first
      if (!roll) return;
      setSelectedSeat({
        roomIdx,
        colIdx,
        rowIdx,
        roll,
        roomName: room.room_name,
        columnNo: col.column_no,
        paper: col.paper,
        instructor: col.instructor,
        paper_header: col.paper_header,
      });
    } else {
      // Clicking the already-selected seat deselects it
      if (
        selectedSeat.roomIdx === roomIdx &&
        selectedSeat.colIdx === colIdx &&
        selectedSeat.rowIdx === rowIdx
      ) {
        setSelectedSeat(null);
        return;
      }

      // Execute Move or Swap
      const nextPlan = JSON.parse(JSON.stringify(plan));
      const srcRoom = nextPlan.rooms[selectedSeat.roomIdx];
      const srcCol = srcRoom.seating_sheet.columns[selectedSeat.colIdx];
      const dstRoom = nextPlan.rooms[roomIdx];
      const dstCol = dstRoom.seating_sheet.columns[colIdx];

      while (srcCol.roll_nos.length <= selectedSeat.rowIdx) srcCol.roll_nos.push('');
      while (dstCol.roll_nos.length <= rowIdx) dstCol.roll_nos.push('');

      const srcRoll = selectedSeat.roll;
      const dstRoll = (dstCol.roll_nos[rowIdx] || '').trim();

      // Swap
      srcCol.roll_nos[selectedSeat.rowIdx] = dstRoll;
      dstCol.roll_nos[rowIdx] = srcRoll;

      // Metadata propagation for newly occupied destination column
      if ((!dstCol.paper || dstCol.paper === '—' || dstCol.paper.includes('Vacant')) && srcRoll) {
        dstCol.paper = selectedSeat.paper;
        dstCol.instructor = selectedSeat.instructor;
        dstCol.paper_header = selectedSeat.paper_header;
      }

      // If source column is now empty, mark as vacant
      const srcRemaining = srcCol.roll_nos.filter((r) => r && r.trim()).length;
      if (srcRemaining === 0 && !dstRoll) {
        srcCol.paper = '—';
        srcCol.paper_header = '— (Vacant)';
      }

      // Recalculate seated counts
      srcRoom.seated = srcRoom.seating_sheet.columns.reduce(
        (acc, c) => acc + c.roll_nos.filter((r) => r && r.trim()).length,
        0
      );
      dstRoom.seated = dstRoom.seating_sheet.columns.reduce(
        (acc, c) => acc + c.roll_nos.filter((r) => r && r.trim()).length,
        0
      );

      setPlan(nextPlan);
      setHasChanges(true);
      setSelectedSeat(null);
    }
  };

  // Add extra row to a room to allow extra capacity
  const handleAddRow = (roomIdx) => {
    const nextPlan = JSON.parse(JSON.stringify(plan));
    const r = nextPlan.rooms[roomIdx];
    const currentMax = Math.max(r.rows || 0, ...r.seating_sheet.columns.map((c) => c.roll_nos.length), 0);
    const newRows = currentMax + 1;
    r.rows = newRows;
    const colCount = r.columns || r.seating_sheet.columns.length;
    r.capacity = (r.capacity || 25) + colCount;
    r.usable_capacity = r.capacity;
    r.seating_sheet.columns.forEach((c) => {
      while (c.roll_nos.length < newRows) {
        c.roll_nos.push('');
      }
    });
    setPlan(nextPlan);
    setHasChanges(true);
  };

  // Transfer all seated students from one room to another
  const handleExecuteTransfer = () => {
    if (!transferModal || transferModal.targetRoomIdx === undefined) return;
    const { sourceRoomIdx, targetRoomIdx } = transferModal;
    if (sourceRoomIdx === targetRoomIdx) return;

    const nextPlan = JSON.parse(JSON.stringify(plan));
    const srcRoom = nextPlan.rooms[sourceRoomIdx];
    const dstRoom = nextPlan.rooms[targetRoomIdx];

    // Collect all students from srcRoom
    const students = [];
    srcRoom.seating_sheet.columns.forEach((col) => {
      col.roll_nos.forEach((roll, ri) => {
        if (roll && roll.trim()) {
          students.push({
            roll: roll.trim(),
            paper: col.paper,
            instructor: col.instructor,
            paper_header: col.paper_header,
          });
          col.roll_nos[ri] = '';
        }
      });
      col.paper = '—';
      col.paper_header = '— (Vacant)';
    });

    if (students.length === 0) {
      setTransferModal(null);
      return;
    }

    let studentIdx = 0;
    const maxRowsDst = Math.max(dstRoom.rows || 0, ...dstRoom.seating_sheet.columns.map((c) => c.roll_nos.length), 0);

    // 1. Fill empty cells in dstRoom
    for (let r = 0; r < maxRowsDst && studentIdx < students.length; r++) {
      for (let c = 0; c < dstRoom.seating_sheet.columns.length && studentIdx < students.length; c++) {
        const col = dstRoom.seating_sheet.columns[c];
        while (col.roll_nos.length <= r) col.roll_nos.push('');
        if (!col.roll_nos[r] || !col.roll_nos[r].trim()) {
          const st = students[studentIdx++];
          col.roll_nos[r] = st.roll;
          if (!col.paper || col.paper === '—' || col.paper.includes('Vacant')) {
            col.paper = st.paper;
            col.instructor = st.instructor;
            col.paper_header = st.paper_header;
          }
        }
      }
    }

    // 2. Expand rows in dstRoom if more capacity is required
    while (studentIdx < students.length) {
      const newRowIdx = Math.max(dstRoom.rows || 0, ...dstRoom.seating_sheet.columns.map((c) => c.roll_nos.length), 0);
      dstRoom.rows = newRowIdx + 1;
      dstRoom.capacity = (dstRoom.capacity || 25) + dstRoom.seating_sheet.columns.length;
      dstRoom.usable_capacity = dstRoom.capacity;
      for (let c = 0; c < dstRoom.seating_sheet.columns.length && studentIdx < students.length; c++) {
        const col = dstRoom.seating_sheet.columns[c];
        while (col.roll_nos.length <= newRowIdx) col.roll_nos.push('');
        const st = students[studentIdx++];
        col.roll_nos[newRowIdx] = st.roll;
        if (!col.paper || col.paper === '—' || col.paper.includes('Vacant')) {
          col.paper = st.paper;
          col.instructor = st.instructor;
          col.paper_header = st.paper_header;
        }
      }
    }

    // Recalculate seated counts
    srcRoom.seated = 0;
    dstRoom.seated = dstRoom.seating_sheet.columns.reduce(
      (acc, c) => acc + c.roll_nos.filter((r) => r && r.trim()).length,
      0
    );

    setPlan(nextPlan);
    setHasChanges(true);
    setTransferModal(null);
    setSaveSuccessMsg(
      `Transferred ${students.length} students from ${srcRoom.room_name} to ${dstRoom.room_name}. Click 'Save Changes' to update the datesheet.`
    );
  };

  // Clear selected seat
  const handleClearSelectedSeat = () => {
    if (!selectedSeat) return;
    const nextPlan = JSON.parse(JSON.stringify(plan));
    const srcRoom = nextPlan.rooms[selectedSeat.roomIdx];
    const srcCol = srcRoom.seating_sheet.columns[selectedSeat.colIdx];
    srcCol.roll_nos[selectedSeat.rowIdx] = '';
    const remaining = srcCol.roll_nos.filter((r) => r && r.trim()).length;
    if (remaining === 0) {
      srcCol.paper = '—';
      srcCol.paper_header = '— (Vacant)';
    }
    srcRoom.seated = srcRoom.seating_sheet.columns.reduce(
      (acc, c) => acc + c.roll_nos.filter((r) => r && r.trim()).length,
      0
    );
    setPlan(nextPlan);
    setHasChanges(true);
    setSelectedSeat(null);
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

    // Filter out vacated rooms in non-edit mode
    const roomsToRender = isEditMode
      ? planData.rooms
      : planData.rooms.filter((r) => (r.seated || 0) > 0);

    return roomsToRender.map((room, roomIdx) => {
      const sheet = room.seating_sheet;
      if (!sheet || !sheet.columns) return null;
      const maxRows = Math.max(room.rows || 0, ...sheet.columns.map((c) => c.roll_nos.length), 0);
      const isRoomEmpty = (room.seated || 0) === 0;

      return (
        <div
          key={`${planData.slot_id || planData.date}-${room.room_id}`}
          className="dcs-seating-sheet"
          style={isRoomEmpty && isEditMode ? { opacity: 0.65, border: '2px dashed #f87171' } : undefined}
        >
          {/* DCS Official Header */}
          <div className="dcs-seating-sheet__header">
            <h2>INTERNATIONAL ISLAMIC UNIVERSITY, ISLAMABAD</h2>
            <h3>DEPARTMENT OF COMPUTER SCIENCE &amp; INFORMATION TECHNOLOGY</h3>
            <h4>OFFICIAL EXAMINATION SEATING ARRANGEMENT SHEET</h4>
            <p>
              <strong>Date:</strong> {planData.date} &bull; <strong>Time Slot:</strong> {planData.start_time} &ndash;{' '}
              {planData.end_time} &bull; <strong>Room:</strong> {room.room_name}
            </p>
          </div>

          {/* Interactive Room Edit Bar in Edit Mode */}
          {isEditMode && !bulkPlans.length && (
            <div className="room-edit-bar no-print">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <strong style={{ color: 'var(--iiui-navy)', fontSize: '0.88rem' }}>{room.room_name}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
                  Seated: <strong style={{ color: isRoomEmpty ? '#ef4444' : '#166534' }}>{room.seated || 0}</strong> /{' '}
                  {room.capacity || room.rows * room.columns}
                </span>
                {isRoomEmpty && (
                  <span
                    style={{
                      background: '#fee2e2',
                      color: '#b91c1c',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                    }}
                  >
                    0 Seated (Will be removed on Save)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  onClick={() => handleAddRow(roomIdx)}
                  title={`Add an extra seat row to ${room.room_name}`}
                  style={{ fontSize: '0.78rem', padding: '3px 8px' }}
                >
                  <Plus size={13} />
                  Add Row
                </button>
                {(room.seated || 0) > 0 && (
                  <button
                    type="button"
                    className="btn btn--sm btn--outline"
                    onClick={() => {
                      const otherRooms = (plan?.rooms || []).map((r, i) => ({ r, i })).filter((item) => item.i !== roomIdx);
                      const defaultTarget = otherRooms.length > 0 ? otherRooms[0].i : 0;
                      setTransferModal({
                        sourceRoomIdx: roomIdx,
                        sourceRoomName: room.room_name,
                        targetRoomIdx: defaultTarget,
                      });
                    }}
                    title={`Transfer all students from ${room.room_name} to another room`}
                    style={{ fontSize: '0.78rem', padding: '3px 8px', color: '#0369a1', borderColor: '#bae6fd' }}
                  >
                    <ArrowRightLeft size={13} />
                    Transfer All to...
                  </button>
                )}
              </div>
            </div>
          )}

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
                    {sheet.columns.map((col, colIdx) => {
                      const rollVal = (col.roll_nos[ri] || '').trim();
                      const isVacant = !rollVal;
                      const isSelected =
                        selectedSeat &&
                        selectedSeat.roomIdx === roomIdx &&
                        selectedSeat.colIdx === colIdx &&
                        selectedSeat.rowIdx === ri;
                      const isTargetVacant = selectedSeat && isVacant;

                      let cellClass = '';
                      if (isEditMode) {
                        cellClass += ' seat-cell--editable';
                        if (isSelected) cellClass += ' seat-cell--selected';
                        else if (isTargetVacant) cellClass += ' seat-cell--vacant-target';
                      }

                      return (
                        <td
                          key={col.column_no}
                          className={cellClass}
                          onClick={() => isEditMode && handleCellClick(roomIdx, colIdx, ri)}
                          style={{
                            borderRight: '1px solid #cbd5e1',
                            fontWeight: rollVal ? 600 : 400,
                            fontSize: '0.74rem',
                            fontFamily: 'monospace',
                            background: isSelected ? undefined : (isVacant ? '#fafafa' : 'transparent'),
                            padding: '4px 6px',
                            minWidth: '85px',
                            maxWidth: '120px',
                            height: '26px',
                            position: 'relative',
                          }}
                          title={
                            isEditMode
                              ? rollVal
                                ? `Click to select ${rollVal} for move/swap`
                                : selectedSeat
                                ? `Click to move ${selectedSeat.roll} here`
                                : 'Empty seat'
                              : undefined
                          }
                        >
                          {rollVal || (isEditMode ? <span style={{ color: '#cbd5e1', fontSize: '0.68rem' }}>·</span> : '')}
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

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {/* Edit Seating Plan Toggle Button */}
            <button
              type="button"
              className={`btn ${isEditMode ? 'btn--primary' : 'btn--outline'}`}
              onClick={() => {
                if (isEditMode && hasChanges) {
                  if (!window.confirm('You have unsaved changes. Discard them and exit edit mode?')) return;
                  fetchPlan(selectedSlotId);
                }
                setIsEditMode(!isEditMode);
                setSelectedSeat(null);
                setHasChanges(false);
              }}
              disabled={isLoading || isPrintingAll || !plan}
              title={isEditMode ? 'Exit edit mode' : 'Customize & adjust seating arrangement'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Edit3 size={14} />
              {isEditMode ? 'Exit Edit Mode' : 'Edit Seating Plan'}
            </button>

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
              href={seatingService.getExcelExportUrl(selectedSlotId)}
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

      {/* Edit Mode Banner */}
      {isEditMode && (
        <div className="seating-edit-banner no-print">
          <div className="seating-edit-banner__info">
            <Edit3 size={20} color="#16a34a" />
            <div>
              <strong>Interactive Seating Editor Active:</strong>
              <span style={{ marginLeft: '6px', fontSize: '0.84rem' }}>
                Click any student to select, then click another cell to move/swap. Use <em>"Transfer All to..."</em> on a room to merge trailing students into another room.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {hasChanges && (
              <span
                style={{
                  background: '#fef3c7',
                  color: '#92400e',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                Unsaved Changes
              </span>
            )}
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={handleSaveCustomPlan}
              disabled={isSaving || !hasChanges}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: '#16a34a',
                borderColor: '#15803d',
              }}
            >
              <Save size={14} />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--outline"
              onClick={() => {
                if (hasChanges && !window.confirm('Discard all unsaved edits?')) return;
                fetchPlan(selectedSlotId);
                setSelectedSeat(null);
                setHasChanges(false);
              }}
              disabled={!hasChanges}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn--sm btn--outline"
              onClick={async () => {
                if (
                  !window.confirm(
                    'Reset this slot to the algorithmic default seating arrangement? Custom adjustments will be cleared.'
                  )
                )
                  return;
                await handleRegenerate();
                setHasChanges(false);
                setSelectedSeat(null);
              }}
              title="Reset to algorithmic default arrangement"
            >
              <RotateCcw size={13} />
              Reset to Default
            </button>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {saveSuccessMsg && (
        <div
          className="alert-banner alert-banner--success no-print"
          style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#166534',
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Check size={16} />
          <strong>{saveSuccessMsg}</strong>
        </div>
      )}

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

      {/* Floating Bottom Seat Action Bar (when a seat is selected in Edit Mode) */}
      {isEditMode && selectedSeat && (
        <div className="floating-seat-bar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                background: '#f59e0b',
                color: '#000',
                borderRadius: '4px',
                padding: '2px 6px',
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            >
              SELECTED
            </span>
            <strong style={{ fontSize: '0.92rem' }}>{selectedSeat.roll}</strong>
            <span style={{ opacity: 0.85, fontSize: '0.8rem' }}>
              ({selectedSeat.roomName} &bull; Col {String(selectedSeat.columnNo).padStart(2, '0')})
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
              Click any target cell to Move / Swap
            </span>
            <button
              type="button"
              className="btn btn--sm btn--outline"
              style={{ borderColor: '#ef4444', color: '#fca5a5' }}
              onClick={handleClearSelectedSeat}
              title="Remove student from this seat"
            >
              <Trash2 size={13} />
              Clear Seat
            </button>
            <button
              type="button"
              className="btn btn--sm btn--outline"
              style={{ borderColor: '#94a3b8', color: '#ffffff' }}
              onClick={() => setSelectedSeat(null)}
            >
              <X size={13} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Transfer Students Modal */}
      {transferModal && (
        <Modal
          isOpen={Boolean(transferModal)}
          title={`Transfer Students from ${transferModal.sourceRoomName}`}
          size="default"
          onClose={() => setTransferModal(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setTransferModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleExecuteTransfer}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <ArrowRightLeft size={15} />
                Transfer Students
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--itms-text-secondary)' }}>
              Transfer all seated students from <strong>{transferModal.sourceRoomName}</strong> ({plan?.rooms[transferModal.sourceRoomIdx]?.seated || 0} students) to another room in this session.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Select Destination Room:
              </label>
              <select
                className="form-control"
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem', fontWeight: 600 }}
                value={transferModal.targetRoomIdx}
                onChange={(e) =>
                  setTransferModal({
                    ...transferModal,
                    targetRoomIdx: parseInt(e.target.value, 10),
                  })
                }
              >
                {(plan?.rooms || []).map((r, idx) => {
                  if (idx === transferModal.sourceRoomIdx) return null;
                  return (
                    <option key={r.room_id || idx} value={idx}>
                      {r.room_name} (Current seated: {r.seated || 0} / {r.capacity || r.rows * r.columns})
                    </option>
                  );
                })}
              </select>
            </div>
            <div
              style={{
                background: '#f8fafc',
                padding: '0.75rem',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                fontSize: '0.8rem',
                color: '#475569',
              }}
            >
              <strong>Note:</strong> Destination room rows will be expanded automatically if more capacity is needed. {transferModal.sourceRoomName} will become empty (0 students) and will be automatically removed from datesheet room allocations once you save.
            </div>
          </div>
        </Modal>
      )}

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
