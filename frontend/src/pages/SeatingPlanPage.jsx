import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Modal from '../components/Modal.jsx';
import { seatingService } from '../services/index.js';
import { formatTime12, formatTimeRange12 } from '../utils/timeFormat.js';

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

export default function SeatingPlanPage({ slots = [], datesheet = { datesheet: [] }, courses = [], students = [], rooms = [] }) {
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [plan, setPlan] = useState(null);
  const [duties, setDuties] = useState([]);
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

  // Venue Directory States (Quick Navigation)
  const [venueFilter, setVenueFilter] = useState('all'); // 'all' | 'hall' | 'lab'
  const [venueViewMode, setVenueViewMode] = useState('grid'); // 'grid' | 'table'
  const [isVenueDirectoryOpen, setIsVenueDirectoryOpen] = useState(false);

  // Room Utilization Notification / Alerts State
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [hasSeenNotifications, setHasSeenNotifications] = useState(false);
  const [checkedAlerts, setCheckedAlerts] = useState({});
  const [dismissedAlerts, setDismissedAlerts] = useState({});
  const notificationRef = useRef(null);

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

  const activeRooms = useMemo(() => {
    if (!plan || !plan.rooms) return [];
    return plan.rooms.filter((r) => isEditMode || (r.seated || 0) > 0);
  }, [plan, isEditMode]);

  const hallsCount = useMemo(() => {
    return activeRooms.filter((r) => !(/lab/i.test(r.room_name || '') || r.room_type === 'lab')).length;
  }, [activeRooms]);

  const labsCount = useMemo(() => {
    return activeRooms.filter((r) => /lab/i.test(r.room_name || '') || r.room_type === 'lab').length;
  }, [activeRooms]);

  const filteredRooms = useMemo(() => {
    if (venueFilter === 'hall') {
      return activeRooms.filter((r) => !(/lab/i.test(r.room_name || '') || r.room_type === 'lab'));
    }
    if (venueFilter === 'lab') {
      return activeRooms.filter((r) => /lab/i.test(r.room_name || '') || r.room_type === 'lab');
    }
    return activeRooms;
  }, [activeRooms, venueFilter]);

  const totalSeatedInSlot = useMemo(() => {
    return activeRooms.reduce((sum, r) => sum + (r.seated || 0), 0);
  }, [activeRooms]);

  const totalStaffedInSlot = useMemo(() => {
    const currentSlotId = plan?.slot_id || selectedSlotId;
    const activeRoomIds = new Set(activeRooms.map((r) => r.room_id));
    const activeRoomNames = new Set(activeRooms.map((r) => (r.room_name || '').toLowerCase().trim()));
    const matchedDuties = duties.filter(
      (d) =>
        d.slot_id === currentSlotId &&
        (activeRoomIds.has(d.room_id) ||
          (d.room_name && activeRoomNames.has(d.room_name.toLowerCase().trim())))
    );
    return matchedDuties.length;
  }, [activeRooms, duties, plan, selectedSlotId]);

  // Low-fill detection: rooms where seated ≤ 20% of total usable seats
  const lowFillRooms = useMemo(() => {
    return activeRooms.filter((r) => {
      const totalUsable =
        Number(r.total_usable_seats) ||
        (Number(r.capacity || r.rows * r.columns || 0) + Number(r.reserve_capacity || 0));
      const pct = totalUsable > 0 ? (Number(r.seated || 0) / totalUsable) : 1;
      return totalUsable > 0 && pct <= 0.2 && Number(r.seated || 0) > 0;
    });
  }, [activeRooms]);

  // Room Utilization Alerts (< 50% capacity utilized)
  const roomAlerts = useMemo(() => {
    if (!activeRooms || activeRooms.length === 0) return [];
    return activeRooms
      .map((r) => {
        const seated = Number(r.seated || 0);
        const cap = Number(r.usable_capacity || r.capacity || (r.rows && r.columns ? r.rows * r.columns : 0) || 0);
        const pct = cap > 0 ? seated / cap : 1;
        return {
          roomId: r.room_id,
          roomName: r.room_name,
          seated,
          capacity: cap,
          utilization: pct,
          isLab: /lab/i.test(r.room_name || '') || r.room_type === 'lab',
        };
      })
      .filter((item) => item.seated > 0 && item.capacity > 0 && item.utilization < 0.5);
  }, [activeRooms]);

  const visibleAlerts = useMemo(() => {
    return roomAlerts.filter((a) => !dismissedAlerts[a.roomId]);
  }, [roomAlerts, dismissedAlerts]);

  const unreadAlertsCount = visibleAlerts.length;

  // Reset alert seen/dismissed states when slot changes
  useEffect(() => {
    setHasSeenNotifications(false);
    setCheckedAlerts({});
    setDismissedAlerts({});
    setIsNotificationOpen(false);
  }, [selectedSlotId]);

  // Click outside to close notification popup
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsNotificationOpen(false);
      }
    };
    if (isNotificationOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotificationOpen]);

  const handleCheckRoom = (roomId) => {
    setCheckedAlerts((prev) => ({ ...prev, [roomId]: true }));
    const element = document.getElementById(`room-sheet-${roomId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
      element.style.boxShadow = '0 0 0 4px #2563eb';
      element.style.borderColor = '#2563eb';
      setTimeout(() => {
        element.style.boxShadow = '';
        element.style.borderColor = '';
      }, 2500);
    }
  };

  const handleDismissAlert = (roomId) => {
    setDismissedAlerts((prev) => ({ ...prev, [roomId]: true }));
  };

  // Per-room state for reserve consolidation actions
  const [reserveApplied, setReserveApplied] = useState({});
  const [dismissedLowFill, setDismissedLowFill] = useState(false);

  const roomMasterMap = useMemo(() => {
    const map = {};
    (rooms || []).forEach((r) => {
      if (r?.id) map[r.id] = r;
      if (r?.name) map[r.name] = r;
    });
    return map;
  }, [rooms]);

  const handleConsolidateLowFillRoom = async (sourceRoomId) => {
    if (!plan?.rooms?.length) return;
    const nextPlan = JSON.parse(JSON.stringify(plan));
    const source = nextPlan.rooms.find((r) => r.room_id === sourceRoomId);
    if (!source) return;

    const sourceStudents = [];
    (source.seating_sheet?.columns || []).forEach((col) => {
      (col.roll_nos || []).forEach((roll, ri) => {
        const v = String(roll || '').trim();
        if (v) {
          sourceStudents.push({
            roll: v,
            paper: col.paper,
            course_code: col.course_code,
            instructor: col.instructor,
            paper_header: col.paper_header,
          });
          col.roll_nos[ri] = '';
        }
      });
      col.paper = '—';
      col.paper_header = '— (Vacant)';
      col.instructor = '';
      col.course_code = '';
    });

    if (sourceStudents.length === 0) {
      setReserveApplied((prev) => ({ ...prev, [sourceRoomId]: true }));
      return;
    }

    const sourceIsLab = /lab/i.test(source.room_name || '') || source.room_type === 'lab';
    const targets = nextPlan.rooms.filter((r) => {
      if (r.room_id === sourceRoomId) return false;
      const targetIsLab = /lab/i.test(r.room_name || '') || r.room_type === 'lab';
      return sourceIsLab ? targetIsLab : !targetIsLab;
    });
    if (!targets.length) {
      setErrorMsg(
        sourceIsLab
          ? 'No other labs are available to absorb this lab. Students in labs must be adjusted within other labs only.'
          : 'No other examination halls/rooms are available to absorb this room into reserve seats.'
      );
      return;
    }

    const ensureRoomMeta = (room) => {
      const master = roomMasterMap[room.room_id] || roomMasterMap[room.room_name] || {};
      const reserve = Number(room.reserve_capacity ?? master.reserve_capacity ?? 0);
      const baseCap = Number(room.capacity || room.rows * room.columns || 0);
      room.reserve_capacity = reserve;
      room.total_usable_seats = baseCap + reserve;
      room.capacity = baseCap;
      room.usable_capacity = Number(room.usable_capacity || baseCap);
      if (!room.seating_sheet || !Array.isArray(room.seating_sheet.columns)) {
        room.seating_sheet = { columns: [] };
      }
    };
    targets.forEach(ensureRoomMeta);
    ensureRoomMeta(source);

    let studentIdx = 0;

    const tryPlaceInRoom = (room) => {
      const cols = room.seating_sheet.columns || [];
      if (!cols.length) return;
      const maxRowsNow = Math.max(room.rows || 0, ...cols.map((c) => (c.roll_nos || []).length), 0);
      const totalUsable = Number(room.total_usable_seats || (room.capacity + (room.reserve_capacity || 0)));
      let seatedNow = cols.reduce((acc, c) => acc + (c.roll_nos || []).filter((x) => String(x || '').trim()).length, 0);

      // Fill existing empty cells first
      for (let r = 0; r < maxRowsNow && studentIdx < sourceStudents.length; r++) {
        for (let c = 0; c < cols.length && studentIdx < sourceStudents.length; c++) {
          const col = cols[c];
          while ((col.roll_nos || []).length <= r) col.roll_nos.push('');
          if (!String(col.roll_nos[r] || '').trim()) {
            const st = sourceStudents[studentIdx++];
            col.roll_nos[r] = st.roll;
            if (!col.paper || col.paper === '—' || String(col.paper).includes('Vacant')) {
              col.paper = st.paper;
              col.course_code = st.course_code;
              col.instructor = st.instructor;
              col.paper_header = st.paper_header;
            }
            seatedNow += 1;
          }
        }
      }

      // Expand rows into reserve capacity if needed
      while (studentIdx < sourceStudents.length && seatedNow < totalUsable) {
        const newRowIdx = Math.max(room.rows || 0, ...cols.map((c) => (c.roll_nos || []).length), 0);
        room.rows = newRowIdx + 1;
        room.capacity = Number(room.capacity || 0) + cols.length;
        room.usable_capacity = Number(room.usable_capacity || 0) + cols.length;
        for (let c = 0; c < cols.length && studentIdx < sourceStudents.length && seatedNow < totalUsable; c++) {
          const col = cols[c];
          while ((col.roll_nos || []).length <= newRowIdx) col.roll_nos.push('');
          const st = sourceStudents[studentIdx++];
          col.roll_nos[newRowIdx] = st.roll;
          if (!col.paper || col.paper === '—' || String(col.paper).includes('Vacant')) {
            col.paper = st.paper;
            col.course_code = st.course_code;
            col.instructor = st.instructor;
            col.paper_header = st.paper_header;
          }
          seatedNow += 1;
        }
      }

      room.seated = cols.reduce((acc, c) => acc + (c.roll_nos || []).filter((x) => String(x || '').trim()).length, 0);
      room.utilisation_pct =
        room.usable_capacity > 0 ? Math.round((room.seated / room.usable_capacity) * 1000) / 10 : 0;
    };

    for (const target of targets) {
      if (studentIdx >= sourceStudents.length) break;
      tryPlaceInRoom(target);
    }

    source.seated = 0;
    source.utilisation_pct = 0;

    if (studentIdx < sourceStudents.length) {
      setErrorMsg(
        `Could not consolidate all students from ${source.room_name}. ${sourceStudents.length - studentIdx} student(s) remain; use Edit Seating Plan to place them manually.`
      );
      // Put remaining students back into source first column(s) so none are lost
      let backIdx = studentIdx;
      const cols = source.seating_sheet?.columns || [];
      if (cols.length) {
        let r = 0;
        while (backIdx < sourceStudents.length) {
          for (let c = 0; c < cols.length && backIdx < sourceStudents.length; c++) {
            const col = cols[c];
            while ((col.roll_nos || []).length <= r) col.roll_nos.push('');
            const st = sourceStudents[backIdx++];
            col.roll_nos[r] = st.roll;
            col.paper = st.paper;
            col.course_code = st.course_code;
            col.instructor = st.instructor;
            col.paper_header = st.paper_header;
          }
          r += 1;
        }
        source.seated = sourceStudents.length - studentIdx;
      }
      setPlan(nextPlan);
      setHasChanges(true);
      return;
    }

    setPlan(nextPlan);
    setHasChanges(true);
    setReserveApplied((prev) => ({ ...prev, [sourceRoomId]: true }));
    setSaveSuccessMsg(
      `Consolidated ${sourceStudents.length} student(s) from ${source.room_name} into reserve/available seats of other halls. Save changes to sync datesheet and invigilation roster.`
    );
  };

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

  const fetchDuties = useCallback(async () => {
    try {
      const res = await fetch('/api/invigilation/duties');
      if (res.ok) {
        const data = await res.json();
        setDuties(Array.isArray(data) ? data : []);
      }
    } catch {
      // duty roster may be empty initially
    }
  }, []);

  useEffect(() => {
    if (selectedSlotId) {
      fetchPlan(selectedSlotId);
      fetchDuties();
    }
  }, [selectedSlotId, fetchDuties]);

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

      const hasBufferRow = Boolean(
        (Number(room.reserve_capacity || 0) > 0 || room.has_buffer_row) &&
        Number(room.capacity || 0) >= 50
      );
      const bufferSeatsCount = hasBufferRow ? Number(room.reserve_capacity || room.columns || 0) : 0;

      const currentSlotId = planData.slot_id || selectedSlotId;
      const dutyMatches = duties.filter(
        (d) =>
          d.slot_id === currentSlotId &&
          (d.room_id === room.room_id ||
            (d.room_name &&
              room.room_name &&
              d.room_name.trim().toLowerCase() === room.room_name.trim().toLowerCase()))
      );
      const roomInvigilators =
        dutyMatches.length > 0
          ? dutyMatches
          : (room.invigilation || []).length > 0
            ? room.invigilation
            : (room.invigilators || []).map((name) => ({ instructor: name, duty_type: 'hall' }));

      return (
        <div
          key={`${planData.slot_id || planData.date}-${room.room_id}`}
          id={`room-sheet-${room.room_id}`}
          className="dcs-seating-sheet"
          style={isRoomEmpty && isEditMode ? { opacity: 0.65, border: '2px dashed #f87171' } : undefined}
        >
          {/* DCS Official Header */}
          <div className="dcs-seating-sheet__header">
            <h2>INTERNATIONAL ISLAMIC UNIVERSITY, ISLAMABAD</h2>
            <h3>DEPARTMENT OF COMPUTER SCIENCE &amp; INFORMATION TECHNOLOGY</h3>
            <h4>OFFICIAL EXAMINATION SEATING ARRANGEMENT SHEET</h4>
            <p>
              <strong>Date:</strong> {planData.date} &bull; <strong>Time Slot:</strong>{' '}
              {formatTimeRange12(planData.start_time, planData.end_time)} &bull; <strong>Room:</strong> {room.room_name}
              {' '}&bull; <strong>Capacity:</strong>{' '}
              {Number(room.capacity || (room.rows || 0) * (room.columns || 0))}
            </p>

            {/* Official Invigilator Assignment Strip */}
            <div className="dcs-seating-sheet__invigilation-bar">
              <span className="dcs-seating-sheet__invig-title">
                <strong>Invigilator(s):</strong>
              </span>
              {roomInvigilators.length > 0 ? (
                <div className="dcs-seating-sheet__invig-list">
                  {roomInvigilators.map((inv, idx) => (
                    <span key={inv.id || idx} className="dcs-invig-pill">
                      <strong>{inv.instructor}</strong>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="dcs-seating-sheet__invig-empty">
                  Not assigned yet
                </span>
              )}
            </div>
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
                  + Add Row
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
                      const isBufferCell = (hasBufferRow && ri === maxRows - 1) || rollVal.toLowerCase() === 'buffer';
                      const isVacant = !rollVal && !isBufferCell;
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
                      if (isBufferCell) {
                        cellClass += ' seat-cell--buffer';
                      }

                      return (
                        <td
                          key={col.column_no}
                          className={cellClass.trim()}
                          onClick={() => isEditMode && !isBufferCell && handleCellClick(roomIdx, colIdx, ri)}
                          style={{
                            borderRight: '1px solid #cbd5e1',
                            fontWeight: rollVal ? 700 : 400,
                            fontSize: '0.74rem',
                            fontFamily: rollVal || isBufferCell ? 'monospace' : 'inherit',
                            background: isSelected
                              ? undefined
                              : isBufferCell
                                ? '#fffbeb'
                                : (isVacant ? '#fafafa' : 'transparent'),
                            color: isBufferCell ? '#92400e' : undefined,
                            boxShadow: isBufferCell ? 'inset 0 0 0 1px #fde68a' : undefined,
                            padding: '4px 6px',
                            minWidth: '85px',
                            maxWidth: '120px',
                            height: '26px',
                            position: 'relative',
                            textAlign: isBufferCell ? 'center' : 'inherit',
                          }}
                          title={
                            isBufferCell
                              ? 'Buffer seat (reserved in last row for repeaters and exam contingency)'
                              : isEditMode
                                ? rollVal
                                  ? `Click to select ${rollVal} for move/swap`
                                  : selectedSeat
                                    ? `Click to move ${selectedSeat.roll} here`
                                    : 'Empty seat'
                                : undefined
                          }
                        >
                          {isBufferCell ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '1px 8px',
                                borderRadius: '4px',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                backgroundColor: '#fef3c7',
                                color: '#92400e',
                                border: '1px solid #fde68a',
                                letterSpacing: '0.02em',
                              }}
                            >
                              Buffer
                            </span>
                          ) : (
                            rollVal || (isEditMode ? <span style={{ color: '#cbd5e1', fontSize: '0.68rem' }}>·</span> : '')
                          )}
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
                    {formatTimeRange12(s.start_time, s.end_time)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {/* Room Utilization Notification Button */}
            <div style={{ position: 'relative' }} ref={notificationRef}>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => {
                  setIsNotificationOpen((prev) => !prev);
                  if (!isNotificationOpen) {
                    setHasSeenNotifications(true);
                  }
                }}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderColor: !hasSeenNotifications && unreadAlertsCount > 0 ? '#ef4444' : undefined,
                  backgroundColor: !hasSeenNotifications && unreadAlertsCount > 0 ? '#fef2f2' : undefined,
                  color: !hasSeenNotifications && unreadAlertsCount > 0 ? '#b91c1c' : undefined,
                }}
                title="Room Utilization Alerts (< 50% capacity)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span>Alerts</span>
                {!hasSeenNotifications && unreadAlertsCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      borderRadius: '9999px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      minWidth: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  >
                    {unreadAlertsCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {isNotificationOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 8px)',
                    width: '380px',
                    maxHeight: '440px',
                    overflowY: 'auto',
                    backgroundColor: '#ffffff',
                    borderRadius: '10px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
                    border: '1px solid #e2e8f0',
                    zIndex: 1200,
                    padding: '14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                        Room Utilization Alerts
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Rooms with &lt; 50% seat utilization in this slot
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsNotificationOpen(false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#94a3b8',
                        fontSize: '1.1rem',
                        lineHeight: 1,
                        padding: '4px',
                      }}
                      title="Close"
                    >
                      &times;
                    </button>
                  </div>

                  {visibleAlerts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 8px', color: '#059669' }}>
                      <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>&#10003;</div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>All Rooms Well Utilized</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        All active rooms are 50% or more utilized in this session.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {visibleAlerts.map((alert) => {
                        const isChecked = !!checkedAlerts[alert.roomId];
                        const pctInt = Math.round(alert.utilization * 100);

                        return (
                          <div
                            key={alert.roomId}
                            style={{
                              border: isChecked ? '1px solid #86efac' : '1px solid #fed7aa',
                              backgroundColor: isChecked ? '#f0fdf4' : '#fffbeb',
                              borderRadius: '8px',
                              padding: '10px 12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>
                                  {alert.roomName}
                                </strong>
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: alert.isLab ? '#e0f2fe' : '#f1f5f9',
                                    color: alert.isLab ? '#0369a1' : '#475569',
                                    fontWeight: 600,
                                  }}
                                >
                                  {alert.isLab ? 'Lab' : 'Hall'}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  color: pctInt < 30 ? '#dc2626' : '#d97706',
                                }}
                              >
                                {pctInt}% utilized
                              </span>
                            </div>

                            <div style={{ fontSize: '0.78rem', color: '#4b5563' }}>
                              <strong>{alert.seated}</strong> of <strong>{alert.capacity}</strong> seats occupied
                            </div>

                            {/* Mini progress bar */}
                            <div
                              style={{
                                width: '100%',
                                height: '6px',
                                backgroundColor: '#e5e7eb',
                                borderRadius: '3px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(pctInt, 100)}%`,
                                  height: '100%',
                                  backgroundColor: pctInt < 30 ? '#ef4444' : '#f59e0b',
                                  borderRadius: '3px',
                                }}
                              />
                            </div>

                            {/* Actions: Check & Dismiss (✕) */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginTop: '4px',
                                paddingTop: '4px',
                                borderTop: isChecked ? '1px solid #dcfce7' : '1px solid #fef3c7',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleCheckRoom(alert.roomId)}
                                style={{
                                  background: isChecked ? '#16a34a' : '#2563eb',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '4px 10px',
                                  fontSize: '0.74rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Locate and highlight this room's seating sheet"
                              >
                                {isChecked ? '✓ Checked' : 'Check Room'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDismissAlert(alert.roomId)}
                                style={{
                                  background: 'transparent',
                                  color: '#9ca3af',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  padding: '3px 8px',
                                  fontSize: '0.74rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                title="Dismiss this alert"
                              >
                                ✕ Dismiss
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

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
            >
              {isEditMode ? 'Exit Edit Mode' : 'Edit Seating Plan'}
            </button>

            <button
              type="button"
              className="btn btn--outline"
              onClick={handleRegenerate}
              disabled={isLoading || !selectedSlotId || isPrintingAll}
              title="Recalculate allocations for this slot"
            >
              {isLoading ? 'Recalculating...' : 'Recalculate'}
            </button>

            <a
              href={seatingService.getExcelExportUrl(selectedSlotId)}
              className={`btn btn--outline ${!plan ? 'disabled' : ''}`}
              download
              style={{
                pointerEvents: !plan ? 'none' : 'auto',
                opacity: !plan ? 0.6 : 1,
              }}
              title="Download Excel spreadsheet for this slot"
            >
              Export Excel
            </a>

            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setIsPrintModalOpen(true)}
              disabled={isPrintingAll || !plan}
              title="Open print options popup"
            >
              {isPrintingAll ? 'Preparing Print...' : 'Print Seating Plans...'}
            </button>
          </div>
        </div>
      </div>

      {/* Edit Mode Banner */}
      {isEditMode && (
        <div className="seating-edit-banner no-print">
          <div className="seating-edit-banner__info">
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
                background: '#16a34a',
                borderColor: '#15803d',
              }}
            >
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
          <span>✓</span>
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

      {/* Slot Venues & Staffing Directory (Executive Overview & Quick Navigation) */}
      {plan && plan.rooms && plan.rooms.length > 0 && !bulkPlans.length && (
        <>


          <div className={`slot-venues-directory no-print ${!isVenueDirectoryOpen ? 'slot-venues-directory--collapsed' : ''}`}>
            <div className="slot-venues-directory__header">
              <div className="slot-venues-directory__title-group">
                <h3 className="slot-venues-directory__title">
                  Slot Venues &amp; Invigilation Directory
                </h3>
                <span className="slot-venues-directory__count-badge">
                  {activeRooms.length} {activeRooms.length === 1 ? 'Venue' : 'Venues'}
                </span>
              </div>

              <div className="slot-venues-directory__controls">
                {isVenueDirectoryOpen && (
                  <>
                    {/* Category Filter Pills */}
                    <div className="venue-filter-pills">
                      <button
                        type="button"
                        className={`venue-filter-pill-btn ${venueFilter === 'all' ? 'venue-filter-pill-btn--active' : ''}`}
                        onClick={() => setVenueFilter('all')}
                      >
                        All ({activeRooms.length})
                      </button>
                      <button
                        type="button"
                        className={`venue-filter-pill-btn ${venueFilter === 'hall' ? 'venue-filter-pill-btn--active' : ''}`}
                        onClick={() => setVenueFilter('hall')}
                      >
                        Halls ({hallsCount})
                      </button>
                      <button
                        type="button"
                        className={`venue-filter-pill-btn ${venueFilter === 'lab' ? 'venue-filter-pill-btn--active' : ''}`}
                        onClick={() => setVenueFilter('lab')}
                      >
                        Labs ({labsCount})
                      </button>
                    </div>

                    {/* View Switch: Grid vs Table */}
                    <div className="venue-view-toggle">
                      <button
                        type="button"
                        className={`venue-view-toggle-btn ${venueViewMode === 'grid' ? 'venue-view-toggle-btn--active' : ''}`}
                        onClick={() => setVenueViewMode('grid')}
                        title="Card Grid View"
                        style={{ fontSize: '0.74rem', padding: '2px 7px' }}
                      >
                        Grid
                      </button>
                      <button
                        type="button"
                        className={`venue-view-toggle-btn ${venueViewMode === 'table' ? 'venue-view-toggle-btn--active' : ''}`}
                        onClick={() => setVenueViewMode('table')}
                        title="Table View"
                        style={{ fontSize: '0.74rem', padding: '2px 7px' }}
                      >
                        List
                      </button>
                    </div>
                  </>
                )}

                {/* Collapse/Expand Toggle Button */}
                <button
                  type="button"
                  className={`slot-venues-directory__toggle-btn ${isVenueDirectoryOpen ? 'slot-venues-directory__toggle-btn--open' : ''}`}
                  onClick={() => setIsVenueDirectoryOpen(!isVenueDirectoryOpen)}
                  title={isVenueDirectoryOpen ? 'Hide Directory' : 'Show Directory'}
                >
                  <span>{isVenueDirectoryOpen ? 'Hide Directory' : 'Show Directory'}</span>
                  <span style={{ fontSize: '0.65rem' }}>{isVenueDirectoryOpen ? '▲' : '▼'}</span>
                </button>
              </div>
            </div>

          {isVenueDirectoryOpen && (
            <div className="slot-venues-directory__body">
              {venueViewMode === 'grid' ? (
                <div className="slot-venues-grid">
                  {filteredRooms.map((r) => {
                    const currentSlotId = plan.slot_id || selectedSlotId;
                    const rDuties = duties.filter(
                      (d) =>
                        d.slot_id === currentSlotId &&
                        (d.room_id === r.room_id ||
                          (d.room_name &&
                            r.room_name &&
                            d.room_name.trim().toLowerCase() === r.room_name.trim().toLowerCase()))
                    );
                    const isLab = /lab/i.test(r.room_name || '') || r.room_type === 'lab';

                    return (
                      <a
                        key={r.room_id}
                        href={`#room-sheet-${r.room_id}`}
                        className="slot-venue-card"
                        title={`Click to jump to ${r.room_name} seating sheet`}
                      >
                        <div className="slot-venue-card__top">
                          <div className="slot-venue-card__title-row">
                            <span className="slot-venue-card__name">{r.room_name}</span>
                            <span
                              className={`slot-venue-card__type ${
                                isLab ? 'slot-venue-card__type--lab' : 'slot-venue-card__type--hall'
                              }`}
                            >
                              {isLab ? 'Computer Lab' : 'Hall'}
                            </span>
                          </div>
                          <span className="slot-venue-card__seated">
                            <strong>{r.seated || 0}</strong> seated
                          </span>
                        </div>

                        <div className="slot-venue-card__staff-box">
                          <div className="slot-venue-card__staff-heading">
                            <span>Invigilator(s)</span>
                          </div>
                          <div className="slot-venue-card__staff-list">
                            {rDuties.length > 0 ? (
                              rDuties.map((d, dIdx) => (
                                <div key={d.id || dIdx} className="slot-venue-card__staff-row">
                                  <span className="slot-venue-card__staff-name" title={d.instructor}>
                                    {d.instructor}
                                  </span>
                                  <span
                                    className={`slot-venue-card__staff-role ${
                                      d.duty_type === 'own_subject'
                                        ? 'slot-venue-card__staff-role--own'
                                        : 'slot-venue-card__staff-role--hall'
                                    }`}
                                  >
                                    {d.duty_type === 'own_subject' ? 'Course Teacher' : 'Invigilator'}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="slot-venue-card__staff-empty">
                                <span>No invigilator assigned</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="slot-venue-card__footer">
                          <span>Jump to sheet &darr;</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="slot-venues-table-wrapper">
                  <table className="slot-venues-table">
                    <thead>
                      <tr>
                        <th>Venue Name</th>
                        <th>Category</th>
                        <th>Seated Count</th>
                        <th>Assigned Invigilators &amp; Role</th>
                        <th style={{ textAlign: 'right' }}>Quick Jump</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRooms.map((r) => {
                        const currentSlotId = plan.slot_id || selectedSlotId;
                        const rDuties = duties.filter(
                          (d) =>
                            d.slot_id === currentSlotId &&
                            (d.room_id === r.room_id ||
                              (d.room_name &&
                                r.room_name &&
                                d.room_name.trim().toLowerCase() === r.room_name.trim().toLowerCase()))
                        );
                        const isLab = /lab/i.test(r.room_name || '') || r.room_type === 'lab';

                        return (
                          <tr key={r.room_id}>
                            <td>
                              <strong style={{ color: 'var(--iiui-navy)', fontSize: '0.88rem' }}>
                                {r.room_name}
                              </strong>
                            </td>
                            <td>
                              <span
                                className={`slot-venue-card__type ${
                                  isLab ? 'slot-venue-card__type--lab' : 'slot-venue-card__type--hall'
                                }`}
                              >
                                {isLab ? 'Computer Lab' : 'Exam Hall'}
                              </span>
                            </td>
                            <td>
                              <span className="slot-venue-card__seated">
                                <strong>{r.seated || 0}</strong> seated
                              </span>
                            </td>
                            <td>
                              {rDuties.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                  {rDuties.map((d, dIdx) => (
                                    <span
                                      key={d.id || dIdx}
                                      className="dcs-invig-pill"
                                      style={{ fontSize: '0.74rem', padding: '2px 7px' }}
                                    >
                                      <strong>{d.instructor}</strong>
                                      <span
                                        className={`dcs-invig-type ${
                                          d.duty_type === 'own_subject' ? 'dcs-invig-type--own' : 'dcs-invig-type--hall'
                                        }`}
                                      >
                                        {d.duty_type === 'own_subject' ? 'Course Teacher' : 'Invigilator'}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: '#b45309', fontSize: '0.76rem', fontStyle: 'italic' }}>
                                  No invigilator assigned
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <a
                                href={`#room-sheet-${r.room_id}`}
                                className="btn btn--sm btn--outline"
                                style={{ fontSize: '0.74rem', padding: '3px 8px' }}
                              >
                                Jump to Sheet &darr;
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        </>
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
              Clear Seat
            </button>
            <button
              type="button"
              className="btn btn--sm btn--outline"
              style={{ borderColor: '#94a3b8', color: '#ffffff' }}
              onClick={() => setSelectedSeat(null)}
            >
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
              >
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
            >
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
                Prints active halls for <strong>{selectedDate}</strong> ({formatTimeRange12(currentSlot?.start_time, currentSlot?.end_time)}).
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
