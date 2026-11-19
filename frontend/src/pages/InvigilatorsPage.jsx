import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { examOpsService } from '../services/index.js';
import Modal from '../components/Modal.jsx';
import { formatTimeRange12 } from '../utils/timeFormat.js';

const DUTY_STATUS_OPTIONS = ['assigned', 'confirmed', 'completed', 'absent'];

// Faculty roles (admin-manageable).  Labels describe what the algorithm may
// assign to a teacher holding that role.
const FACULTY_ROLE_OPTIONS = [
  { value: 'regular', label: 'Regular — duty pool' },
  { value: 'ecr', label: 'ECR — relief rotation' },
  { value: 'ecl', label: 'ECL — own exams only' },
  { value: 'chairman', label: 'Chairman/HOD — own exam only' },
  { value: 'senior', label: 'Most Senior — max 2, dire need' },
  { value: 'visiting', label: 'Visiting — own exam only' },
  { value: 'no_duty', label: 'No Duty — visits only' },
];

const FACULTY_ROLE_LABELS = Object.fromEntries(
  FACULTY_ROLE_OPTIONS.map((r) => [r.value, r.label.split(' — ')[0]])
);

const EMPTY_ADD_DUTY = {
  slot_id: '',
  room_id: '',
  instructor: '',
  status: 'assigned',
  notes: '',
};

