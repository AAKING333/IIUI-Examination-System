import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  UserCheck,
  Users,
  Building2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
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
  const [isVenueDirectoryOpen, setIsVenueDirectoryOpen] = useState(true);

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

  // Per-room state for reserve consolidation actions
  const [reserveApplied, setReserveApplied] = useState({});
  const [dismissedLowFill, setDismissedLowFill] = useState(false);

  const overflowRollSet = useMemo(() => {
    const set = new Set();
    (students || []).forEach((s) => {
      const roll = String(s.roll_no || '').trim();
      const hasOverflow = (s.enrolments || s.courses_enrolled || []).some((e) => {
        const t = String(e?.type || '').toLowerCase();
        return t === 'back' || t.includes('back') || t.includes('overflow') || t.includes('repeat');
      });
      if (roll && hasOverflow) set.add(roll);
    });
    return set;
  }, [students]);

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

      const reserveCount = Math.max(0, Number(room.reserve_capacity || 0));
      const emptyCells = [];
      sheet.columns.forEach((col, colIdx) => {
        for (let ri = 0; ri < maxRows; ri++) {
          const rollVal = String((col.roll_nos || [])[ri] || '').trim();
          if (!rollVal) emptyCells.push(`${colIdx}:${ri}`);
        }
      });
      const reservedSet = new Set(
        reserveCount > 0 ? emptyCells.slice(Math.max(0, emptyCells.length - reserveCount)) : []
      );

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
              <strong>Date:</strong> {planData.date} &bull; <strong>Time Slot:</strong> {planData.start_time} &ndash;{' '}
              {planData.end_time} &bull; <strong>Room:</strong> {room.room_name}
              {' '}&bull; <strong>Capacity:</strong>{' '}
              {Number(room.capacity || (room.rows || 0) * (room.columns || 0))} Usable
              {Number(room.reserve_capacity || 0) > 0
                ? ` + ${Number(room.reserve_capacity || 0)} Reserved`
                : ''}
            </p>

            {/* Official Invigilator Assignment Strip */}
            <div className="dcs-seating-sheet__invigilation-bar">
              <span className="dcs-seating-sheet__invig-title">
                <UserCheck size={14} style={{ verticalAlign: 'text-bottom', marginRight: 5 }} />
                <strong>Invigilator(s):</strong>
              </span>
              {roomInvigilators.length > 0 ? (
                <div className="dcs-seating-sheet__invig-list">
                  {roomInvigilators.map((inv, idx) => (
                    <span key={inv.id || idx} className="dcs-invig-pill">
                      <strong>{inv.instructor}</strong>
                      <span className={`dcs-invig-type ${inv.duty_type === 'own_subject' ? 'dcs-invig-type--own' : 'dcs-invig-type--hall'}`}>
                        {inv.duty_type === 'own_subject' ? 'Course Teacher' : 'Invigilator'}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="dcs-seating-sheet__invig-empty">
                  Not assigned yet (Generate roster in Operations)
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

                      const isOverflow = rollVal && overflowRollSet.has(rollVal);
                      const isReservedSeat = !rollVal && reservedSet.has(`${colIdx}:${ri}`);
                      let cellClass = '';
                      if (isEditMode) {
                        cellClass += ' seat-cell--editable';
                        if (isSelected) cellClass += ' seat-cell--selected';
                        else if (isTargetVacant) cellClass += ' seat-cell--vacant-target';
                      }
                      if (isOverflow) {
                        cellClass += ' student-overflow-cell';
                      }
                      if (isReservedSeat) {
                        cellClass += ' seat-cell--reserved';
                      }

                      return (
                        <td
                          key={col.column_no}
                          className={cellClass.trim()}
                          onClick={() => isEditMode && handleCellClick(roomIdx, colIdx, ri)}
                          style={{
                            borderRight: '1px solid #cbd5e1',
                            fontWeight: rollVal ? 700 : 400,
                            fontSize: '0.74rem',
                            fontFamily: rollVal || isReservedSeat ? 'monospace' : 'inherit',
                            background: isSelected
                              ? undefined
                              : isOverflow
                                ? '#fff1f2'
                                : isReservedSeat
                                  ? '#f8fafc'
                                  : (isVacant ? '#fafafa' : 'transparent'),
                            color: isOverflow ? '#b91c1c' : isReservedSeat ? '#64748b' : undefined,
                            boxShadow: isOverflow ? 'inset 0 0 0 2px #ef4444' : isReservedSeat ? 'inset 0 0 0 1px dashed #94a3b8' : undefined,
                            padding: '4px 6px',
                            minWidth: '85px',
                            maxWidth: '120px',
                            height: '26px',
                            position: 'relative',
                          }}
                          title={
                            isEditMode
                              ? rollVal
                                ? `${isOverflow ? 'Repeat/Backlog candidate: ' : ''}Click to select ${rollVal} for move/swap`
                                : selectedSeat
                                  ? `Click to move ${selectedSeat.roll} here${isReservedSeat ? ' (reserved seat)' : ''}`
                                  : isReservedSeat
                                    ? 'Reserved seat (available for administration if needed)'
                                    : 'Empty seat'
                              : isOverflow && rollVal
                                ? `Repeat/Backlog candidate: ${rollVal}`
                                : isReservedSeat
                                  ? 'Reserved seat (available for administration if needed)'
                                  : undefined
                          }
                        >
                          {rollVal || (isReservedSeat ? <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.02em' }}>Reserved</span> : (isEditMode ? <span style={{ color: '#cbd5e1', fontSize: '0.68rem' }}>·</span> : ''))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {reserveCount > 0 && (() => {
                  const colCount = sheet.columns.length || 1;
                  const reserveRowsCount = Math.ceil(reserveCount / colCount);
                  return Array.from({ length: reserveRowsCount }, (_, rr) => (
                    <tr key={`reserve-row-${rr}`} className="dcs-reserve-grid-row">
                      {sheet.columns.map((col, colIdx) => {
                        const reserveIndex = rr * colCount + colIdx;
                        const isReserveCell = reserveIndex < reserveCount;
                        return (
                          <td
                            key={`reserve-${col.column_no}-${rr}`}
                            style={{
                              borderRight: '1px solid #cbd5e1',
                              fontSize: '0.72rem',
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              background: isReserveCell ? '#f8fafc' : '#fafafa',
                              color: isReserveCell ? '#475569' : '#cbd5e1',
                              boxShadow: isReserveCell ? 'inset 0 0 0 1px dashed #94a3b8' : undefined,
                              padding: '4px 6px',
                              minWidth: '85px',
                              maxWidth: '120px',
                              height: '26px',
                              textAlign: 'center',
                            }}
                            title={isReserveCell ? `Reserved seat ${reserveIndex + 1} (available for administration if needed)` : ''}
                          >
                            {isReserveCell ? `Reserved ${String(reserveIndex + 1).padStart(2, '0')}` : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          {Number(room.reserve_capacity || 0) > 0 && (
            <div className="dcs-reserve-panel" style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>
              <strong style={{ color: 'var(--iiui-navy)' }}>Reserve seats shown in grid:</strong>{' '}
              {Number(room.reserve_capacity || 0)} seat{Number(room.reserve_capacity || 0) === 1 ? '' : 's'} labeled &quot;Reserved&quot; and kept available for administration if needed.
            </div>
          )}
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

      {/* Slot Venues & Staffing Directory (Executive Overview & Quick Navigation) */}
      {plan && plan.rooms && plan.rooms.length > 0 && !bulkPlans.length && (
        <>
          {/* Low-fill Admin Notice */}
          {lowFillRooms.length > 0 && !dismissedLowFill && (
            <div className="low-fill-notice no-print">
              <div className="low-fill-notice__header">
                <div className="low-fill-notice__icon">⚠️</div>
                <div>
                  <strong>Low Seat Utilisation Detected</strong>
                  <p>
                    The following venue(s) have 20% or fewer seats filled. Hall/room students can be consolidated into reserve/available seats of other halls only (optional), and lab students can be adjusted within other labs only.
                  </p>
                </div>
                <button className="low-fill-notice__dismiss" onClick={() => setDismissedLowFill(true)} title="Dismiss">✕</button>
              </div>
              <div className="low-fill-notice__rooms">
                {lowFillRooms.map((r) => {
                  const totalUsable =
                    Number(r.total_usable_seats) ||
                    (Number(r.capacity || r.rows * r.columns || 0) + Number(r.reserve_capacity || 0));
                  const pct = totalUsable > 0 ? Math.round((Number(r.seated || 0) / totalUsable) * 100) : 0;
                  const applied = reserveApplied[r.room_id];
                  const isLabRoom = /lab/i.test(r.room_name || '') || r.room_type === 'lab';
                  const otherAvailable = activeRooms
                    .filter((room) => {
                      if (room.room_id === r.room_id) return false;
                      const targetIsLab = /lab/i.test(room.room_name || '') || room.room_type === 'lab';
                      return isLabRoom ? targetIsLab : !targetIsLab;
                    })
                    .reduce((sum, room) => {
                      const tu = Number(room.total_usable_seats) || (Number(room.capacity || 0) + Number(room.reserve_capacity || 0));
                      return sum + Math.max(0, tu - Number(room.seated || 0));
                    }, 0);
                  return (
                    <div key={r.room_id} className="low-fill-notice__room-row">
                      <div className="low-fill-notice__room-info">
                        <strong>{r.room_name}</strong>
                        <span className="low-fill-notice__pct">{r.seated || 0} / {totalUsable} seats ({pct}% filled)</span>
                        <span className="low-fill-notice__reserve-tag">
                          +{otherAvailable} available seat{otherAvailable === 1 ? '' : 's'} in other {isLabRoom ? 'labs' : 'halls/rooms'}
                        </span>
                      </div>
                      <button
                        className={`btn btn--sm ${applied ? 'btn--success' : 'btn--outline'}`}
                        onClick={() => handleConsolidateLowFillRoom(r.room_id)}
                        disabled={applied || isSaving}
                        title={
                          applied
                            ? 'Consolidation applied (save to persist)'
                            : isLabRoom
                              ? 'Move students into other labs only and vacate this lab'
                              : 'Move students into reserve/available seats of other halls and vacate this room'
                        }
                      >
                        {applied ? '✓ Consolidation Prepared' : 'Consolidate into Reserve Seats (Vacate Room)'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="slot-venues-directory no-print">
          <div className="slot-venues-directory__header">
            <div className="slot-venues-directory__title-group">
              <h3 className="slot-venues-directory__title">
                <Layers size={17} style={{ color: 'var(--iiui-green)' }} />
                Slot Venues &amp; Invigilation Directory
              </h3>
              <div className="slot-venues-directory__stats">
                <span className="slot-venues-directory__stat-pill slot-venues-directory__stat-pill--navy">
                  <Building2 size={12} />
                  {activeRooms.length} Active Venues ({hallsCount} Halls/Rooms, {labsCount} Labs)
                </span>
                <span className="slot-venues-directory__stat-pill slot-venues-directory__stat-pill--green">
                  <Users size={12} />
                  {totalSeatedInSlot} Students Seated
                </span>
                <span className="slot-venues-directory__stat-pill">
                  <UserCheck size={12} />
                  {totalStaffedInSlot} Duties Assigned
                </span>
              </div>
            </div>

            <div className="slot-venues-directory__controls">
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
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  type="button"
                  className={`venue-view-toggle-btn ${venueViewMode === 'table' ? 'venue-view-toggle-btn--active' : ''}`}
                  onClick={() => setVenueViewMode('table')}
                  title="Table View"
                >
                  <List size={14} />
                </button>
              </div>

              {/* Collapse/Expand Toggle */}
              <button
                type="button"
                className="btn btn--sm btn--outline"
                style={{ padding: '3px 8px', fontSize: '0.74rem', gap: '3px' }}
                onClick={() => setIsVenueDirectoryOpen(!isVenueDirectoryOpen)}
                title={isVenueDirectoryOpen ? 'Collapse Directory' : 'Expand Directory'}
              >
                {isVenueDirectoryOpen ? (
                  <>
                    <span>Hide</span>
                    <ChevronUp size={13} />
                  </>
                ) : (
                  <>
                    <span>Show</span>
                    <ChevronDown size={13} />
                  </>
                )}
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
                            <Users size={12} />
                            <strong>{r.seated || 0}</strong> seated
                          </span>
                        </div>

                        <div className="slot-venue-card__staff-box">
                          <div className="slot-venue-card__staff-heading">
                            <UserCheck size={12} style={{ color: '#059669' }} />
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
                                <AlertCircle size={12} />
                                <span>No invigilator assigned</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="slot-venue-card__footer">
                          <span>Jump to sheet &darr;</span>
                          <ChevronRight size={13} className="slot-venue-card__arrow" />
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
                                <Users size={12} />
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
