import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { examOpsService } from '../services/index.js';
import Modal from '../components/Modal.jsx';
import { formatTimeRange12 } from '../utils/timeFormat.js';

const DUTY_STATUS_OPTIONS = ['assigned', 'confirmed', 'completed', 'absent'];

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
    if (!addDutyForm.slot_id || !addDutyForm.room_id || !addDutyForm.instructor) {
      showBanner?.('Please select a slot, room, and invigilator.', 'danger');
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
    if (!editDuty || !editForm.instructor) return;
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
      const matchType = !typeFilter || d.duty_type === typeFilter;
      const matchSource = !sourceFilter || (d.source || 'auto') === sourceFilter;
      const matchStatus = !statusFilter || (d.status || 'assigned') === statusFilter;
      return matchQuery && matchSlot && matchType && matchSource && matchStatus;
    });
  }, [duties, searchQuery, slotFilter, typeFilter, sourceFilter, statusFilter]);

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
            is_ecr: false,
          }
      );
    }
    return facultyWorkload.filter((m) => !m.is_ecr && !usedInSlot.has(m.name));
  }, [addDutyForm.slot_id, addRoomContext, duties, facultyWorkload, extraDutyCap]);

  // Candidate instructors for edit modal
  const editCandidates = useMemo(() => {
    if (!editDuty) return [];
    const slotDuties = duties.filter(
      (d) => d.slot_id === editDuty.slot_id && d.id !== editDuty.id
    );
    const usedInSlot = new Set(slotDuties.map((d) => d.instructor));
    return facultyWorkload.filter(
      (m) => (!m.is_ecr && !usedInSlot.has(m.name)) || m.name === editDuty.instructor
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
          <p className="itms-dash__pageSub">
            Faculty examination hall assignments, room staffing coverage, and workload quotas.
          </p>
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
            {stats.ecr_exempt_count || 0} ECR staff exempt &bull; Zero clashes
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

              {(searchQuery || slotFilter || typeFilter || sourceFilter || statusFilter) && (
                <button
                  type="button"
                  className="btn btn--sm btn--outline"
                  onClick={() => {
                    setSearchQuery('');
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

          {/* Table */}
          <div className="card-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>Exam Slot</th>
                  <th style={{ minWidth: 140 }}>Room / Lab</th>
                  <th style={{ minWidth: 190 }}>Invigilator Name</th>
                  <th style={{ width: 140 }}>Category</th>
                  <th style={{ width: 110 }}>Source</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 120, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--itms-text-muted)' }}>
                      Loading invigilation roster...
                    </td>
                  </tr>
                ) : filteredDuties.map((duty) => {
                  const isOwn = duty.duty_type === 'own_subject';
                  const isManual = duty.source === 'manual';
                  return (
                    <tr key={duty.id}>
                      <td>
                        <strong style={{ color: 'var(--iiui-navy)' }}>
                          {formatSlotLabel(duty.slot_id)}
                        </strong>
                        <div style={{ fontSize: '0.74rem', color: 'var(--itms-text-muted)' }}>
                          {duty.slot_is_morning ? 'Morning session' : 'Afternoon session'}
                        </div>
                      </td>
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
                          {duty.is_ecr_exempt && (
                            <span style={{ fontSize: '0.7rem', color: '#0369a1', background: '#e0f2fe', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                              ECR
                            </span>
                          )}
                          {duty.is_senior && (
                            <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                              Senior
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
                            background: isOwn ? '#f0fdf4' : '#eff6ff',
                            color: isOwn ? '#15803d' : '#1d4ed8',
                            border: `1px solid ${isOwn ? '#bbf7d0' : '#bfdbfe'}`,
                          }}
                        >
                          {isOwn ? 'Own Subject' : 'Extra Duty'}
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
                {!isLoading && filteredDuties.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--itms-text-muted)' }}>
                      {duties.length === 0 ? (
                        <div>
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
                      ) : (
                        'No assignments matched your filters.'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                  <th style={{ width: 110 }}>Extra Duties</th>
                  <th style={{ width: 110 }}>Own Subject</th>
                  <th style={{ width: 90 }}>Total</th>
                  <th style={{ width: 130 }}>Quota Capacity</th>
                  <th style={{ width: 130 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredFaculty.map((member) => (
                  <tr key={member.name}>
                    <td style={{ fontWeight: 600, color: 'var(--iiui-navy)' }}>
                      {member.name}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)', maxWidth: 260 }}>
                      {member.courses?.length ? member.courses.join(', ') : '—'}
                    </td>
                    <td style={{ fontWeight: 700 }}>{member.extra_duties}</td>
                    <td>{member.own_subject_duties}</td>
                    <td style={{ fontWeight: 700, color: 'var(--iiui-navy)' }}>{member.total_duties}</td>
                    <td>
                      {member.is_ecr ? (
                        <span style={{ fontSize: '0.74rem', color: '#0369a1', fontWeight: 600 }}>
                          ECR Exempt
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                          {member.remaining_extra_capacity} of {extraDutyCap} left
                        </span>
                      )}
                    </td>
                    <td>
                      {member.is_ecr ? (
                        <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                          ECR Operational
                        </span>
                      ) : member.extra_duties >= extraDutyCap ? (
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
                ))}
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
              <p style={{ margin: '0.5rem auto 0', color: 'var(--itms-text-muted)', fontSize: '0.84rem', maxWidth: 500 }}>
                The active duty roster adheres strictly to the 4-duty extra quota cap, room staffing ratios,
                ECR committee exemptions, and practical course teacher lab ownership.
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
                  {m.name} ({m.extra_duties}/{extraDutyCap} extra duties)
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
                    {m.name} ({m.extra_duties}/{extraDutyCap} extra duties)
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
    </div>
  );
}
