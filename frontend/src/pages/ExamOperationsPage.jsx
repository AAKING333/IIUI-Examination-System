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
} from 'lucide-react';
import { examOpsService } from '../services/index.js';

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
  const [duties, setDuties] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportFilter, setReportFilter] = useState('');
  const [dutySearch, setDutySearch] = useState('');
  const [dutySlotFilter, setDutySlotFilter] = useState('');

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

  // Load duties from API
  const loadDuties = useCallback(async () => {
    setIsLoadingDuties(true);
    try {
      const data = await examOpsService.getDuties();
      setDuties(Array.isArray(data) ? data : []);
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
    loadDuties();
  }, [loadDuties]);

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

  // Generate invigilation duty roster
  const handleGenerateDuties = async () => {
    setIsGenerating(true);
    try {
      const result = await examOpsService.generateDuties([]);
      await loadDuties();
      showBanner?.(
        `Successfully generated ${result.generated_count} invigilation assignments with 4-duty quota cap & ECR exemptions.`,
        'success'
      );
    } catch (error) {
      showBanner?.(`Duty generation failed: ${error.message}`, 'danger');
    } finally {
      setIsGenerating(false);
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

  const formatSlotLabel = (slotId) => {
    const slot = slots.find((item) => item.id === slotId);
    return slot ? `${slot.date} (${slot.start_time} - ${slot.end_time})` : slotId;
  };

  const filteredDuties = useMemo(() => {
    return duties.filter((d) => {
      const matchSearch =
        !dutySearch ||
        d.instructor.toLowerCase().includes(dutySearch.toLowerCase()) ||
        d.room_id.toLowerCase().includes(dutySearch.toLowerCase());
      const matchSlot = !dutySlotFilter || d.slot_id === dutySlotFilter;
      return matchSearch && matchSlot;
    });
  }, [duties, dutySearch, dutySlotFilter]);

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
      <div className="itms-dash__statGrid" style={{ marginBottom: '1.25rem' }}>
        <article className="itms-dash__statCard">
          <div className="itms-dash__statHeader">
            <span className="itms-dash__statLabel">Total Duties Assigned</span>
            <Users size={18} color="var(--iiui-green)" />
          </div>
          <div className="itms-dash__statValue">{duties.length}</div>
          <div className="itms-dash__statHelp">
            Across {slots.length} session slots
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statHeader">
            <span className="itms-dash__statLabel">Own Subject Duties</span>
            <ShieldCheck size={18} color="#0284c7" />
          </div>
          <div className="itms-dash__statValue">{ownSubjectCount}</div>
          <div className="itms-dash__statHelp">Exempt from 4-duty quota cap</div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statHeader">
            <span className="itms-dash__statLabel">Extra Invigilation Duties</span>
            <Clock size={18} color="#d97706" />
          </div>
          <div className="itms-dash__statValue">{extraDutiesCount}</div>
          <div className="itms-dash__statHelp">Max 4 duties per faculty member</div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statHeader">
            <span className="itms-dash__statLabel">UMC Discipline Cases</span>
            <AlertTriangle size={18} color="#dc2626" />
          </div>
          <div className="itms-dash__statValue">{reports.length}</div>
          <div className="itms-dash__statHelp">
            {pendingUmcCount} case(s) requiring review/approval
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
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleGenerateDuties}
            disabled={isGenerating || datesheet?.status !== 'PUBLISHED'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <RefreshCw size={14} className={isGenerating ? 'spin' : ''} />
            {isGenerating ? 'Generating...' : 'Generate Duty Roster'}
          </button>
        )}
      </div>

      {/* Tab 1: Invigilation Duties Roster */}
      {activeTab === 'duties' && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <Search size={15} color="var(--itms-text-muted)" />
                <input
                  type="text"
                  className="form-control"
                  style={{ width: '220px', padding: '6px 10px', fontSize: '0.84rem' }}
                  placeholder="Search instructor or room..."
                  value={dutySearch}
                  onChange={(e) => setDutySearch(e.target.value)}
                />
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--itms-text-muted)' }}>
                  Slot:
                </span>
                <select
                  className="form-control"
                  style={{ width: 'auto', fontSize: '0.84rem', padding: '6px 10px' }}
                  value={dutySlotFilter}
                  onChange={(e) => setDutySlotFilter(e.target.value)}
                >
                  <option value="">All Examination Slots</option>
                  {slots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.date} ({s.start_time} - {s.end_time}) {s.label ? `· ${s.label}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <span style={{ fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Showing {filteredDuties.length} of {duties.length} assignments
            </span>
          </div>

          <div className="card-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Exam Session Slot</th>
                  <th>Room / Lab</th>
                  <th>Invigilator Name</th>
                  <th>Duty Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDuties.map((duty) => {
                  const roomObj = rooms.find((r) => r.id === duty.room_id || r.name === duty.room_id);
                  const isOwn = duty.duty_type === 'own_subject';
                  return (
                    <tr key={duty.id}>
                      <td style={{ fontWeight: 600 }}>{formatSlotLabel(duty.slot_id)}</td>
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
                          {roomObj?.name || duty.room_id}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--iiui-navy)' }}>
                        {duty.instructor}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: isOwn ? '#dcfce7' : '#e0f2fe',
                            color: isOwn ? '#15803d' : '#0369a1',
                          }}
                        >
                          {isOwn ? 'Own Subject (Exempt)' : 'Extra Duty'}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.8rem' }}>
                          ✓ {duty.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!filteredDuties.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--itms-text-muted)' }}>
                      {duties.length === 0 ? (
                        <div>
                          <p style={{ margin: '0 0 0.8rem' }}>No invigilation duty roster has been generated yet.</p>
                          <button
                            type="button"
                            className="btn btn--primary"
                            onClick={handleGenerateDuties}
                            disabled={isGenerating || datesheet?.status !== 'PUBLISHED'}
                          >
                            <RefreshCw size={14} className={isGenerating ? 'spin' : ''} />
                            Generate Duty Roster Now
                          </button>
                        </div>
                      ) : (
                        'No assignments matched your search filter.'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}
