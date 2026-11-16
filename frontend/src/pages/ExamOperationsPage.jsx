import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Clock,
  User,
  Download,
  RefreshCw,
  Search,
  Image as ImageIcon,
  Trash2,
  Users,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  ListChecks,
  Gauge,
  BookOpen,
  AlertCircle,
  UserCheck,
  XCircle,
  Lock,
} from 'lucide-react';
import { examOpsService } from '../services/index.js';
import Modal from '../components/Modal.jsx';

const EMPTY_REPORT = {
  slot_id: '',
  room_id: '',
  roll_no: '',
  course_code: '',
  invigilator: '',
  details: '',
  evidence: [],
  signature_data: '',
};

const DUTY_STATUS_OPTIONS = ['assigned', 'confirmed', 'completed', 'absent'];

const EMPTY_ADD_DUTY = {
  slot_id: '',
  room_id: '',
  instructor: '',
  status: 'assigned',
  notes: '',
};

const TONE_COLORS = {
  default: { bg: '#f8fafc', border: '#e2e8f0', text: 'var(--iiui-navy)' },
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
  danger: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
};

function HealthCard({ label, value, help, tone = 'default', icon = null }) {
  const colors = TONE_COLORS[tone] || TONE_COLORS.default;
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: '0.8rem 0.9rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--itms-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        {icon}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: colors.text, lineHeight: 1.2, marginTop: 4 }}>
        {value}
      </div>
      {help && (
        <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
          {help}
        </div>
      )}
    </div>
  );
}

function StatusPill({ children, tone = 'default' }) {
  const colors = TONE_COLORS[tone] || TONE_COLORS.default;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: 9999,
        fontSize: '0.72rem',
        fontWeight: 700,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
    >
      {children}
    </span>
  );
}

function dutyStatusTone(status) {
  if (status === 'completed') return 'success';
  if (status === 'confirmed') return 'info';
  if (status === 'absent') return 'danger';
  return 'warning';
}