export default function InvigilatorsPage({
  slots = [],
  datesheet = { datesheet: [] },
  showBanner,
}) {
  // Main view navigation: 'assignments' | 'coverage' | 'workload' | 'rules'
  const [activeView, setActiveView] = useState('assignments');

  // Core roster state
  const [roster, setRoster] = useState(null);
  const [duties, setDuties] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Recalculation settings
  const [preserveManual, setPreserveManual] = useState(true);

  // Filters for duties table
  const [searchQuery, setSearchQuery] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [slotFilter, setSlotFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Filter for faculty view
  const [facultySearch, setFacultySearch] = useState('');

  // Modals state
  const [editDuty, setEditDuty] = useState(null);
  const [editForm, setEditForm] = useState({ instructor: '', status: 'assigned', notes: '' });
  const [addDutyOpen, setAddDutyOpen] = useState(false);
  const [addDutyForm, setAddDutyForm] = useState(EMPTY_ADD_DUTY);
  const [isSavingDuty, setIsSavingDuty] = useState(false);

  // Manage Faculty (policy) modal state
  const [manageOpen, setManageOpen] = useState(false);
  const [policyRows, setPolicyRows] = useState([]);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState('');
  const [addFacultyForm, setAddFacultyForm] = useState({
    instructor: '',
    role: 'regular',
    max_extra_duties: '',
  });

  // Load roster data from backend
  const loadRoster = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await examOpsService.getRoster();
      setRoster(data || null);
      setDuties(Array.isArray(data?.duties) ? data.duties : []);
    } catch (err) {
      showBanner?.(`Could not load invigilation roster: ${err.message}`, 'danger');
    } finally {
      setIsLoading(false);
    }
  }, [showBanner]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  // Derived properties from roster
  const rosterSlots = useMemo(() => roster?.slots || [], [roster]);
  const rosterIssues = useMemo(() => roster?.issues || [], [roster]);
  const facultyWorkload = useMemo(() => roster?.faculty || [], [roster]);
  const stats = roster?.stats || {};
  const extraDutyCap = roster?.extra_duty_cap || 4;
  const isDatesheetPublished = (roster?.datesheet_status || datesheet?.status) === 'PUBLISHED';

  // Format slot label helper
  const formatSlotLabel = useCallback((slotId) => {
    const slot =
      slots.find((s) => s.id === slotId) ||
      rosterSlots.find((s) => s.slot_id === slotId);
    if (!slot) return slotId;
    return `${slot.date} (${formatTimeRange12(slot.start_time, slot.end_time)})`;
  }, [slots, rosterSlots]);

  // Recalculate duties handler
  const handleRecalculate = async (targetSlotId = '') => {
    setIsRecalculating(true);
    try {
      const result = await examOpsService.recalculateDuties({
        slot_ids: targetSlotId ? [targetSlotId] : [],
        preserve_manual: preserveManual,
        duty_cap: extraDutyCap,
      });
      await loadRoster();
      const parts = [`${result.generated_count || 0} duties scheduled`];
      if (result.preserved_manual_count) {
        parts.push(`${result.preserved_manual_count} manual overrides preserved`);
      }
      showBanner?.(`Roster updated: ${parts.join(', ')}.`, 'success');
    } catch (err) {
      showBanner?.(`Recalculation error: ${err.message}`, 'danger');
    } finally {
      setIsRecalculating(false);
    }
  };

  // Add Duty handlers
  const handleOpenAdd = (slotId = '', roomId = '') => {
    const availableSlots = rosterSlots.length ? rosterSlots : slots;
    const defaultSlot = slotId || (availableSlots[0]?.slot_id || availableSlots[0]?.id || '');
    const slotObj = rosterSlots.find((s) => s.slot_id === defaultSlot);
    const defaultRoom = roomId || slotObj?.rooms?.find((r) => r.missing > 0)?.room_id || '';

    setAddDutyForm({
      ...EMPTY_ADD_DUTY,
      slot_id: defaultSlot,
      room_id: defaultRoom,
    });
    setAddDutyOpen(true);
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    if (!addDutyForm.slot_id) {
      showBanner?.('Validation Error: Please select an examination time slot.', 'danger');
      return;
    }
    if (!addDutyForm.room_id) {
      showBanner?.('Validation Error: Please select an examination room.', 'danger');
      return;
    }
    if (!addDutyForm.instructor?.trim()) {
      showBanner?.('Validation Error: Please select an invigilator for this duty.', 'danger');
      return;
    }
    setIsSavingDuty(true);
    try {
      await examOpsService.createDuty(addDutyForm);
      await loadRoster();
      setAddDutyOpen(false);
      showBanner?.(`Assigned ${addDutyForm.instructor} to room as manual override.`, 'success');
    } catch (err) {
      showBanner?.(`Assignment failed: ${err.message}`, 'danger');
    } finally {
      setIsSavingDuty(false);
    }
  };

  // Edit Duty handlers
  const handleOpenEdit = (duty) => {
    setEditDuty(duty);
    setEditForm({
      instructor: duty.instructor,
      status: duty.status || 'assigned',
      notes: duty.notes || '',
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editDuty) return;
    if (!editForm.instructor?.trim()) {
      showBanner?.('Validation Error: Invigilator name cannot be empty.', 'danger');
      return;
    }
    setIsSavingDuty(true);
    try {
      await examOpsService.updateDuty(editDuty.id, editForm);
      await loadRoster();
      setEditDuty(null);
      showBanner?.(`Updated assignment for ${editForm.instructor}.`, 'success');
    } catch (err) {
      showBanner?.(`Update failed: ${err.message}`, 'danger');
    } finally {
      setIsSavingDuty(false);
    }
  };

  // Delete Duty handler
  const handleDeleteDuty = async (duty) => {
    const ok = window.confirm(
      `Remove ${duty.instructor} from ${duty.room_name || duty.room_id}?`
    );
    if (!ok) return;
    try {
      await examOpsService.deleteDuty(duty.id);
      await loadRoster();
      showBanner?.(`Removed ${duty.instructor} assignment.`, 'success');
    } catch (err) {
      showBanner?.(`Removal failed: ${err.message}`, 'danger');
    }
  };

  // ------------------------------------------------------------------
  // Manage Faculty (roles, duty caps, admin-added teachers)
  // ------------------------------------------------------------------
  const refreshPolicyRows = useCallback(async () => {
    const rows = await examOpsService.getFacultyPolicy();
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      max_extra_duties_input:
        row.max_extra_duties_override === null || row.max_extra_duties_override === undefined
          ? ''
          : String(row.max_extra_duties_override),
      _dirty: false,
    }));
  }, []);

  const handleOpenManageFaculty = useCallback(async () => {
    setManageOpen(true);
    setPolicyLoading(true);
    try {
      setPolicyRows(await refreshPolicyRows());
    } catch (err) {
      showBanner?.(`Could not load faculty policy: ${err.message}`, 'danger');
    } finally {
      setPolicyLoading(false);
    }
  }, [refreshPolicyRows, showBanner]);

  const updatePolicyRow = useCallback((instructor, field, value) => {
    setPolicyRows((rows) =>
      rows.map((row) =>
        row.instructor === instructor ? { ...row, [field]: value, _dirty: true } : row
      )
    );
  }, []);

  const handleSavePolicyRow = useCallback(
    async (row) => {
      setSavingPolicy(row.instructor);
      try {
        await examOpsService.saveFacultyPolicy({
          instructor: row.instructor,
          role: row.role,
          max_extra_duties:
            row.max_extra_duties_input === '' ? null : Number(row.max_extra_duties_input),
        });
        setPolicyRows(await refreshPolicyRows());
        await loadRoster();
        showBanner?.(
          `Saved policy for ${row.instructor}. Recalculate the roster to redesign duties.`,
          'success'
        );
      } catch (err) {
        showBanner?.(`Could not save policy: ${err.message}`, 'danger');
      } finally {
        setSavingPolicy('');
      }
    },
    [refreshPolicyRows, loadRoster, showBanner]
  );

  const handleAddFaculty = useCallback(
    async (e) => {
      e.preventDefault();
      const name = addFacultyForm.instructor.trim();
      if (!name || name.length < 2) {
        showBanner?.('Validation Error: Faculty member name must be at least 2 characters long.', 'danger');
        return;
      }
      if (!/[A-Za-z]/.test(name)) {
        showBanner?.('Validation Error: Faculty member name must contain letters.', 'danger');
        return;
      }
      if (addFacultyForm.max_extra_duties !== '') {
        const cap = Number(addFacultyForm.max_extra_duties);
        if (isNaN(cap) || cap < 0 || cap > 10) {
          showBanner?.('Validation Error: Extra duty cap must be between 0 and 10.', 'danger');
          return;
        }
      }
      setSavingPolicy('__add__');
      try {
        await examOpsService.saveFacultyPolicy({
          instructor: name,
          role: addFacultyForm.role,
          max_extra_duties:
            addFacultyForm.max_extra_duties === ''
              ? null
              : Number(addFacultyForm.max_extra_duties),
        });
        setAddFacultyForm({ instructor: '', role: 'regular', max_extra_duties: '' });
        setPolicyRows(await refreshPolicyRows());
        await loadRoster();
        showBanner?.(`${name} added to the faculty roster. Recalculating duties...`, 'success');
        // The algorithm redesigns the roster so the new teacher is used.
        await handleRecalculate();
      } catch (err) {
        showBanner?.(`Could not add teacher: ${err.message}`, 'danger');
      } finally {
        setSavingPolicy('');
      }
    },
    [addFacultyForm, refreshPolicyRows, loadRoster, showBanner, handleRecalculate]
  );

  const handleDeletePolicy = useCallback(
    async (row) => {
      const isAdded = row.source === 'policy';
      const ok = window.confirm(
        isAdded
          ? `Remove ${row.instructor} from the faculty roster entirely?`
          : `Reset ${row.instructor} to the default departmental role rules?`
      );
      if (!ok) return;
      setSavingPolicy(row.instructor);
      try {
        await examOpsService.deleteFacultyPolicy(row.instructor);
        setPolicyRows(await refreshPolicyRows());
        await loadRoster();
        showBanner?.(
          isAdded
            ? `${row.instructor} removed from the roster.`
            : `${row.instructor} reset to default rules. Recalculate to apply.`,
          'success'
        );
      } catch (err) {
        showBanner?.(`Could not remove policy: ${err.message}`, 'danger');
      } finally {
        setSavingPolicy('');
      }
    },
    [refreshPolicyRows, loadRoster, showBanner]
  );

  // Filtered duties
  const filteredDuties = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return duties.filter((d) => {
      const matchQuery =
        !q ||
        (d.instructor || '').toLowerCase().includes(q) ||
        (d.room_name || d.room_id || '').toLowerCase().includes(q) ||
        (d.notes || '').toLowerCase().includes(q);
      const matchSlot = !slotFilter || d.slot_id === slotFilter;
      const matchPerson = !personFilter || d.instructor === personFilter;
      const matchType = !typeFilter || d.duty_type === typeFilter;
      const matchSource = !sourceFilter || (d.source || 'auto') === sourceFilter;
      const matchStatus = !statusFilter || (d.status || 'assigned') === statusFilter;
      return matchQuery && matchSlot && matchPerson && matchType && matchSource && matchStatus;
    });
  }, [duties, searchQuery, personFilter, slotFilter, typeFilter, sourceFilter, statusFilter]);

  const personOptions = useMemo(
    () =>
      Array.from(new Set(duties.map((d) => d.instructor).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [duties]
  );

  const dutyBlocks = useMemo(() => {
    const order = new Map(rosterSlots.map((s, idx) => [s.slot_id, idx]));
    const groups = new Map();
    filteredDuties.forEach((d) => {
      const key = d.slot_id || 'unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    return Array.from(groups.entries())
      .map(([slotId, list]) => {
        const slot = rosterSlots.find((s) => s.slot_id === slotId) || {};
        const rooms = new Set(list.map((d) => d.room_id || d.room_name));
        return {
          slotId,
          duties: list,
          slot,
          rooms: rooms.size,
          order: order.has(slotId) ? order.get(slotId) : 9999,
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [filteredDuties, rosterSlots]);

  // Filtered faculty for workload view
  const filteredFaculty = useMemo(() => {
    const q = facultySearch.trim().toLowerCase();
    if (!q) return facultyWorkload;
    return facultyWorkload.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.courses || []).some((c) => c.toLowerCase().includes(q))
    );
  }, [facultyWorkload, facultySearch]);

  // Candidate instructors for add modal
  const addSlotContext = useMemo(
    () => rosterSlots.find((s) => s.slot_id === addDutyForm.slot_id) || null,
    [rosterSlots, addDutyForm.slot_id]
  );
  const addRoomContext = useMemo(
    () => addSlotContext?.rooms?.find((r) => r.room_id === addDutyForm.room_id) || null,
    [addSlotContext, addDutyForm.room_id]
  );
  const addCandidates = useMemo(() => {
    if (!addRoomContext) return [];
    const slotDuties = duties.filter((d) => d.slot_id === addDutyForm.slot_id);
    const usedInSlot = new Set(slotDuties.map((d) => d.instructor));
    if (addRoomContext.is_lab && addRoomContext.lab_teachers?.length) {
      return addRoomContext.lab_teachers.map(
        (name) =>
          facultyWorkload.find((m) => m.name === name) || {
            name,
            extra_duties: 0,
            own_subject_duties: 0,
            remaining_extra_capacity: extraDutyCap,
            faculty_role: 'regular',
            is_ecr: false,
            is_ecl: false,
            is_no_duty: false,
          }
      );
    }
    // ECR members are relief staff and may be posted into a hall; ECL,
    // Chairman/HOD, visiting, and no-duty roles may only cover own exams.
    return facultyWorkload.filter(
      (m) =>
        !m.is_ecl &&
        !m.is_no_duty &&
        !m.is_chairman &&
        !m.is_visiting &&
        !usedInSlot.has(m.name)
    );
  }, [addDutyForm.slot_id, addRoomContext, duties, facultyWorkload, extraDutyCap]);

  // Candidate instructors for edit modal
  const editCandidates = useMemo(() => {
    if (!editDuty) return [];
    const slotDuties = duties.filter(
      (d) => d.slot_id === editDuty.slot_id && d.id !== editDuty.id
    );
    const usedInSlot = new Set(slotDuties.map((d) => d.instructor));
    return facultyWorkload.filter(
      (m) =>
        ((!m.is_ecl && !m.is_no_duty && !m.is_chairman && !m.is_visiting && !usedInSlot.has(m.name)) ||
          m.name === editDuty.instructor)
    );
  }, [duties, editDuty, facultyWorkload]);

  const understaffedCount = stats.understaffed_rooms || 0;
  const errorCount = stats.error_count || rosterIssues.filter((i) => i.severity === 'error').length;

  return (
    <div className="itms-dash__main">
      {/* Page Header */}
      <div className="itms-dash__pageHeader" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 className="itms-dash__pageTitle">Invigilator Duties</h1>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.82rem',
              fontWeight: 500,
              color: 'var(--itms-text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
              marginRight: '0.25rem',
            }}
            title="Preserve manual assignments when recalculating remaining duties."
          >
            <input
              type="checkbox"
              checked={preserveManual}
              onChange={(e) => setPreserveManual(e.target.checked)}
              style={{ accentColor: 'var(--iiui-green)' }}
            />
            Preserve Manual
          </label>

          <button
            type="button"
            className="btn btn--outline"
            onClick={() => handleOpenAdd()}
            disabled={!isDatesheetPublished}
            style={{ fontSize: '0.84rem' }}
          >
            + Assign Duty
          </button>

          <button
            type="button"
            className="btn btn--outline"
            onClick={handleOpenManageFaculty}
            style={{ fontSize: '0.84rem' }}
            title="Add teachers, set roles, and assign maximum duty limits."
          >
            Manage Faculty
          </button>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => handleRecalculate()}
            disabled={isRecalculating || !isDatesheetPublished}
            style={{ fontSize: '0.84rem' }}
          >
            {isRecalculating ? 'Recalculating...' : 'Recalculate Roster'}
          </button>
        </div>
      </div>

      {/* Clean 4-Metric Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--itms-border)',
            borderLeft: '4px solid var(--iiui-green)',
            borderRadius: '8px',
            padding: '0.9rem 1.1rem',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--itms-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Assignments
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--iiui-navy)', marginTop: 2 }}>
            {stats.total_duties ?? duties.length}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
            {stats.own_subject_count || 0} own subject &bull; {stats.extra_count || 0} extra duties
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--itms-border)',
            borderLeft: `4px solid ${understaffedCount > 0 ? 'var(--itms-danger)' : '#0284c7'}`,
            borderRadius: '8px',
            padding: '0.9rem 1.1rem',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--itms-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Room Staffing
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: understaffedCount > 0 ? 'var(--itms-danger)' : 'var(--iiui-navy)', marginTop: 2 }}>
            {stats.staffed_rooms ?? 0} / {stats.required_rooms ?? 0}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
            {understaffedCount > 0 ? `${understaffedCount} rooms need staff` : 'All active halls covered'}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--itms-border)',
            borderLeft: '4px solid #d97706',
            borderRadius: '8px',
            padding: '0.9rem 1.1rem',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--itms-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Faculty Workload
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--iiui-navy)', marginTop: 2 }}>
            {facultyWorkload.length} Faculty
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
            Max {extraDutyCap} extra duties per teacher &bull; {stats.manual_count || 0} manual
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--itms-border)',
            borderLeft: `4px solid ${errorCount > 0 ? 'var(--itms-danger)' : '#16a34a'}`,
            borderRadius: '8px',
            padding: '0.9rem 1.1rem',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--itms-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Policy Validation
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: errorCount > 0 ? 'var(--itms-danger)' : '#16a34a', marginTop: 2 }}>
            {errorCount > 0 ? `${errorCount} Issues` : '100% Compliant'}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
            {stats.ecr_count || 0} ECR &bull; {stats.ecl_count || 0} ECL &bull;{' '}
            {stats.chairman_count || 0} Chairman &bull; {stats.senior_role_count || 0} dire-need
            seniors &bull; Zero clashes
          </div>
        </div>
      </div>

      {/* Sub-view Segmented Tabs */}
      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        <div className="toolbar__actions" style={{ gap: '0.4rem' }}>
          <button
            type="button"
            className={`btn btn--sm ${activeView === 'assignments' ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setActiveView('assignments')}
          >
            Duty Roster ({duties.length})
          </button>
          <button
            type="button"
            className={`btn btn--sm ${activeView === 'coverage' ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setActiveView('coverage')}
          >
            Room Coverage
          </button>
          <button
            type="button"
            className={`btn btn--sm ${activeView === 'workload' ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setActiveView('workload')}
          >
            Faculty Workload ({facultyWorkload.length})
          </button>
          <button
            type="button"
            className={`btn btn--sm ${activeView === 'rules' ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setActiveView('rules')}
          >
            Rule Validation
            {rosterIssues.length > 0 && (
              <span
                style={{
                  background: errorCount > 0 ? 'var(--itms-danger)' : '#d97706',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  padding: '1px 6px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  marginLeft: 6,
                }}
              >
                {rosterIssues.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: Duty Assignments Table */}
      {activeView === 'assignments' && (
        <>
          {/* Filter Bar */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--itms-border)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <div>
                <input
                  type="text"
                  className="form-control"
                  style={{ width: '220px', padding: '5px 9px', fontSize: '0.84rem' }}
                  placeholder="Search invigilator, room..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="form-control"
                style={{ width: 'auto', fontSize: '0.84rem', padding: '5px 9px' }}
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                title="Show only one person's duties"
              >
                <option value="">All Invigilators</option>
                {personOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                className="form-control"
                style={{ width: 'auto', fontSize: '0.84rem', padding: '5px 9px' }}
                value={slotFilter}
                onChange={(e) => setSlotFilter(e.target.value)}
              >
                <option value="">All Exam Slots</option>
                {rosterSlots.map((s) => (
                  <option key={s.slot_id} value={s.slot_id}>
                    {s.date} ({formatTimeRange12(s.start_time, s.end_time)})
                  </option>
                ))}
              </select>

              <select
                className="form-control"
                style={{ width: 'auto', fontSize: '0.84rem', padding: '5px 9px' }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Duty Types</option>
                <option value="own_subject">Own Subject (Exempt)</option>
                <option value="ecr_rotation">ECR Rotation (Relief)</option>
                <option value="extra">Extra Duty (Counted)</option>
              </select>

              <select
                className="form-control"
                style={{ width: 'auto', fontSize: '0.84rem', padding: '5px 9px' }}
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="">All Sources</option>
                <option value="auto">Auto-Generated</option>
                <option value="manual">Manual Override</option>
              </select>

              <select
                className="form-control"
                style={{ width: 'auto', fontSize: '0.84rem', padding: '5px 9px' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                {DUTY_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st.charAt(0).toUpperCase() + st.slice(1)}
                  </option>
                ))}
              </select>

              {(searchQuery || personFilter || slotFilter || typeFilter || sourceFilter || statusFilter) && (
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  onClick={() => {
                    setSearchQuery('');
                    setPersonFilter('');
                    setSlotFilter('');
                    setTypeFilter('');
                    setSourceFilter('');
                    setStatusFilter('');
                  }}
                  style={{ fontSize: '0.78rem' }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            <span style={{ fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Showing {filteredDuties.length} of {duties.length} assignments
            </span>
          </div>

          {/* Duty blocks grouped by exam slot */}
          {isLoading ? (
            <div className="card-table-wrapper" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--itms-text-muted)' }}>
              Loading invigilation roster...
            </div>
          ) : duties.length === 0 ? (
            <div className="card-table-wrapper" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--itms-text-muted)' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: 500 }}>
                No invigilation duty roster has been generated yet.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => handleRecalculate()}
                disabled={isRecalculating || !isDatesheetPublished}
              >
                {isRecalculating ? 'Generating...' : 'Generate Invigilation Roster'}
              </button>
            </div>
          ) : dutyBlocks.length === 0 ? (
            <div className="card-table-wrapper" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--itms-text-muted)' }}>
              No assignments matched your filters.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {dutyBlocks.map((block) => (
                <div key={block.slotId} className="card-table-wrapper" style={{ padding: '0.85rem 1.15rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      marginBottom: '0.65rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--iiui-navy)', fontSize: '0.95rem' }}>
                        {block.slot.date
                          ? new Date(`${block.slot.date}T00:00:00`).toLocaleDateString('en-GB', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : block.slotId}
                      </strong>
                      {block.slot.start_time && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)', fontWeight: 600 }}>
                          {formatTimeRange12(block.slot.start_time, block.slot.end_time)}
                        </span>
                      )}
                      {block.slot.is_morning !== undefined && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: block.slot.is_morning ? '#fffbeb' : '#f1f5f9',
                            color: block.slot.is_morning ? '#b45309' : '#334155',
                          }}
                        >
                          {block.slot.is_morning ? 'Morning' : 'Afternoon'}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>
                      {block.duties.length} dut{block.duties.length === 1 ? 'y' : 'ies'} &middot;{' '}
                      {block.rooms} room{block.rooms === 1 ? '' : 's'}
                    </span>
                  </div>

                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 140 }}>Room / Lab</th>
                        <th style={{ minWidth: 190 }}>Invigilator Name</th>
                        <th style={{ width: 140 }}>Category</th>
                        <th style={{ width: 110 }}>Source</th>
                        <th style={{ width: 100 }}>Status</th>
                        <th style={{ width: 120, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.duties.map((duty) => {
                        const isOwn = duty.duty_type === 'own_subject';
                        const isEcrRotation = duty.duty_type === 'ecr_rotation';
                        const isManual = duty.source === 'manual';
                        return (
                          <tr key={duty.id}>
                            <td>
                              <span
                                style={{
                                  background: duty.room_type === 'lab' ? '#f0fdf4' : '#f8fafc',
                                  color: duty.room_type === 'lab' ? '#15803d' : 'var(--iiui-navy)',
                                  border: `1px solid ${duty.room_type === 'lab' ? '#bbf7d0' : '#e2e8f0'}`,
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  fontWeight: 600,
                                  fontSize: '0.82rem',
                                }}
                              >
                                {duty.room_name || duty.room_id}
                              </span>
                              <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
                                {duty.room_type === 'lab' ? 'Computer Lab' : 'Written Hall'}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--iiui-navy)' }}>
                                {duty.instructor}
                              </div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                                {duty.is_ecr && (
                                  <span style={{ fontSize: '0.7rem', color: '#0369a1', background: '#e0f2fe', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                    ECR
                                  </span>
                                )}
                                {duty.is_ecl && (
                                  <span style={{ fontSize: '0.7rem', color: '#6d28d9', background: '#ede9fe', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                    ECL
                                  </span>
                                )}
                                {duty.is_chairman && (
                                  <span style={{ fontSize: '0.7rem', color: '#1e40af', background: '#dbeafe', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                    Chairman/HOD
                                  </span>
                                )}
                                {duty.is_visiting && (
                                  <span style={{ fontSize: '0.7rem', color: '#0f766e', background: '#ccfbf1', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                    Visiting
                                  </span>
                                )}
                                {duty.is_no_duty && (
                                  <span style={{ fontSize: '0.7rem', color: '#9a3412', background: '#ffedd5', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                    No-Duty
                                  </span>
                                )}
                                {duty.is_senior && (
                                  <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                    {duty.is_senior_role ? 'Senior (Max 2)' : 'Senior'}
                                  </span>
                                )}
                                {duty.notes && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)' }}>
                                    {duty.notes}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: '9999px',
                                  fontSize: '0.73rem',
                                  fontWeight: 600,
                                  background: isOwn
                                    ? '#f0fdf4'
                                    : isEcrRotation
                                      ? '#e0f2fe'
                                      : '#eff6ff',
                                  color: isOwn ? '#15803d' : isEcrRotation ? '#0369a1' : '#1d4ed8',
                                  border: `1px solid ${isOwn ? '#bbf7d0' : isEcrRotation ? '#bae6fd' : '#bfdbfe'}`,
                                }}
                              >
                                {isOwn ? 'Own Subject' : isEcrRotation ? 'ECR Rotation' : 'Extra Duty'}
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '2px 7px',
                                  borderRadius: '9999px',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  background: isManual ? '#fffbeb' : '#f8fafc',
                                  color: isManual ? '#b45309' : '#64748b',
                                  border: `1px solid ${isManual ? '#fde68a' : '#e2e8f0'}`,
                                }}
                              >
                                {isManual ? 'Manual' : 'Auto'}
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 7px',
                                  borderRadius: '9999px',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  background:
                                    duty.status === 'completed'
                                      ? '#f0fdf4'
                                      : duty.status === 'absent'
                                        ? '#fef2f2'
                                        : '#f1f5f9',
                                  color:
                                    duty.status === 'completed'
                                      ? '#15803d'
                                      : duty.status === 'absent'
                                        ? '#b91c1c'
                                        : '#334155',
                                }}
                              >
                                {duty.status || 'assigned'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn btn--sm btn--outline"
                                  onClick={() => handleOpenEdit(duty)}
                                  title="Edit assignment"
                                  style={{ padding: '2px 7px', fontSize: '0.78rem' }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--sm btn--outline"
                                  onClick={() => handleDeleteDuty(duty)}
                                  title="Remove assignment"
                                  style={{ padding: '2px 7px', fontSize: '0.78rem', color: 'var(--itms-danger)', borderColor: '#fecaca' }}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* VIEW 2: Room Coverage View */}
      {activeView === 'coverage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {rosterSlots.map((slot) => (
            <div key={slot.slot_id} className="card-table-wrapper" style={{ padding: '0.85rem 1.15rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  marginBottom: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <strong style={{ color: 'var(--iiui-navy)', fontSize: '0.95rem' }}>
                    {slot.date} ({formatTimeRange12(slot.start_time, slot.end_time)})
                  </strong>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: slot.is_morning ? '#fffbeb' : '#f1f5f9',
                      color: slot.is_morning ? '#b45309' : '#334155',
                    }}
                  >
                    {slot.is_morning ? 'Morning' : 'Afternoon'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  onClick={() => handleRecalculate(slot.slot_id)}
                  disabled={isRecalculating}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}
                >
                  <RotateCcw size={12} />
                  Recalculate Slot
                </button>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room / Lab</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Assigned</th>
                    <th>Coverage Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(slot.rooms || []).map((room) => {
                    const isUnder = room.missing > 0;
                    const isOver = room.overstaffed > 0;
                    return (
                      <tr key={`${slot.slot_id}-${room.room_id}`}>
                        <td style={{ fontWeight: 600 }}>{room.room_name}</td>
                        <td>{room.is_lab ? 'Lab' : 'Hall'}</td>
                        <td>{room.required}</td>
                        <td style={{ fontWeight: 700 }}>{room.assigned}</td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: isUnder ? '#fef2f2' : isOver ? '#fffbeb' : '#f0fdf4',
                              color: isUnder ? '#b91c1c' : isOver ? '#b45309' : '#15803d',
                              border: `1px solid ${isUnder ? '#fecaca' : isOver ? '#fde68a' : '#bbf7d0'}`,
                            }}
                          >
                            {isUnder
                              ? `Understaffed (${room.missing} missing)`
                              : isOver
                                ? `Overstaffed (+${room.overstaffed})`
                                : 'Fully Staffed'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isUnder ? (
                            <button
                              type="button"
                              className="btn btn--sm btn--outline"
                              onClick={() => handleOpenAdd(slot.slot_id, room.room_id)}
                              style={{ fontSize: '0.76rem' }}
                            >
                              + Assign
                            </button>
                          ) : (
                            <span style={{ color: 'var(--itms-text-muted)', fontSize: '0.78rem' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!slot.rooms || slot.rooms.length === 0) && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--itms-text-muted)', padding: '1rem' }}>
                        No examination rooms active in this slot.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 3: Faculty Workload View */}
      {activeView === 'workload' && (
        <>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--itms-border)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div>
              <input
                type="text"
                className="form-control"
                style={{ width: '260px', padding: '5px 9px', fontSize: '0.84rem' }}
                placeholder="Search faculty name or course..."
                value={facultySearch}
                onChange={(e) => setFacultySearch(e.target.value)}
              />
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Showing {filteredFaculty.length} faculty members &bull; Extra Duty Cap: {extraDutyCap}
            </span>
          </div>

          <div className="card-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Faculty Member</th>
                  <th>Assigned Courses</th>
                  <th style={{ width: 100 }}>Extra Duties</th>
                  <th style={{ width: 90 }}>Own Subject</th>
                  <th style={{ width: 80 }}>ECR Rot.</th>
                  <th style={{ width: 90 }}>Total</th>
                  <th style={{ width: 150 }}>Quota Capacity</th>
                  <th style={{ width: 140 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredFaculty.map((member) => {
                  const maxDuties = member.max_duties ?? extraDutyCap;
                  const capReached =
                    member.is_no_duty ||
                    member.is_ecl ||
                    member.is_chairman ||
                    member.is_visiting ||
                    member.extra_duties >= maxDuties;
                  return (
                    <tr key={member.name}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--iiui-navy)' }}>{member.name}</div>
                        {member.faculty_role && member.faculty_role !== 'regular' && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--itms-text-muted)', marginTop: 1 }}>
                            {FACULTY_ROLE_LABELS[member.faculty_role] || member.faculty_role}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)', maxWidth: 260 }}>
                        {member.courses?.length ? member.courses.join(', ') : '—'}
                      </td>
                      <td style={{ fontWeight: 700 }}>{member.extra_duties}</td>
                      <td>{member.own_subject_duties}</td>
                      <td>{member.ecr_rotation_duties || 0}</td>
                      <td style={{ fontWeight: 700, color: 'var(--iiui-navy)' }}>{member.total_duties}</td>
                      <td>
                        {member.is_no_duty ? (
                          <span style={{ fontSize: '0.74rem', color: '#9a3412', fontWeight: 600 }}>
                            No-Duty Role
                          </span>
                        ) : member.is_ecl ? (
                          <span style={{ fontSize: '0.74rem', color: '#6d28d9', fontWeight: 600 }}>
                            Own Exams Only
                          </span>
                        ) : member.is_chairman ? (
                          <span style={{ fontSize: '0.74rem', color: '#1e40af', fontWeight: 600 }}>
                            Own Exam Only (HOD)
                          </span>
                        ) : member.is_visiting ? (
                          <span style={{ fontSize: '0.74rem', color: '#0f766e', fontWeight: 600 }}>
                            Own Exam Only
                          </span>
                        ) : member.is_ecr ? (
                          <span style={{ fontSize: '0.74rem', color: '#0369a1', fontWeight: 600 }}>
                            ECR Rotation
                          </span>
                        ) : member.is_senior_role ? (
                          <span style={{ fontSize: '0.74rem', color: '#92400e', fontWeight: 600 }}>
                            Max 2 Extra (Dire Need)
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                            {member.remaining_extra_capacity} of {maxDuties} left
                          </span>
                        )}
                      </td>
                      <td>
                        {member.is_no_duty ? (
                          <span style={{ fontSize: '0.72rem', background: '#ffedd5', color: '#9a3412', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                            No Duty Assigned
                          </span>
                        ) : member.is_ecl ? (
                          <span style={{ fontSize: '0.72rem', background: '#ede9fe', color: '#6d28d9', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                            ECL &mdash; Own Exams Only
                          </span>
                        ) : member.is_chairman ? (
                          <span style={{ fontSize: '0.72rem', background: '#dbeafe', color: '#1e40af', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                            Chairman &mdash; Own Exam
                          </span>
                        ) : member.is_visiting ? (
                          <span style={{ fontSize: '0.72rem', background: '#ccfbf1', color: '#0f766e', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                            Visiting &mdash; Own Exam
                          </span>
                        ) : member.is_ecr ? (
                          <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                            ECR Rotation Staff
                          </span>
                        ) : member.is_senior_role ? (
                          <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                            Dire-Need Senior
                          </span>
                        ) : capReached ? (
                          <span style={{ fontSize: '0.72rem', background: '#fef2f2', color: '#b91c1c', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                            Cap Reached
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', background: '#f0fdf4', color: '#15803d', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                            Eligible
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* VIEW 4: Rule Validation & Policy Checks */}
      {activeView === 'rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {rosterIssues.length === 0 ? (
            <div
              className="card-table-wrapper"
              style={{
                padding: '2rem',
                textAlign: 'center',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '1.75rem', color: '#15803d', marginBottom: 8, lineHeight: 1 }}>✓</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#15803d' }}>
                All Invigilation Policy Rules Satisfied
              </div>
              <p style={{ margin: '0.5rem auto 0', color: 'var(--itms-text-muted)', fontSize: '0.84rem', maxWidth: 560 }}>
                The active duty roster adheres strictly to room staffing ratios, the ECR relief
                rotation (one ECR teacher per slot, skipped for own papers), the Chairman/HOD
                own-exam-only rule, the two-extra-duty dire-need limit for the most-senior faculty,
                ECL and visiting own-exam-only exemptions, faculty policy caps, and practical
                course teacher lab ownership.
              </p>
            </div>
          ) : (
            <div className="card-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Severity</th>
                    <th style={{ width: 120 }}>Rule Code</th>
                    <th>Diagnostic Message</th>
                    <th style={{ width: 100 }}>Slot</th>
                    <th style={{ width: 100 }}>Room</th>
                    <th style={{ width: 160 }}>Instructor</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterIssues.map((issue, idx) => (
                    <tr key={`${issue.code}-${idx}`}>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: issue.severity === 'error' ? '#fef2f2' : '#fffbeb',
                            color: issue.severity === 'error' ? '#b91c1c' : '#b45309',
                          }}
                        >
                          {issue.severity.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)', fontWeight: 600 }}>
                        {issue.code}
                      </td>
                      <td style={{ fontSize: '0.84rem' }}>{issue.message}</td>
                      <td style={{ fontSize: '0.78rem' }}>{issue.slot_id || '—'}</td>
                      <td style={{ fontSize: '0.78rem' }}>{issue.room_id || '—'}</td>
                      <td style={{ fontSize: '0.78rem', fontWeight: 600 }}>{issue.instructor || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Manual Duty Modal */}
      <Modal
        isOpen={addDutyOpen}
        title="Assign Manual Invigilation Duty"
        onClose={() => setAddDutyOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setAddDutyOpen(false)}
              disabled={isSavingDuty}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSaveAdd}
              disabled={isSavingDuty || !addDutyForm.slot_id || !addDutyForm.room_id || !addDutyForm.instructor}
            >
              {isSavingDuty ? 'Assigning...' : 'Assign Duty'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSaveAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <label className="form-label">
            Exam Slot
            <select
              className="form-control"
              value={addDutyForm.slot_id}
              onChange={(e) => {
                const sId = e.target.value;
                const slotObj = rosterSlots.find((s) => s.slot_id === sId);
                const rObj = slotObj?.rooms?.find((r) => r.missing > 0);
                setAddDutyForm({
                  ...addDutyForm,
                  slot_id: sId,
                  room_id: rObj?.room_id || '',
                  instructor: '',
                });
              }}
              required
            >
              <option value="">Select Examination Slot</option>
              {rosterSlots.map((s) => {
                const missing = (s.rooms || []).reduce((acc, r) => acc + (r.missing || 0), 0);
                return (
                  <option key={s.slot_id} value={s.slot_id}>
                    {s.date} ({formatTimeRange12(s.start_time, s.end_time)}) {missing > 0 ? `· (${missing} needed)` : ''}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="form-label">
            Room / Lab
            <select
              className="form-control"
              value={addDutyForm.room_id}
              disabled={!addDutyForm.slot_id}
              onChange={(e) => setAddDutyForm({ ...addDutyForm, room_id: e.target.value, instructor: '' })}
              required
            >
              <option value="">Select Room</option>
              {(addSlotContext?.rooms || []).map((r) => (
                <option key={r.room_id} value={r.room_id}>
                  {r.room_name} ({r.is_lab ? 'Lab' : 'Hall'}) &bull; {r.assigned}/{r.required} assigned
                </option>
              ))}
            </select>
          </label>

          <label className="form-label">
            Invigilator
            <select
              className="form-control"
              value={addDutyForm.instructor}
              disabled={!addDutyForm.room_id}
              onChange={(e) => setAddDutyForm({ ...addDutyForm, instructor: e.target.value })}
              required
            >
              <option value="">Select Faculty Member</option>
              {addCandidates.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} ({m.extra_duties}/{m.max_duties ?? extraDutyCap} extra duties)
                </option>
              ))}
            </select>
          </label>

          <label className="form-label">
            Duty Status
            <select
              className="form-control"
              value={addDutyForm.status}
              onChange={(e) => setAddDutyForm({ ...addDutyForm, status: e.target.value })}
            >
              {DUTY_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="form-label">
            Notes (Optional)
            <textarea
              className="form-control"
              rows={2}
              placeholder="e.g. Approved replacement by department coordinator"
              value={addDutyForm.notes}
              onChange={(e) => setAddDutyForm({ ...addDutyForm, notes: e.target.value })}
            />
          </label>
        </form>
      </Modal>

      {/* Edit Duty Modal */}
      <Modal
        isOpen={Boolean(editDuty)}
        title="Edit Invigilation Duty"
        onClose={() => setEditDuty(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setEditDuty(null)}
              disabled={isSavingDuty}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSaveEdit}
              disabled={isSavingDuty || !editForm.instructor}
            >
              {isSavingDuty ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        }
      >
        {editDuty && (
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '0.65rem 0.85rem',
                fontSize: '0.82rem',
              }}
            >
              <strong style={{ color: 'var(--iiui-navy)' }}>{formatSlotLabel(editDuty.slot_id)}</strong>
              <div style={{ color: 'var(--itms-text-muted)', marginTop: 2 }}>
                {editDuty.room_name || editDuty.room_id} &bull; Requires {editDuty.required_invigilators} invigilator(s)
              </div>
            </div>

            <label className="form-label">
              Assigned Faculty Member
              <select
                className="form-control"
                value={editForm.instructor}
                onChange={(e) => setEditForm({ ...editForm, instructor: e.target.value })}
                required
              >
                {editCandidates.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.extra_duties}/{m.max_duties ?? extraDutyCap} extra duties)
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Duty Status
              <select
                className="form-control"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                {DUTY_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st.charAt(0).toUpperCase() + st.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Notes
              <textarea
                className="form-control"
                rows={2}
                placeholder="Reason for manual adjustment..."
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </label>
          </form>
        )}
      </Modal>

      {/* Manage Faculty Modal (admin policy: add teachers, roles, duty caps) */}
      <Modal
        isOpen={manageOpen}
        title="Manage Faculty"
        onClose={() => setManageOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setManageOpen(false)}
              disabled={Boolean(savingPolicy)}
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={async () => {
                setManageOpen(false);
                await handleRecalculate();
              }}
              disabled={Boolean(savingPolicy) || isRecalculating || !isDatesheetPublished}
            >
              {isRecalculating ? 'Recalculating...' : 'Recalculate Roster'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '0.65rem 0.85rem',
              fontSize: '0.8rem',
              color: 'var(--itms-text-muted)',
            }}
          >
            Roles drive the duty algorithm: <strong>Regular</strong> teachers carry up to 4 extra
            duties; <strong>ECR</strong> members rotate one relief duty per exam slot;{' '}
            <strong>ECL / Visiting / Chairman</strong> cover only their own exams; the{' '}
            <strong>most-senior</strong> teachers get at most 2 extra duties and only in dire need.
            &ldquo;Max duties&rdquo; overrides the default cap per teacher (leave empty for the
            default).
          </div>

          {/* Add teacher form */}
          <form
            onSubmit={handleAddFaculty}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1.4fr 0.8fr auto',
              gap: '0.5rem',
              alignItems: 'end',
            }}
          >
            <label className="form-label" style={{ margin: 0 }}>
              Add Teacher
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Dr. New Faculty Member"
                value={addFacultyForm.instructor}
                onChange={(e) => setAddFacultyForm({ ...addFacultyForm, instructor: e.target.value })}
                required
              />
            </label>
            <label className="form-label" style={{ margin: 0 }}>
              Role
              <select
                className="form-control"
                value={addFacultyForm.role}
                onChange={(e) => setAddFacultyForm({ ...addFacultyForm, role: e.target.value })}
              >
                {FACULTY_ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label" style={{ margin: 0 }}>
              Max Duties
              <input
                type="number"
                min={0}
                max={20}
                className="form-control"
                placeholder="Default"
                value={addFacultyForm.max_extra_duties}
                onChange={(e) =>
                  setAddFacultyForm({ ...addFacultyForm, max_extra_duties: e.target.value })
                }
              />
            </label>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={Boolean(savingPolicy)}
            >
              {savingPolicy === '__add__' ? 'Adding...' : '+ Add Teacher'}
            </button>
          </form>

          {/* Policy table */}
          <div className="card-table-wrapper" style={{ maxHeight: '46vh', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Faculty Member</th>
                  <th style={{ width: 190 }}>Role</th>
                  <th style={{ width: 110 }}>Max Duties</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policyLoading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--itms-text-muted)' }}>
                      Loading faculty...
                    </td>
                  </tr>
                ) : policyRows.map((row) => (
                  <tr key={row.instructor}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--iiui-navy)' }}>
                        {row.instructor}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)' }}>
                        {row.courses?.length ? row.courses.join(', ') : 'No course assignment'}
                        {row.source === 'policy' && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: '0.68rem',
                              background: '#ecfdf5',
                              color: '#047857',
                              padding: '1px 5px',
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            Admin-added
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <select
                        className="form-control"
                        style={{ padding: '4px 7px', fontSize: '0.8rem' }}
                        value={row.role}
                        onChange={(e) => updatePolicyRow(row.instructor, 'role', e.target.value)}
                      >
                        {FACULTY_ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        className="form-control"
                        style={{ padding: '4px 7px', fontSize: '0.8rem' }}
                        placeholder="Default"
                        value={row.max_extra_duties_input}
                        onChange={(e) =>
                          updatePolicyRow(row.instructor, 'max_extra_duties_input', e.target.value)
                        }
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          disabled={!row._dirty || Boolean(savingPolicy)}
                          onClick={() => handleSavePolicyRow(row)}
                          style={{ padding: '2px 8px', fontSize: '0.76rem' }}
                        >
                          {savingPolicy === row.instructor ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--outline"
                          disabled={Boolean(savingPolicy)}
                          onClick={() => handleDeletePolicy(row)}
                          style={{ padding: '2px 8px', fontSize: '0.76rem', color: 'var(--itms-danger)', borderColor: '#fecaca' }}
                          title={
                            row.source === 'policy'
                              ? 'Remove this admin-added teacher entirely'
                              : 'Reset to the default departmental role rules'
                          }
                        >
                          {row.source === 'policy' ? 'Remove' : 'Reset'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!policyLoading && policyRows.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--itms-text-muted)' }}>
                      No faculty found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