function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export default function ExamOperationsPage({
  slots = [],
  rooms = [],
  students = [],
  datesheet = { datesheet: [] },
  showBanner,
}) {
  const [activeTab, setActiveTab] = useState('duties'); // 'duties' | 'umc'
  const [roster, setRoster] = useState(null);
  const [rosterView, setRosterView] = useState('assignments'); // assignments | coverage | workload | issues
  const [duties, setDuties] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportFilter, setReportFilter] = useState('');
  const [dutySearch, setDutySearch] = useState('');
  const [dutySlotFilter, setDutySlotFilter] = useState('');
  const [dutySourceFilter, setDutySourceFilter] = useState('');
  const [dutyTypeFilter, setDutyTypeFilter] = useState('');
  const [facultySearch, setFacultySearch] = useState('');
  const [preserveManual, setPreserveManual] = useState(true);
  const [releaseInvalidManual, setReleaseInvalidManual] = useState(false);

  const [editDuty, setEditDuty] = useState(null);
  const [editForm, setEditForm] = useState({ instructor: '', status: 'assigned', notes: '' });
  const [addDutyOpen, setAddDutyOpen] = useState(false);
  const [addDutyForm, setAddDutyForm] = useState(EMPTY_ADD_DUTY);
  const [isSavingDuty, setIsSavingDuty] = useState(false);

  const [report, setReport] = useState(EMPTY_REPORT);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingDuties, setIsLoadingDuties] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [actionFields, setActionFields] = useState({});

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const slotEntries = useMemo(
    () => datesheet?.datesheet || [],
    [datesheet]
  );

  const reportSlots = useMemo(() => {
    const ids = new Set(slotEntries.map((entry) => entry.slot_id));
    return slots.filter((slot) => ids.has(slot.id));
  }, [slotEntries, slots]);

  const entriesForSlot = useMemo(
    () => slotEntries.filter((entry) => entry.slot_id === report.slot_id),
    [report.slot_id, slotEntries]
  );

  const selectedEntry = entriesForSlot.find((entry) => entry.course_code === report.course_code);

  const eligibleStudents = useMemo(() => {
    if (!selectedEntry) return [];
    const sections = selectedEntry.sections || [selectedEntry.section];
    return students.filter((student) =>
      student.program === selectedEntry.program &&
      student.batch === selectedEntry.batch &&
      sections.includes(student.section) &&
      student.enrolments?.some((enrolment) => (
        enrolment.course === selectedEntry.course_code &&
        (enrolment.attendance_percent ?? 100) >= 75
      ))
    );
  }, [selectedEntry, students]);

  const selectedRoomType = selectedEntry?.is_lab ? 'lab' : 'hall';
  const reportRooms = useMemo(() => {
    return rooms.filter((room) => (room.room_type || 'hall') === selectedRoomType);
  }, [rooms, selectedRoomType]);

  const assignedInvigilators = useMemo(() => {
    const matched = duties
      .filter((duty) => duty.slot_id === report.slot_id && duty.room_id === report.room_id)
      .map((duty) => duty.instructor);

    if (matched.length > 0) return [...new Set(matched)];

    // Fallback: Invigilators in this slot across any room
    const slotInvigilators = duties
      .filter((duty) => duty.slot_id === report.slot_id)
      .map((duty) => duty.instructor);
    return [...new Set(slotInvigilators)];
  }, [duties, report.slot_id, report.room_id]);

  // Load the complete roster, health, coverage, and faculty workload.
  const loadRoster = useCallback(async () => {
    setIsLoadingDuties(true);
    try {
      const data = await examOpsService.getRoster();
      setRoster(data || null);
      setDuties(Array.isArray(data?.duties) ? data.duties : []);
    } catch (err) {
      showBanner?.(`Could not load duty roster: ${err.message}`, 'danger');
    } finally {
      setIsLoadingDuties(false);
    }
  }, [showBanner]);

  // Load UMC reports from API
  const loadReports = useCallback(async () => {
    setIsLoadingReports(true);
    try {
      const params = reportFilter ? { status: reportFilter } : {};
      const data = await examOpsService.getUMCReports(params);
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      showBanner?.(`Could not load UMC cases: ${err.message}`, 'danger');
    } finally {
      setIsLoadingReports(false);
    }
  }, [reportFilter, showBanner]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Auto-refresh reports periodically
  useEffect(() => {
    const timer = window.setInterval(() => {
      loadReports();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [loadReports]);

  const summarizeRecalculation = (result) => {
    const parts = [`${result.generated_count} new assignment(s)`];
    if (result.preserved_manual_count) {
      parts.push(`${result.preserved_manual_count} manual override(s) preserved`);
    }
    if (result.released_manual_count) {
      parts.push(`${result.released_manual_count} invalid override(s) released`);
    }
    return parts.join(', ');
  };

  const runRecalculation = async (slotId = '') => {
    setIsGenerating(true);
    try {
      const result = await examOpsService.recalculateDuties({
        slot_ids: slotId ? [slotId] : [],
        preserve_manual: preserveManual,
        release_invalid_manual: releaseInvalidManual,
      });
      await loadRoster();
      showBanner?.(`Roster recalculated: ${summarizeRecalculation(result)}.`, 'success');
    } catch (error) {
      showBanner?.(`Duty recalculation failed: ${error.message}`, 'danger');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecalculateAll = () => runRecalculation('');
  const handleRecalculateSlot = (slotId) => runRecalculation(slotId);

  const openEditDuty = (duty) => {
    setEditDuty(duty);
    setEditForm({
      instructor: duty.instructor,
      status: duty.status || 'assigned',
      notes: duty.notes || '',
    });
  };

  const saveDutyEdit = async () => {
    if (!editDuty) return;
    setIsSavingDuty(true);
    try {
      await examOpsService.updateDuty(editDuty.id, editForm);
      await loadRoster();
      setEditDuty(null);
      showBanner?.(`Duty updated for ${editForm.instructor}. It is now a manual override.`, 'success');
    } catch (error) {
      showBanner?.(`Could not update duty: ${error.message}`, 'danger');
    } finally {
      setIsSavingDuty(false);
    }
  };

  const openAddDuty = (slotId = '', roomId = '') => {
    const availableSlots = roster?.slots || [];
    const slot =
      availableSlots.find((item) => item.slot_id === slotId) ||
      availableSlots.find((item) => item.rooms.some((room) => room.missing > 0)) ||
      availableSlots[0];
    const room =
      slot?.rooms.find((item) => item.room_id === roomId && item.missing > 0) ||
      slot?.rooms.find((item) => item.missing > 0) ||
      null;
    setAddDutyForm({
      ...EMPTY_ADD_DUTY,
      slot_id: slot?.slot_id || '',
      room_id: room?.room_id || '',
    });
    setAddDutyOpen(true);
  };

  const saveAddDuty = async () => {
    if (!addDutyForm.slot_id || !addDutyForm.room_id || !addDutyForm.instructor) {
      showBanner?.('Select a slot, room, and instructor before adding a duty.', 'danger');
      return;
    }
    setIsSavingDuty(true);
    try {
      await examOpsService.createDuty(addDutyForm);
      await loadRoster();
      setAddDutyOpen(false);
      showBanner?.(`Manual duty added for ${addDutyForm.instructor}.`, 'success');
    } catch (error) {
      showBanner?.(`Could not add duty: ${error.message}`, 'danger');
    } finally {
      setIsSavingDuty(false);
    }
  };

  const removeDuty = async (duty) => {
    const confirmed = window.confirm(
      `Remove ${duty.instructor} from ${duty.room_name || duty.room_id}? ` +
      'The system will block removal if the room would become understaffed.'
    );
    if (!confirmed) return;
    try {
      await examOpsService.deleteDuty(duty.id);
      await loadRoster();
      showBanner?.(`Removed ${duty.instructor} from ${duty.room_name || duty.room_id}.`, 'success');
    } catch (error) {
      showBanner?.(`Could not remove duty: ${error.message}`, 'danger');
    }
  };


  // Signature canvas handlers
  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    setReport((current) => ({ ...current, signature_data: '' }));
  };

  const pointerPosition = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const handlePointerDown = (event) => {
    const canvas = canvasRef.current;
    canvas.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    const context = canvas.getContext('2d');
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#1e3a8a';
    context.beginPath();
    context.moveTo(point.x, point.y);
    drawingRef.current = true;
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current) return;
    const point = pointerPosition(event);
    const context = canvasRef.current.getContext('2d');
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (canvasRef.current) {
      setReport((current) => ({
        ...current,
        signature_data: canvasRef.current.toDataURL('image/png'),
      }));
    }
  };

  const handlePhotoSelection = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 10) {
      showBanner?.('Attach at most 10 evidence photos.', 'danger');
      event.target.value = '';
      return;
    }
    try {
      const images = await Promise.all(files.map(readFileAsDataUrl));
      setPhotos(images);
      setReport((current) => ({ ...current, evidence: images }));
    } catch (error) {
      showBanner?.(error.message, 'danger');
    }
  };

  const handleRemovePhoto = (indexToRemove) => {
    const updated = photos.filter((_, idx) => idx !== indexToRemove);
    setPhotos(updated);
    setReport((current) => ({ ...current, evidence: updated }));
  };

  const submitReport = async (event) => {
    event.preventDefault();
    if (!report.signature_data) {
      showBanner?.('Please provide the invigilator signature on the signature pad before submitting.', 'danger');
      return;
    }
    if (!report.evidence || report.evidence.length === 0) {
      showBanner?.('Please attach at least one photo of the physical evidence / answer script.', 'danger');
      return;
    }
    setSaving(true);
    try {
      await examOpsService.createUMCReport(report);
      setReport(EMPTY_REPORT);
      setPhotos([]);
      clearSignature();
      await loadReports();
      showBanner?.('UMC report submitted successfully to the ECR Discipline Desk.', 'success');
    } catch (error) {
      showBanner?.(`UMC submission failed: ${error.message}`, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const advanceReport = async (item, targetStatus, fields = {}) => {
    try {
      await examOpsService.updateUMCReport(item.id, { ...fields, status: targetStatus });
      await loadReports();
      showBanner?.(`UMC case #${item.id} transitioned to ${targetStatus.replaceAll('_', ' ')}.`, 'success');
    } catch (error) {
      showBanner?.(`UMC update failed: ${error.message}`, 'danger');
    }
  };

  const rosterSlots = useMemo(() => roster?.slots || [], [roster]);
  const rosterIssues = useMemo(() => roster?.issues || [], [roster]);
  const facultyWorkload = useMemo(() => roster?.faculty || [], [roster]);
  const rosterStats = roster?.stats || {};
  const datesheetPublished = (roster?.datesheet_status || datesheet?.status) === 'PUBLISHED';
  const extraDutyCap = roster?.extra_duty_cap || 4;
  const issueErrorCount =
    rosterStats.error_count ?? rosterIssues.filter((issue) => issue.severity === 'error').length;
  const issueWarningCount =
    rosterStats.warning_count ?? rosterIssues.filter((issue) => issue.severity === 'warning').length;
  const staffedRoomRatio = `${rosterStats.staffed_rooms ?? 0}/${rosterStats.required_rooms ?? 0}`;

  const dutySlotOptions = useMemo(() => {
    if (rosterSlots.length) {
      return rosterSlots.map((slot) => ({
        id: slot.slot_id,
        date: slot.date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        label: slot.label,
      }));
    }
    return slots;
  }, [rosterSlots, slots]);

  const formatSlotLabel = (slotId) => {
    const slot =
      slots.find((item) => item.id === slotId) ||
      rosterSlots.find((item) => item.slot_id === slotId);
    if (!slot) return slotId;
    return `${slot.date} (${slot.start_time} - ${slot.end_time})`;
  };

  const filteredDuties = useMemo(() => {
    const query = dutySearch.trim().toLowerCase();
    return duties.filter((d) => {
      const matchSearch =
        !query ||
        (d.instructor || '').toLowerCase().includes(query) ||
        (d.room_name || d.room_id || '').toLowerCase().includes(query) ||
        (d.notes || '').toLowerCase().includes(query);
      const matchSlot = !dutySlotFilter || d.slot_id === dutySlotFilter;
      const matchSource = !dutySourceFilter || (d.source || 'auto') === dutySourceFilter;
      const matchType = !dutyTypeFilter || d.duty_type === dutyTypeFilter;
      return matchSearch && matchSlot && matchSource && matchType;
    });
  }, [duties, dutySearch, dutySlotFilter, dutySourceFilter, dutyTypeFilter]);

  const coverageSlots = useMemo(() => {
    if (!dutySlotFilter) return rosterSlots;
    return rosterSlots.filter((slot) => slot.slot_id === dutySlotFilter);
  }, [rosterSlots, dutySlotFilter]);

  const filteredFaculty = useMemo(() => {
    const query = facultySearch.trim().toLowerCase();
    if (!query) return facultyWorkload;
    return facultyWorkload.filter((member) => (
      member.name.toLowerCase().includes(query) ||
      (member.courses || []).some((course) => course.toLowerCase().includes(query))
    ));
  }, [facultyWorkload, facultySearch]);

  const editRoomContext = useMemo(() => {
    if (!editDuty) return null;
    const slot = rosterSlots.find((item) => item.slot_id === editDuty.slot_id);
    return slot?.rooms.find((room) => room.room_id === editDuty.room_id) || null;
  }, [editDuty, rosterSlots]);

  const editCandidates = useMemo(() => {
    if (!editDuty) return [];
    const slotDuties = duties.filter(
      (duty) => duty.slot_id === editDuty.slot_id && duty.id !== editDuty.id
    );
    const usedInHall = new Set(
      slotDuties.filter((duty) => duty.room_type !== 'lab').map((duty) => duty.instructor)
    );
    const usedInSlot = new Set(slotDuties.map((duty) => duty.instructor));
    const current = facultyWorkload.find((member) => member.name === editDuty.instructor) || {
      name: editDuty.instructor,
      extra_duties: 0,
      own_subject_duties: 0,
      remaining_extra_capacity: extraDutyCap,
      is_ecr: false,
    };

    if (editRoomContext?.is_lab && editRoomContext.lab_teachers?.length) {
      return editRoomContext.lab_teachers
        .filter((name) => !usedInHall.has(name) || name === editDuty.instructor)
        .map((name) => facultyWorkload.find((member) => member.name === name) || {
          name,
          extra_duties: 0,
          own_subject_duties: 0,
          remaining_extra_capacity: extraDutyCap,
          is_ecr: false,
        });
    }
    return [
      ...facultyWorkload.filter(
        (member) => !member.is_ecr && !usedInSlot.has(member.name) && member.name !== editDuty.instructor
      ),
      current,
    ];
  }, [duties, editDuty, editRoomContext, facultyWorkload, extraDutyCap]);

  const addSlotContext = useMemo(
    () => rosterSlots.find((slot) => slot.slot_id === addDutyForm.slot_id) || null,
    [rosterSlots, addDutyForm.slot_id]
  );

  const addRoomContext = useMemo(
    () => addSlotContext?.rooms.find((room) => room.room_id === addDutyForm.room_id) || null,
    [addSlotContext, addDutyForm.room_id]
  );

  const addAvailableRooms = useMemo(
    () => (addSlotContext?.rooms || []).filter((room) => room.missing > 0),
    [addSlotContext]
  );

  const addCandidates = useMemo(() => {
    if (!addRoomContext) return [];
    const slotDuties = duties.filter((duty) => duty.slot_id === addDutyForm.slot_id);
    const usedInHall = new Set(
      slotDuties.filter((duty) => duty.room_type !== 'lab').map((duty) => duty.instructor)
    );
    const usedInSlot = new Set(slotDuties.map((duty) => duty.instructor));
    if (addRoomContext.is_lab && addRoomContext.lab_teachers?.length) {
      return addRoomContext.lab_teachers
        .filter((name) => !usedInHall.has(name))
        .map((name) => facultyWorkload.find((member) => member.name === name) || {
          name,
          extra_duties: 0,
          own_subject_duties: 0,
          remaining_extra_capacity: extraDutyCap,
          is_ecr: false,
        });
    }
    return facultyWorkload.filter(
      (member) => !member.is_ecr && !usedInSlot.has(member.name)
    );
  }, [addDutyForm.slot_id, addRoomContext, duties, facultyWorkload, extraDutyCap]);

  // Statistics
  const ownSubjectCount = useMemo(
    () => duties.filter((d) => d.duty_type === 'own_subject').length,
    [duties]
  );
  const extraDutiesCount = useMemo(
    () => duties.filter((d) => d.duty_type === 'extra').length,
    [duties]
  );
  const pendingUmcCount = useMemo(
    () => reports.filter((r) => r.status !== 'approved').length,
    [reports]
  );

  return (
    <div className="itms-dash__main">
      <div className="itms-dash__pageHeader">
        <div>
          <h1 className="itms-dash__pageTitle">Exam Operations &amp; Administration</h1>
          <p className="itms-dash__pageSub">
            Hall invigilation assignments, committee exemptions, and the ECR Unfair Means Case (UMC) workflow.
          </p>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="ops-stat-grid">
        <article className="ops-stat-card ops-stat-card--total">
          <div className="ops-stat-card__head">
            <span className="ops-stat-card__label">Total Duties Assigned</span>
            <div className="ops-stat-card__icon-badge">
              <Users size={17} />
            </div>
          </div>
          <div className="ops-stat-card__value">
            {rosterStats.total_duties ?? duties.length}
          </div>
          <div className="ops-stat-card__footer">
            {staffedRoomRatio.replace('/', ' of ')} rooms staffed &bull;{' '}
            {rosterSlots.length || slots.length} session slots
          </div>
        </article>

        <article className="ops-stat-card ops-stat-card--own">
          <div className="ops-stat-card__head">
            <span className="ops-stat-card__label">Own Subject Duties</span>
            <div className="ops-stat-card__icon-badge">
              <ShieldCheck size={17} />
            </div>
          </div>
          <div className="ops-stat-card__value">
            {rosterStats.own_subject_count ?? ownSubjectCount}
          </div>
          <div className="ops-stat-card__footer">
            Exempt from {extraDutyCap}-duty quota cap
          </div>
        </article>

        <article className="ops-stat-card ops-stat-card--extra">
          <div className="ops-stat-card__head">
            <span className="ops-stat-card__label">Extra Duties</span>
            <div className="ops-stat-card__icon-badge">
              <Clock size={17} />
            </div>
          </div>
          <div className="ops-stat-card__value">
            {rosterStats.extra_count ?? extraDutiesCount}
          </div>
          <div className="ops-stat-card__footer">
            {rosterStats.manual_count ?? 0} manual {(rosterStats.manual_count ?? 0) === 1 ? 'override' : 'overrides'} &bull; Max cap: {extraDutyCap}
          </div>
        </article>

        <article className="ops-stat-card ops-stat-card--umc">
          <div className="ops-stat-card__head">
            <span className="ops-stat-card__label">UMC Discipline Cases</span>
            <div className="ops-stat-card__icon-badge">
              <AlertTriangle size={17} />
            </div>
          </div>
          <div className="ops-stat-card__value">{reports.length}</div>
          <div className="ops-stat-card__footer">
            {pendingUmcCount} {pendingUmcCount === 1 ? 'case' : 'cases'} requiring review
          </div>
        </article>
      </div>

      {/* Tabs Toolbar */}
      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        <div className="toolbar__actions">
          <button
            type="button"
            className={`btn ${activeTab === 'duties' ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setActiveTab('duties')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <Users size={15} />
            Invigilation Roster ({duties.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'umc' ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setActiveTab('umc')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <AlertTriangle size={15} />
            UMC Incident Reports ({reports.length})
          </button>
        </div>

        {activeTab === 'duties' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--itms-text-muted)',
              }}
              title="Manual overrides remain locked during recalculation."
            >
              <input
                type="checkbox"
                checked={preserveManual}
                onChange={(event) => setPreserveManual(event.target.checked)}
              />
              Preserve manual
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--itms-text-muted)',
              }}
              title="Release manual overrides that conflict with the current datesheet."
            >
              <input
                type="checkbox"
                checked={releaseInvalidManual}
                onChange={(event) => setReleaseInvalidManual(event.target.checked)}
              />
              Release Manual
            </label>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => openAddDuty()}
              disabled={!rosterSlots.length || !datesheetPublished}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Plus size={14} />
              Add Manual Duty
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleRecalculateAll}
              disabled={isGenerating || !datesheetPublished}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <RotateCcw size={14} className={isGenerating ? 'spin' : ''} />
              {isGenerating
                ? 'Recalculating...'
                : duties.length
                  ? 'Recalculate All'
                  : 'Generate Duty Roster'}
            </button>
          </div>
        )}
      </div>

      {/* Tab 1: Invigilation Duties Roster */}
      {activeTab === 'duties' && (
        <>
          {/* Roster health */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <HealthCard
              label="Rooms Staffed"
              value={staffedRoomRatio}
              help="Every required room fully covered"
              tone={rosterStats.understaffed_rooms ? 'warning' : 'success'}
              icon={<CheckCircle2 size={16} color="#15803d" />}
            />
            <HealthCard
              label="Understaffed"
              value={rosterStats.understaffed_rooms ?? 0}
              help="Rooms missing invigilators"
              tone={rosterStats.understaffed_rooms ? 'danger' : 'success'}
              icon={<AlertCircle size={16} color={rosterStats.understaffed_rooms ? '#b91c1c' : '#15803d'} />}
            />
            <HealthCard
              label="Overstaffed"
              value={rosterStats.overstaffed_rooms ?? 0}
              help="Rooms above policy ratio"
              tone={rosterStats.overstaffed_rooms ? 'warning' : 'success'}
              icon={<XCircle size={16} color={rosterStats.overstaffed_rooms ? '#b45309' : '#15803d'} />}
            />
            <HealthCard
              label="Validation Errors"
              value={issueErrorCount}
              help={`${issueWarningCount} warning(s)`}
              tone={issueErrorCount ? 'danger' : 'success'}
              icon={<ShieldCheck size={16} color={issueErrorCount ? '#b91c1c' : '#15803d'} />}
            />
            <HealthCard
              label="Manual Overrides"
              value={rosterStats.manual_count ?? 0}
              help="Preserved unless released"
              tone={rosterStats.manual_count ? 'info' : 'default'}
              icon={<Lock size={16} color="#1d4ed8" />}
            />
            <HealthCard
              label="ECR Exempt"
              value={rosterStats.ecr_exempt_count ?? 0}
              help="Operational staff excluded from halls"
              tone="info"
              icon={<UserCheck size={16} color="#1d4ed8" />}
            />
          </div>

          {!datesheetPublished && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                fontSize: '0.84rem',
                fontWeight: 600,
              }}
            >
              <AlertTriangle size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Publish a valid datesheet before generating or editing invigilation duties.
            </div>
          )}

          {/* Roster sub-tabs */}
          <div className="toolbar" style={{ marginBottom: '1rem' }}>
            <div className="toolbar__actions">
              {[
                ['assignments', 'Assignments', ListChecks],
                ['coverage', 'Slot Coverage', Gauge],
                ['workload', 'Faculty Workload', BookOpen],
                ['issues', `Validation Issues (${rosterIssues.length})`, AlertTriangle],
              ].map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn btn--sm ${rosterView === key ? 'btn--primary' : 'btn--outline'}`}
                  onClick={() => setRosterView(key)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            {rosterView === 'assignments' && (
              <button
                type="button"
                className="btn btn--sm btn--outline"
                onClick={() => openAddDuty()}
                disabled={!rosterSlots.length || !datesheetPublished}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Plus size={14} />
                Add Manual Duty
              </button>
            )}
          </div>

          {rosterView === 'assignments' && (
            <>
              <div
                className="toolbar"
                style={{
                  background: '#f8fafc',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Search size={15} color="var(--itms-text-muted)" />
                    <input
                      type="text"
                      className="form-control"
                      style={{ width: '220px', padding: '6px 10px', fontSize: '0.84rem' }}
                      placeholder="Search instructor, room, notes..."
                      value={dutySearch}
                      onChange={(e) => setDutySearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="form-control"
                    style={{ width: 'auto', fontSize: '0.84rem', padding: '6px 10px' }}
                    value={dutySlotFilter}
                    onChange={(e) => setDutySlotFilter(e.target.value)}
                  >
                    <option value="">All Examination Slots</option>
                    {dutySlotOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.date} ({s.start_time} - {s.end_time}) {s.label ? `· ${s.label}` : ''}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-control"
                    style={{ width: 'auto', fontSize: '0.84rem', padding: '6px 10px' }}
                    value={dutySourceFilter}
                    onChange={(e) => setDutySourceFilter(e.target.value)}
                  >
                    <option value="">All Sources</option>
                    <option value="auto">Auto-generated</option>
                    <option value="manual">Manual override</option>
                  </select>
                  <select
                    className="form-control"
                    style={{ width: 'auto', fontSize: '0.84rem', padding: '6px 10px' }}
                    value={dutyTypeFilter}
                    onChange={(e) => setDutyTypeFilter(e.target.value)}
                  >
                    <option value="">All Duty Types</option>
                    <option value="extra">Extra duty (counted)</option>
                    <option value="own_subject">Own subject (exempt)</option>
                  </select>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
                  Showing {filteredDuties.length} of {duties.length} assignments
                </span>
              </div>

              <div className="card-table-wrapper">
                <table className="data-table data-table--wide data-table--sticky-actions">
                  <thead>
                    <tr>
                      <th style={{ width: '180px' }}>Exam Session Slot</th>
                      <th style={{ width: '170px' }}>Room / Lab</th>
                      <th style={{ minWidth: '180px' }}>Invigilator Name</th>
                      <th style={{ width: '150px' }}>Duty Category</th>
                      <th style={{ width: '120px' }}>Source</th>
                      <th style={{ width: '110px' }}>Status</th>
                      <th style={{ width: '170px', minWidth: '170px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingDuties && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--itms-text-muted)' }}>
                          Loading roster...
                        </td>
                      </tr>
                    )}
                    {!isLoadingDuties && filteredDuties.map((duty) => {
                      const isOwn = duty.duty_type === 'own_subject';
                      const isManual = duty.source === 'manual';
                      return (
                        <tr key={duty.id}>
                          <td style={{ fontWeight: 600, minWidth: 180 }}>
                            {formatSlotLabel(duty.slot_id)}
                            <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)', fontWeight: 400 }}>
                              {duty.slot_is_morning ? 'Morning session' : 'Afternoon session'}
                            </div>
                          </td>
                          <td>
                            <span
                              style={{
                                background: '#f1f5f9',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontWeight: 600,
                                fontSize: '0.82rem',
                              }}
                            >
                              {duty.room_name || duty.room_id}
                            </span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)', marginTop: 3 }}>
                              Requires {duty.required_invigilators} invigilator(s)
                              {duty.room_type === 'lab' ? ' · Lab' : ' · Hall'}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--iiui-navy)' }}>
                              {duty.instructor}
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                              {duty.is_ecr_exempt && <StatusPill tone="info">ECR</StatusPill>}
                              {duty.is_senior && <StatusPill tone="warning">Senior</StatusPill>}
                              {duty.notes && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)' }}>
                                  {duty.notes}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <StatusPill tone={isOwn ? 'success' : 'info'}>
                              {isOwn ? 'Own Subject (Exempt)' : 'Extra Duty'}
                            </StatusPill>
                          </td>
                          <td>
                            <StatusPill tone={isManual ? 'warning' : 'default'}>
                              {isManual ? 'Manual override' : 'Auto'}
                            </StatusPill>
                          </td>
                          <td>
                            <StatusPill tone={dutyStatusTone(duty.status)}>
                              {duty.status}
                            </StatusPill>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn btn--sm btn--outline"
                                onClick={() => openEditDuty(duty)}
                                title="Edit or replace this invigilator"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                              >
                                <Pencil size={12} />
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn--sm btn--outline"
                                onClick={() => removeDuty(duty)}
                                title="Remove this assignment"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b91c1c', borderColor: '#fca5a5', whiteSpace: 'nowrap' }}
                              >
                                <Trash2 size={12} />
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!isLoadingDuties && !filteredDuties.length && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--itms-text-muted)' }}>
                          {duties.length === 0 ? (
                            <div>
                              <p style={{ margin: '0 0 0.8rem' }}>No invigilation duty roster has been generated yet.</p>
                              <button
                                type="button"
                                className="btn btn--primary"
                                onClick={handleRecalculateAll}
                                disabled={isGenerating || !datesheetPublished}
                              >
                                <RefreshCw size={14} className={isGenerating ? 'spin' : ''} />
                                Generate Duty Roster Now
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

          {rosterView === 'coverage' && (
            <>
              <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Gauge size={16} color="var(--iiui-navy)" />
                  <strong style={{ color: 'var(--iiui-navy)' }}>Room-by-room staffing coverage</strong>
                </div>
                <select
                  className="form-control"
                  style={{ width: 'auto', fontSize: '0.84rem', padding: '6px 10px' }}
                  value={dutySlotFilter}
                  onChange={(e) => setDutySlotFilter(e.target.value)}
                >
                  <option value="">All Examination Slots</option>
                  {dutySlotOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.date} ({s.start_time} - {s.end_time})
                    </option>
                  ))}
                </select>
              </div>
              {!coverageSlots.length && (
                <div className="card-table-wrapper" style={{ padding: '2rem', textAlign: 'center', color: 'var(--itms-text-muted)' }}>
                  No datesheet slots are available for coverage review.
                </div>
              )}
              {coverageSlots.map((slot) => (
                <div key={slot.slot_id} className="card-table-wrapper" style={{ marginBottom: '1rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      padding: '0.9rem 1rem',
                      borderBottom: '1px solid #e2e8f0',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--iiui-navy)' }}>
                        {slot.date} ({slot.start_time} - {slot.end_time})
                      </strong>
                      <span style={{ marginLeft: 8 }}>
                        <StatusPill tone={slot.is_morning ? 'warning' : 'info'}>
                          {slot.is_morning ? 'Morning' : 'Afternoon'}
                        </StatusPill>
                      </span>
                      {slot.error && (
                        <div style={{ color: '#b91c1c', fontSize: '0.78rem', marginTop: 4 }}>
                          {slot.error}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => handleRecalculateSlot(slot.slot_id)}
                      disabled={isGenerating || !datesheetPublished}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
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
                        <th>Coverage</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slot.rooms.map((room) => {
                        const under = room.missing > 0;
                        const over = room.overstaffed > 0;
                        return (
                          <tr key={`${slot.slot_id}-${room.room_id}`}>
                            <td style={{ fontWeight: 600 }}>{room.room_name}</td>
                            <td>{room.is_lab ? 'Lab' : 'Hall'}</td>
                            <td>{room.required}</td>
                            <td>{room.assigned}</td>
                            <td>
                              <StatusPill tone={under ? 'danger' : over ? 'warning' : 'success'}>
                                {under
                                  ? `Understaffed (${room.missing} missing)`
                                  : over
                                    ? `Overstaffed (+${room.overstaffed})`
                                    : 'Staffed'}
                              </StatusPill>
                            </td>
                            <td>
                              {under ? (
                                <button
                                  type="button"
                                  className="btn btn--sm btn--outline"
                                  onClick={() => openAddDuty(slot.slot_id, room.room_id)}
                                  disabled={!datesheetPublished}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                >
                                  <Plus size={12} />
                                  Add
                                </button>
                              ) : (
                                <span style={{ color: 'var(--itms-text-muted)', fontSize: '0.78rem' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!slot.rooms.length && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--itms-text-muted)' }}>
                            No active rooms for this slot.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}

          {rosterView === 'workload' && (
            <>
              <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BookOpen size={16} color="var(--iiui-navy)" />
                  <strong style={{ color: 'var(--iiui-navy)' }}>Faculty workload &amp; quota health</strong>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Search size={15} color="var(--itms-text-muted)" />
                  <input
                    type="text"
                    className="form-control"
                    style={{ width: '240px', padding: '6px 10px', fontSize: '0.84rem' }}
                    placeholder="Search faculty or course..."
                    value={facultySearch}
                    onChange={(e) => setFacultySearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="card-table-wrapper">
                <table className="data-table data-table--wide data-table--sticky-actions">
                  <thead>
                    <tr>
                      <th>Faculty Member</th>
                      <th>Courses</th>
                      <th>Extra Duties</th>
                      <th>Own Subject</th>
                      <th>Total</th>
                      <th>Remaining Capacity</th>
                      <th>Exemptions / Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFaculty.map((member) => (
                      <tr key={member.name}>
                        <td style={{ fontWeight: 600, color: 'var(--iiui-navy)' }}>{member.name}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)', maxWidth: 260 }}>
                          {member.courses?.length ? member.courses.join(', ') : '—'}
                        </td>
                        <td style={{ fontWeight: 700 }}>{member.extra_duties}</td>
                        <td>{member.own_subject_duties}</td>
                        <td>{member.total_duties}</td>
                        <td>
                          <StatusPill
                            tone={
                              member.is_ecr
                                ? 'info'
                                : member.remaining_extra_capacity === 0
                                  ? 'danger'
                                  : member.remaining_extra_capacity <= 1
                                    ? 'warning'
                                    : 'success'
                            }
                          >
                            {member.is_ecr
                              ? 'ECR exempt'
                              : `${member.remaining_extra_capacity} of ${extraDutyCap} left`}
                          </StatusPill>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {member.is_ecr && <StatusPill tone="info">ECR operational</StatusPill>}
                            {member.is_senior && <StatusPill tone="warning">Senior priority</StatusPill>}
                            {!member.is_ecr && member.extra_duties >= extraDutyCap && (
                              <StatusPill tone="danger">Cap reached</StatusPill>
                            )}
                            {!member.is_ecr && member.extra_duties < extraDutyCap && (
                              <StatusPill tone="success">Eligible</StatusPill>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredFaculty.length && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--itms-text-muted)' }}>
                          No faculty members matched your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {rosterView === 'issues' && (
            <>
              <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={16} color="var(--iiui-navy)" />
                  <strong style={{ color: 'var(--iiui-navy)' }}>Roster validation &amp; policy issues</strong>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <StatusPill tone={issueErrorCount ? 'danger' : 'success'}>
                    {issueErrorCount} error(s)
                  </StatusPill>
                  <StatusPill tone={issueWarningCount ? 'warning' : 'success'}>
                    {issueWarningCount} warning(s)
                  </StatusPill>
                </div>
              </div>
              {!rosterIssues.length ? (
                <div
                  className="card-table-wrapper"
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#15803d',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                  }}
                >
                  <CheckCircle2 size={28} style={{ marginBottom: 6 }} />
                  <div style={{ fontWeight: 700 }}>Roster passes every hard rule.</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--itms-text-muted)', marginTop: 4 }}>
                    No understaffed rooms, cap breaches, ECR hall assignments, or lab coverage conflicts.
                  </div>
                </div>
              ) : (
                <div className="card-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Code</th>
                        <th>Issue</th>
                        <th>Slot</th>
                        <th>Room</th>
                        <th>Instructor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterIssues.map((issue, index) => (
                        <tr key={`${issue.code}-${issue.slot_id}-${issue.room_id}-${index}`}>
                          <td>
                            <StatusPill tone={issue.severity === 'error' ? 'danger' : 'warning'}>
                              {issue.severity}
                            </StatusPill>
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>{issue.code}</td>
                          <td style={{ fontSize: '0.84rem' }}>{issue.message}</td>
                          <td style={{ fontSize: '0.78rem' }}>{issue.slot_id || '—'}</td>
                          <td style={{ fontSize: '0.78rem' }}>{issue.room_id || '—'}</td>
                          <td style={{ fontSize: '0.78rem' }}>{issue.instructor || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Tab 2: UMC Discipline Reports & Incident Queue */}
      {activeTab === 'umc' && (
        <>
          {/* Incident Submission Form Card */}
          <section className="card-table-wrapper" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <AlertTriangle size={18} color="#dc2626" />
              <h2 style={{ margin: 0, color: 'var(--iiui-navy)', fontSize: '1.05rem', fontWeight: 700 }}>
                File Unfair Means Case (UMC) Incident
              </h2>
            </div>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--itms-text-muted)', fontSize: '0.84rem' }}>
              Report a seated examinee violating examination rules. Touch-based invigilator signature and physical evidence photos are required for ECR desk auditing.
            </p>

            <form onSubmit={submitReport}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                <label className="form-label">
                  Exam Slot <span style={{ color: '#ef4444' }}>*</span>
                  <select
                    className="form-control"
                    value={report.slot_id}
                    required
                    onChange={(event) =>
                      setReport({ ...EMPTY_REPORT, slot_id: event.target.value })
                    }
                  >
                    <option value="">Select Examination Slot</option>
                    {reportSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.date} ({slot.start_time} - {slot.end_time}) {slot.label ? `· ${slot.label}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-label">
                  Course Paper <span style={{ color: '#ef4444' }}>*</span>
                  <select
                    className="form-control"
                    value={report.course_code}
                    required
                    disabled={!report.slot_id}
                    onChange={(event) =>
                      setReport((current) => ({
                        ...current,
                        course_code: event.target.value,
                        room_id: '',
                        roll_no: '',
                      }))
                    }
                  >
                    <option value="">Select Scheduled Course</option>
                    {entriesForSlot.map((entry) => (
                      <option
                        key={entry.unit_id || `${entry.course_code}-${entry.section}`}
                        value={entry.course_code}
                      >
                        {entry.course_code} · {entry.course_title || entry.batches}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-label">
                  Student Examinee <span style={{ color: '#ef4444' }}>*</span>
                  <select
                    className="form-control"
                    value={report.roll_no}
                    required
                    disabled={!report.course_code}
                    onChange={(event) =>
                      setReport((current) => ({ ...current, roll_no: event.target.value }))
                    }
                  >
                    <option value="">Select Seated Student</option>
                    {eligibleStudents.map((student) => (
                      <option key={student.roll_no} value={student.roll_no}>
                        {student.roll_no} — {student.name} ({student.program} {student.batch})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-label">
                  Hall / Lab <span style={{ color: '#ef4444' }}>*</span>
                  <select
                    className="form-control"
                    value={report.room_id}
                    required
                    disabled={!report.course_code}
                    onChange={(event) =>
                      setReport((current) => ({
                        ...current,
                        room_id: event.target.value,
                        invigilator: '',
                      }))
                    }
                  >
                    <option value="">Select Room</option>
                    {reportRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name} ({room.room_type === 'lab' ? 'Computer Lab' : 'Hall'})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-label">
                  Reporting Invigilator <span style={{ color: '#ef4444' }}>*</span>
                  <select
                    className="form-control"
                    value={report.invigilator}
                    required
                    disabled={!report.room_id}
                    onChange={(event) =>
                      setReport((current) => ({ ...current, invigilator: event.target.value }))
                    }
                  >
                    <option value="">Select Reporting Invigilator</option>
                    {assignedInvigilators.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-label">
                  Evidence Photos <span style={{ color: '#ef4444' }}>*</span>
                  <input
                    className="form-control"
                    type="file"
                    accept="image/*"
                    multiple
                    required={photos.length === 0}
                    onChange={handlePhotoSelection}
                  />
                </label>
              </div>

              {photos.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0.75rem 0' }}>
                  {photos.map((src, index) => (
                    <div key={index} style={{ position: 'relative' }}>
                      <img
                        src={src}
                        alt={`Evidence ${index + 1}`}
                        style={{
                          width: 100,
                          height: 75,
                          objectFit: 'cover',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(index)}
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: 20,
                          height: 20,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                        }}
                        title="Remove photo"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label className="form-label" style={{ display: 'block', marginTop: '0.85rem' }}>
                Incident Details &amp; Material Found <span style={{ color: '#ef4444' }}>*</span>
                <textarea
                  className="form-control"
                  rows={3}
                  minLength={5}
                  maxLength={4000}
                  required
                  placeholder="Detail the circumstances, material recovered (cell phone, chits, copying), and seat location..."
                  value={report.details}
                  onChange={(event) => setReport((current) => ({ ...current, details: event.target.value }))}
                />
              </label>

              {/* Touch & Mouse Signature Pad */}
              <div style={{ marginTop: '0.85rem' }}>
                <div className="form-label" style={{ fontWeight: 600, marginBottom: '4px' }}>
                  Invigilator Digital Signature <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <div style={{ display: 'inline-block', position: 'relative' }}>
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={130}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    style={{
                      width: 'min(100%, 600px)',
                      height: 130,
                      border: '1.5px dashed var(--itms-border-strong)',
                      borderRadius: 6,
                      touchAction: 'none',
                      background: '#ffffff',
                      cursor: 'crosshair',
                    }}
                  />
                  {!report.signature_data && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: '#94a3b8',
                        pointerEvents: 'none',
                        fontSize: '0.85rem',
                      }}
                    >
                      Sign here using mouse or touch
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn--sm btn--outline"
                    onClick={clearSignature}
                    style={{ fontSize: '0.78rem' }}
                  >
                    Clear Signature
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '1.25rem' }}>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={saving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <AlertTriangle size={15} />
                  {saving ? 'Submitting UMC Report...' : 'Submit Official UMC Report'}
                </button>
              </div>
            </form>
          </section>

          {/* ECR Case Queue Section */}
          <div className="toolbar" style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <strong style={{ color: 'var(--iiui-navy)', fontSize: '0.98rem' }}>
                ECR Disciplinary Case Queue
              </strong>
              <span
                style={{
                  background: '#f1f5f9',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                }}
              >
                {reports.length} Total Cases
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--itms-text-muted)', fontWeight: 600 }}>Filter:</span>
              <select
                className="form-control"
                style={{ maxWidth: 220, fontSize: '0.84rem' }}
                value={reportFilter}
                onChange={(event) => setReportFilter(event.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="reported">Reported (Pending Statements)</option>
                <option value="statement_recorded">Statement Recorded</option>
                <option value="instructor_reviewed">Instructor Reviewed</option>
                <option value="approved">Approved &amp; Finalized</option>
              </select>
            </div>
          </div>

          <div className="card-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case #</th>
                  <th>Examinee Details</th>
                  <th>Exam Session / Paper</th>
                  <th>Incident Details</th>
                  <th>Workflow Status</th>
                  <th>Action / Workflow Steps</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((item) => {
                  const statusColors = {
                    reported: { bg: '#fee2e2', text: '#b91c1c' },
                    statement_recorded: { bg: '#fef3c7', text: '#92400e' },
                    instructor_reviewed: { bg: '#e0f2fe', text: '#0369a1' },
                    approved: { bg: '#dcfce7', text: '#15803d' },
                  };
                  const color = statusColors[item.status] || { bg: '#f1f5f9', text: '#475569' };

                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 700 }}>
                        #{item.id}
                        <br />
                        <small style={{ color: 'var(--itms-text-muted)', fontWeight: 400 }}>
                          {new Date(item.created_at).toLocaleDateString()}
                        </small>
                      </td>
                      <td>
                        <strong>{item.roll_no}</strong>
                        <br />
                        <span style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>
                          Room: {item.room_id}
                        </span>
                      </td>
                      <td>
                        <strong>{item.course_code}</strong>
                        <br />
                        <span style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>
                          {formatSlotLabel(item.slot_id)}
                        </span>
                      </td>
                      <td style={{ maxWidth: 260, fontSize: '0.82rem', lineHeight: 1.35 }}>
                        {item.details}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: color.bg,
                            color: color.text,
                          }}
                        >
                          {item.status.replaceAll('_', ' ')}
                        </span>
                      </td>
                      <td style={{ minWidth: 230 }}>
                        {item.status === 'reported' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <textarea
                              className="form-control"
                              rows={2}
                              style={{ fontSize: '0.78rem' }}
                              placeholder="Record student statement..."
                              value={actionFields[item.id]?.student_statement || ''}
                              onChange={(e) =>
                                setActionFields((curr) => ({
                                  ...curr,
                                  [item.id]: { ...curr[item.id], student_statement: e.target.value },
                                }))
                              }
                            />
                            <textarea
                              className="form-control"
                              rows={2}
                              style={{ fontSize: '0.78rem' }}
                              placeholder="Record invigilator remarks..."
                              value={actionFields[item.id]?.invigilator_remarks || ''}
                              onChange={(e) =>
                                setActionFields((curr) => ({
                                  ...curr,
                                  [item.id]: { ...curr[item.id], invigilator_remarks: e.target.value },
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn btn--sm btn--primary"
                              onClick={() => advanceReport(item, 'statement_recorded', actionFields[item.id] || {})}
                            >
                              Record Statements
                            </button>
                          </div>
                        )}

                        {item.status === 'statement_recorded' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <textarea
                              className="form-control"
                              rows={2}
                              style={{ fontSize: '0.78rem' }}
                              placeholder="Instructor review comments..."
                              value={actionFields[item.id]?.instructor_comments || ''}
                              onChange={(e) =>
                                setActionFields((curr) => ({
                                  ...curr,
                                  [item.id]: { ...curr[item.id], instructor_comments: e.target.value },
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn btn--sm btn--primary"
                              onClick={() => advanceReport(item, 'instructor_reviewed', actionFields[item.id] || {})}
                            >
                              Submit Instructor Review
                            </button>
                          </div>
                        )}

                        {item.status === 'instructor_reviewed' && (
                          <button
                            type="button"
                            className="btn btn--sm btn--primary"
                            onClick={() => advanceReport(item, 'approved')}
                            style={{ background: '#16a34a', borderColor: '#15803d' }}
                          >
                            ✓ Approve &amp; Finalize Case
                          </button>
                        )}

                        {item.status === 'approved' && (
                          <a
                            className="btn btn--sm btn--outline"
                            href={`/api/umc/${item.id}/pdf`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            <Download size={13} />
                            Download UMC PDF Dossier
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!reports.length && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--itms-text-muted)' }}>
                      No UMC disciplinary cases found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit Invigilation Duty Modal */}
      <Modal
        isOpen={Boolean(editDuty)}
        title="Edit Invigilation Duty"
        onClose={() => setEditDuty(null)}
        footer={(
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
              onClick={saveDutyEdit}
              disabled={isSavingDuty || !editForm.instructor}
            >
              {isSavingDuty ? 'Saving...' : 'Save Manual Override'}
            </button>
          </>
        )}
      >
        {editDuty && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '0.75rem 0.9rem',
                fontSize: '0.84rem',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--iiui-navy)' }}>{formatSlotLabel(editDuty.slot_id)}</strong>
              <div>
                {editDuty.room_name || editDuty.room_id}
                {' · '}
                {editDuty.room_type === 'lab' ? 'Computer Lab' : 'Hall'}
                {' · requires '}
                {editDuty.required_invigilators} invigilator(s)
              </div>
              <div style={{ color: 'var(--itms-text-muted)' }}>
                Current: {editDuty.instructor}
                {editDuty.duty_type === 'own_subject' ? ' (own subject, exempt)' : ' (extra duty, counted)'}
              </div>
            </div>

            <label className="form-label">
              Invigilator
              <select
                className="form-control"
                value={editForm.instructor}
                onChange={(event) => setEditForm((current) => ({ ...current, instructor: event.target.value }))}
              >
                <option value="">Select faculty member</option>
                {editCandidates.map((member) => (
                  <option key={member.name} value={member.name}>
                    {member.name}
                    {member.is_ecr
                      ? ' · ECR exempt'
                      : ` · ${member.extra_duties}/${extraDutyCap} extra duties`}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Duty Status
              <select
                className="form-control"
                value={editForm.status}
                onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
              >
                {DUTY_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Notes
              <textarea
                className="form-control"
                rows={3}
                maxLength={2000}
                placeholder="Reason for manual override, replacement context, etc."
                value={editForm.notes}
                onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--itms-text-muted)', lineHeight: 1.5 }}>
              Saving marks this duty as a manual override. Recalculation preserves it by default, while
              room ratios, ECR exemptions, lab instructor requirements, same-slot clashes, and the
              {` ${extraDutyCap}-duty cap `}are still enforced.
            </p>
          </div>
        )}
      </Modal>

      {/* Add Manual Duty Modal */}
      <Modal
        isOpen={addDutyOpen}
        title="Add Manual Invigilation Duty"
        onClose={() => setAddDutyOpen(false)}
        footer={(
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
              onClick={saveAddDuty}
              disabled={isSavingDuty || !addDutyForm.slot_id || !addDutyForm.room_id || !addDutyForm.instructor}
            >
              {isSavingDuty ? 'Adding...' : 'Add Manual Duty'}
            </button>
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <label className="form-label">
            Exam Slot
            <select
              className="form-control"
              value={addDutyForm.slot_id}
              onChange={(event) => {
                const slotId = event.target.value;
                const slot = rosterSlots.find((item) => item.slot_id === slotId);
                const room = slot?.rooms.find((item) => item.missing > 0);
                setAddDutyForm({
                  ...EMPTY_ADD_DUTY,
                  slot_id: slotId,
                  room_id: room?.room_id || '',
                });
              }}
            >
              <option value="">Select examination slot</option>
              {rosterSlots.map((slot) => {
                const missing = slot.rooms.reduce((total, room) => total + room.missing, 0);
                return (
                  <option key={slot.slot_id} value={slot.slot_id}>
                    {slot.date} ({slot.start_time} - {slot.end_time}) · {missing} missing
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
              onChange={(event) => setAddDutyForm((current) => ({
                ...current,
                room_id: event.target.value,
                instructor: '',
              }))}
            >
              <option value="">Select room needing an invigilator</option>
              {addAvailableRooms.map((room) => (
                <option key={room.room_id} value={room.room_id}>
                  {room.room_name} · {room.is_lab ? 'Lab' : 'Hall'} · {room.missing} missing
                </option>
              ))}
            </select>
          </label>

          {addDutyForm.slot_id && !addAvailableRooms.length && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                padding: '0.65rem 0.8rem',
                fontSize: '0.8rem',
                color: '#15803d',
              }}
            >
              Every active room in this slot is fully staffed. Choose another slot or edit an existing assignment.
            </div>
          )}

          <label className="form-label">
            Invigilator
            <select
              className="form-control"
              value={addDutyForm.instructor}
              disabled={!addDutyForm.room_id}
              onChange={(event) => setAddDutyForm((current) => ({ ...current, instructor: event.target.value }))}
            >
              <option value="">Select faculty member</option>
              {addCandidates.map((member) => (
                <option key={member.name} value={member.name}>
                  {member.name}
                  {member.is_ecr
                    ? ' · ECR exempt'
                    : ` · ${member.extra_duties}/${extraDutyCap} extra duties`}
                </option>
              ))}
            </select>
          </label>

          {addRoomContext?.is_lab && addRoomContext.lab_teachers?.length > 0 && (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>
              Lab rule: this room must be covered by its course instructor
              {` (${addRoomContext.lab_teachers.join(', ')})`}.
            </p>
          )}

          <label className="form-label">
            Duty Status
            <select
              className="form-control"
              value={addDutyForm.status}
              onChange={(event) => setAddDutyForm((current) => ({ ...current, status: event.target.value }))}
            >
              {DUTY_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>

          <label className="form-label">
            Notes
            <textarea
              className="form-control"
              rows={3}
              maxLength={2000}
              placeholder="Reason for manual addition..."
              value={addDutyForm.notes}
              onChange={(event) => setAddDutyForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>

          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--itms-text-muted)', lineHeight: 1.5 }}>
            The backend validates the room ratio, ECR exemption, lab instructor requirement,
            same-slot clash, and {extraDutyCap}-duty cap before saving. Invalid additions are rejected.
          </p>
        </div>
      </Modal>
    </div>
  );
}
