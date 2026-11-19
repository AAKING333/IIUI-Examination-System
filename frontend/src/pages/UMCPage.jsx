import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { examOpsService, seatingService } from '../services/index.js';
import Modal from '../components/Modal.jsx';
import { formatTimeRange12 } from '../utils/timeFormat.js';

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

export default function UMCPage({
  slots = [],
  rooms = [],
  students = [],
  datesheet = { datesheet: [] },
  showBanner,
}) {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewCase, setViewCase] = useState(null);
  const [actionCase, setActionCase] = useState(null); // { report, step: 'statement' | 'review' }
  const [actionFields, setActionFields] = useState({
    student_statement: '',
    invigilator_remarks: '',
    instructor_comments: '',
  });

  // New report form state
  const [reportDate, setReportDate] = useState('');
  const [slotPlan, setSlotPlan] = useState(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [newReport, setNewReport] = useState(EMPTY_REPORT);
  const [photos, setPhotos] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Signature canvas
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  // Load reports from backend
  const loadReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = filterStatus ? { status: filterStatus } : {};
      const data = await examOpsService.getUMCReports(params);
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      showBanner?.(`Could not load UMC cases: ${err.message}`, 'danger');
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus, showBanner]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Derived options for the UMC filing form: Day -> Session -> Room -> Course -> Student
  const slotEntries = useMemo(() => datesheet?.datesheet || [], [datesheet]);

  const reportSlots = useMemo(() => {
    const ids = new Set(slotEntries.map((e) => e.slot_id));
    return slots.filter((s) => ids.has(s.id));
  }, [slotEntries, slots]);

  const reportDates = useMemo(
    () => Array.from(new Set(reportSlots.map((s) => s.date))),
    [reportSlots]
  );

  const sessionsForDate = useMemo(
    () => reportSlots.filter((s) => s.date === reportDate),
    [reportSlots, reportDate]
  );

  const entriesForSlot = useMemo(
    () => slotEntries.filter((e) => e.slot_id === newReport.slot_id),
    [newReport.slot_id, slotEntries]
  );

  const selectedEntry = entriesForSlot.find((e) => e.course_code === newReport.course_code);

  useEffect(() => {
    let cancelled = false;
    if (!newReport.slot_id) {
      setSlotPlan(null);
      setIsPlanLoading(false);
      return undefined;
    }
    setIsPlanLoading(true);
    seatingService
      .getSeatingPlan(newReport.slot_id)
      .then((plan) => {
        if (!cancelled) setSlotPlan(plan);
      })
      .catch(() => {
        if (!cancelled) setSlotPlan(null);
      })
      .finally(() => {
        if (!cancelled) setIsPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [newReport.slot_id]);

  const planRooms = useMemo(
    () => (slotPlan?.rooms || []).filter((r) => (r.seated || 0) > 0),
    [slotPlan]
  );

  const roomOptions = useMemo(() => {
    if (planRooms.length) {
      return planRooms.map((r) => ({ id: r.room_id, name: r.room_name, plan: r }));
    }
    return rooms.map((r) => ({ id: r.id, name: r.name, plan: null }));
  }, [planRooms, rooms]);

  const selectedRoomPlan = planRooms.find((r) => r.room_id === newReport.room_id) || null;

  const roomCourses = useMemo(() => {
    if (selectedRoomPlan) {
      const codes = new Set();
      (selectedRoomPlan.column_papers || []).forEach((p) => {
        const code = String(p || '').replace(/-T\d+$/, '');
        if (code) codes.add(code);
      });
      (selectedRoomPlan.grid || []).forEach((row) =>
        (row || []).forEach((cell) => {
          if (cell?.course_code) {
            const code = String(cell.course_code).replace(/-T\d+$/, '');
            if (code) codes.add(code);
          }
        })
      );
      return Array.from(codes)
        .map((code) => ({
          code,
          title: entriesForSlot.find((e) => e.course_code === code)?.course_title || '',
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
    }
    const seen = new Set();
    return entriesForSlot
      .filter((e) => {
        if (!e.course_code || seen.has(e.course_code)) return false;
        seen.add(e.course_code);
        return true;
      })
      .map((e) => ({ code: e.course_code, title: e.course_title }));
  }, [selectedRoomPlan, entriesForSlot]);

  const eligibleStudents = useMemo(() => {
    if (!selectedEntry) return [];
    const sections = selectedEntry.sections || [selectedEntry.section];
    return students.filter(
      (s) =>
        s.program === selectedEntry.program &&
        s.batch === selectedEntry.batch &&
        sections.includes(s.section) &&
        s.enrolments?.some((en) => en.course === selectedEntry.course_code)
    );
  }, [selectedEntry, students]);

  const roomStudents = useMemo(() => {
    if (!selectedRoomPlan || !newReport.course_code) return eligibleStudents;
    const seen = new Set();
    const seated = [];
    (selectedRoomPlan.grid || []).forEach((row) =>
      (row || []).forEach((cell) => {
        if (!cell?.roll_no || cell.is_buffer) return;
        const code = String(cell.course_code || '').replace(/-T\d+$/, '');
        if (code !== newReport.course_code || seen.has(cell.roll_no)) return;
        seen.add(cell.roll_no);
        const student = students.find((s) => s.roll_no === cell.roll_no);
        seated.push({
          roll_no: cell.roll_no,
          name: cell.name || student?.name || '',
          program: student?.program || '',
          batch: student?.batch || '',
          section: student?.section || '',
        });
      })
    );
    return seated.sort((a, b) => a.roll_no.localeCompare(b.roll_no));
  }, [selectedRoomPlan, newReport.course_code, eligibleStudents, students]);

  const invigilatorOptions = useMemo(() => {
    const names = [];
    const add = (name) => {
      const clean = String(name || '').trim();
      if (clean && !names.includes(clean)) names.push(clean);
    };
    if (selectedRoomPlan) {
      (selectedRoomPlan.invigilators || []).forEach(add);
      (selectedRoomPlan.invigilation || []).forEach((d) => add(d.instructor));
    }
    const entry = entriesForSlot.find((e) => e.course_code === newReport.course_code);
    if (entry?.instructor) add(entry.instructor);
    return names.sort();
  }, [selectedRoomPlan, entriesForSlot, newReport.course_code]);

  useEffect(() => {
    if (!newReport.room_id) return;
    setNewReport((curr) => {
      if (invigilatorOptions.length === 1) {
        return curr.invigilator === invigilatorOptions[0]
          ? curr
          : { ...curr, invigilator: invigilatorOptions[0] };
      }
      if (!curr.invigilator || invigilatorOptions.includes(curr.invigilator)) return curr;
      return { ...curr, invigilator: '' };
    });
  }, [invigilatorOptions, newReport.room_id]);

  // Format slot label helper
  const formatSlotLabel = (slotId) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return slotId;
    return `${slot.date} (${formatTimeRange12(slot.start_time, slot.end_time)})`;
  };

  // Canvas drawing handlers
  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    setNewReport((curr) => ({ ...curr, signature_data: '' }));
  };

  const getPointerPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const pt = getPointerPos(e);
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    drawingRef.current = true;
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const pt = getPointerPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (canvasRef.current) {
      setNewReport((curr) => ({
        ...curr,
        signature_data: canvasRef.current.toDataURL('image/png'),
      }));
    }
  };

  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 8) {
      showBanner?.('Maximum 8 evidence photos allowed.', 'danger');
      e.target.value = '';
      return;
    }
    try {
      const dataUrls = await Promise.all(files.map(readFileAsDataUrl));
      setPhotos(dataUrls);
      setNewReport((curr) => ({ ...curr, evidence: dataUrls }));
    } catch (err) {
      showBanner?.(err.message, 'danger');
    }
  };

  const handleRemovePhoto = (idx) => {
    const updated = photos.filter((_, i) => i !== idx);
    setPhotos(updated);
    setNewReport((curr) => ({ ...curr, evidence: updated }));
  };

  // Submit new UMC report
  const handleCreateReport = async (e) => {
    e.preventDefault();
    if (!newReport.slot_id) {
      showBanner?.('Validation Error: Examination slot is required.', 'danger');
      return;
    }
    if (!newReport.room_id) {
      showBanner?.('Validation Error: Examination room is required.', 'danger');
      return;
    }
    if (!newReport.roll_no?.trim()) {
      showBanner?.('Validation Error: Student Roll Number is required.', 'danger');
      return;
    }
    if (!newReport.course_code?.trim()) {
      showBanner?.('Validation Error: Examination course is required.', 'danger');
      return;
    }
    if (!newReport.invigilator?.trim()) {
      showBanner?.('Validation Error: Reporting invigilator name is required.', 'danger');
      return;
    }
    if (!newReport.details?.trim() || newReport.details.trim().length < 5) {
      showBanner?.('Validation Error: Incident description must be at least 5 characters long.', 'danger');
      return;
    }
    if (!newReport.signature_data) {
      showBanner?.('Validation Error: Invigilator digital signature is required before filing.', 'danger');
      return;
    }
    if (!newReport.evidence || newReport.evidence.length === 0) {
      showBanner?.('Validation Error: Please attach at least one photo or scan of the physical evidence / answer script.', 'danger');
      return;
    }
    setIsSubmitting(true);
    try {
      await examOpsService.createUMCReport(newReport);
      setNewReport(EMPTY_REPORT);
      setReportDate('');
      setPhotos([]);
      clearSignature();
      setIsAddOpen(false);
      await loadReports();
      showBanner?.('Official UMC report registered successfully.', 'success');
    } catch (err) {
      showBanner?.(`Submission failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Advance UMC report workflow
  const handleAdvanceStatus = async (item, targetStatus, payload = {}) => {
    setIsAdvancing(true);
    try {
      await examOpsService.updateUMCReport(item.id, { ...payload, status: targetStatus });
      setActionCase(null);
      await loadReports();
      showBanner?.(`Case #${item.id} moved to ${targetStatus.replaceAll('_', ' ')}.`, 'success');
    } catch (err) {
      showBanner?.(`Workflow error: ${err.message}`, 'danger');
    } finally {
      setIsAdvancing(false);
    }
  };

  // Filtered reports
  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((r) => {
      const matchSearch =
        !q ||
        (r.roll_no || '').toLowerCase().includes(q) ||
        (r.course_code || '').toLowerCase().includes(q) ||
        (r.room_id || '').toLowerCase().includes(q) ||
        (r.invigilator || '').toLowerCase().includes(q) ||
        (r.details || '').toLowerCase().includes(q);
      const matchStatus = !filterStatus || r.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [reports, searchQuery, filterStatus]);

  // Statistics
  const pendingStatements = useMemo(() => reports.filter((r) => r.status === 'reported').length, [reports]);
  const inReviewCount = useMemo(
    () => reports.filter((r) => r.status === 'statement_recorded' || r.status === 'instructor_reviewed').length,
    [reports]
  );
  const approvedCount = useMemo(() => reports.filter((r) => r.status === 'approved').length, [reports]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'reported':
        return { label: 'Reported', bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' };
      case 'statement_recorded':
        return { label: 'Statements Recorded', bg: '#fffbeb', text: '#b45309', border: '#fde68a' };
      case 'instructor_reviewed':
        return { label: 'Instructor Reviewed', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };
      case 'approved':
        return { label: 'Approved & Finalized', bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' };
      default:
        return { label: status, bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
    }
  };

  return (
    <div className="itms-dash__main">
      {/* Header */}
      <div className="itms-dash__pageHeader">
        <div>
          <h1 className="itms-dash__pageTitle">UMC &amp; Disciplinary Cases</h1>
        </div>

        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setNewReport(EMPTY_REPORT);
            setReportDate('');
            setPhotos([]);
            setIsAddOpen(true);
          }}
          style={{ fontSize: '0.84rem' }}
        >
          + File UMC Incident
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--itms-border)',
            borderLeft: '4px solid var(--iiui-navy)',
            borderRadius: '8px',
            padding: '0.85rem 1.1rem',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--itms-text-muted)', textTransform: 'uppercase' }}>
            Total Incidents
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--iiui-navy)', marginTop: 2 }}>
            {reports.length}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
            Official registered examination cases
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--itms-border)',
            borderLeft: '4px solid #b91c1c',
            borderRadius: '8px',
            padding: '0.85rem 1.1rem',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--itms-text-muted)', textTransform: 'uppercase' }}>
            Pending Statements
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b91c1c', marginTop: 2 }}>
            {pendingStatements}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
            Require examinee statement recording
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--itms-border)',
            borderLeft: '4px solid #b45309',
            borderRadius: '8px',
            padding: '0.85rem 1.1rem',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--itms-text-muted)', textTransform: 'uppercase' }}>
            Under Review
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309', marginTop: 2 }}>
            {inReviewCount}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
            In instructor/ECR evaluation pipeline
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--itms-border)',
            borderLeft: '4px solid #15803d',
            borderRadius: '8px',
            padding: '0.85rem 1.1rem',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--itms-text-muted)', textTransform: 'uppercase' }}>
            Approved &amp; Finalized
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d', marginTop: 2 }}>
            {approvedCount}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
            Ready for disciplinary dossier export
          </div>
        </div>
      </div>

      {/* Filter Row */}
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
              style={{ width: '240px', padding: '5px 9px', fontSize: '0.84rem' }}
              placeholder="Search roll no, course, room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="form-control"
            style={{ width: 'auto', fontSize: '0.84rem', padding: '5px 9px' }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="reported">Reported (Pending Statements)</option>
            <option value="statement_recorded">Statements Recorded</option>
            <option value="instructor_reviewed">Instructor Reviewed</option>
            <option value="approved">Approved &amp; Finalized</option>
          </select>

          {(searchQuery || filterStatus) && (
            <button
              type="button"
              className="btn btn--sm btn--outline"
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('');
              }}
              style={{ fontSize: '0.78rem' }}
            >
              Clear Filters
            </button>
          )}
        </div>

        <span style={{ fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
          Showing {filteredReports.length} of {reports.length} cases
        </span>
      </div>

      {/* Cases Queue Table */}
      <div className="card-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Case ID</th>
              <th style={{ minWidth: 150 }}>Student Examinee</th>
              <th style={{ minWidth: 170 }}>Paper &amp; Session</th>
              <th>Incident Details</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 170, textAlign: 'right' }}>Workflow Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--itms-text-muted)' }}>
                  Loading UMC disciplinary records...
                </td>
              </tr>
            ) : filteredReports.map((item) => {
              const badge = getStatusBadge(item.status);
              return (
                <tr key={item.id}>
                  <td>
                    <strong style={{ color: 'var(--iiui-navy)' }}>#{item.id}</strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)' }}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--iiui-navy)' }}>{item.roll_no}</strong>
                    <div style={{ fontSize: '0.74rem', color: 'var(--itms-text-muted)' }}>
                      Room: {item.room_id}
                    </div>
                  </td>
                  <td>
                    <strong>{item.course_code}</strong>
                    <div style={{ fontSize: '0.74rem', color: 'var(--itms-text-muted)' }}>
                      {formatSlotLabel(item.slot_id)}
                    </div>
                  </td>
                  <td style={{ maxWidth: 300, fontSize: '0.82rem', lineHeight: 1.4 }}>
                    <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.details}
                    </div>
                    {item.invigilator && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)', marginTop: 2 }}>
                        Reported by: {item.invigilator}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        background: badge.bg,
                        color: badge.text,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn--sm btn--outline"
                        onClick={() => setViewCase(item)}
                        title="View Full Dossier"
                        style={{ padding: '2px 7px', fontSize: '0.78rem' }}
                      >
                        View
                      </button>

                      {item.status === 'reported' && (
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          onClick={() => {
                            setActionCase({ report: item, step: 'statement' });
                            setActionFields({
                              student_statement: item.student_statement || '',
                              invigilator_remarks: item.invigilator_remarks || '',
                              instructor_comments: '',
                            });
                          }}
                          style={{ fontSize: '0.76rem', padding: '3px 8px' }}
                        >
                          Record Statements
                        </button>
                      )}

                      {item.status === 'statement_recorded' && (
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          onClick={() => {
                            setActionCase({ report: item, step: 'review' });
                            setActionFields({
                              student_statement: '',
                              invigilator_remarks: '',
                              instructor_comments: item.instructor_comments || '',
                            });
                          }}
                          style={{ fontSize: '0.76rem', padding: '3px 8px' }}
                        >
                          Instructor Review
                        </button>
                      )}

                      {item.status === 'instructor_reviewed' && (
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          onClick={() => handleAdvanceStatus(item, 'approved')}
                          disabled={isAdvancing}
                          style={{ background: '#16a34a', borderColor: '#15803d', fontSize: '0.76rem', padding: '3px 8px' }}
                        >
                          Approve
                        </button>
                      )}

                      {item.status === 'approved' && (
                        <a
                          className="btn btn--sm btn--outline"
                          href={`/api/umc/${item.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '0.76rem', padding: '2px 7px' }}
                        >
                          PDF
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && filteredReports.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--itms-text-muted)' }}>
                  {reports.length === 0 ? 'No UMC disciplinary cases reported yet.' : 'No cases match your filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* File UMC Modal */}
      <Modal
        isOpen={isAddOpen}
        title="File Unfair Means Case (UMC) Incident"
        onClose={() => setIsAddOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setIsAddOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleCreateReport}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Registering...' : 'Register Official UMC'}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateReport} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <label className="form-label">
              Exam Day <span style={{ color: 'var(--itms-danger)' }}>*</span>
              <select
                className="form-control"
                value={reportDate}
                required
                onChange={(e) => {
                  setReportDate(e.target.value);
                  setNewReport((curr) => ({
                    ...curr,
                    slot_id: '',
                    room_id: '',
                    course_code: '',
                    roll_no: '',
                    invigilator: '',
                  }));
                }}
              >
                <option value="">Select Day</option>
                {reportDates.map((d, idx) => (
                  <option key={d} value={d}>
                    {`Day ${idx + 1} \u00b7 `}
                    {new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Session <span style={{ color: 'var(--itms-danger)' }}>*</span>
              <select
                className="form-control"
                value={newReport.slot_id}
                required
                disabled={!reportDate}
                onChange={(e) =>
                  setNewReport((curr) => ({
                    ...curr,
                    slot_id: e.target.value,
                    room_id: '',
                    course_code: '',
                    roll_no: '',
                    invigilator: '',
                  }))
                }
              >
                <option value="">{reportDate ? 'Select Session' : 'Select Day first'}</option>
                {sessionsForDate.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label ? `${s.label} \u00b7 ` : ''}
                    {formatTimeRange12(s.start_time, s.end_time)}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Hall / Lab <span style={{ color: 'var(--itms-danger)' }}>*</span>
              <select
                className="form-control"
                value={newReport.room_id}
                required
                disabled={!newReport.slot_id}
                onChange={(e) =>
                  setNewReport((curr) => ({
                    ...curr,
                    room_id: e.target.value,
                    course_code: '',
                    roll_no: '',
                    invigilator: '',
                  }))
                }
              >
                <option value="">
                  {isPlanLoading ? 'Loading rooms...' : newReport.slot_id ? 'Select Room' : 'Select Session first'}
                </option>
                {roomOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Course Paper <span style={{ color: 'var(--itms-danger)' }}>*</span>
              <select
                className="form-control"
                value={newReport.course_code}
                required
                disabled={!newReport.room_id}
                onChange={(e) =>
                  setNewReport((curr) => ({
                    ...curr,
                    course_code: e.target.value,
                    roll_no: '',
                    invigilator: '',
                  }))
                }
              >
                <option value="">{newReport.room_id ? 'Select Course' : 'Select Room first'}</option>
                {roomCourses.map((course) => (
                  <option key={course.code} value={course.code}>
                    {course.code}
                    {course.title ? ` \u00b7 ${course.title}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Student Examinee <span style={{ color: 'var(--itms-danger)' }}>*</span>
              <select
                className="form-control"
                value={newReport.roll_no}
                required
                disabled={!newReport.course_code}
                onChange={(e) => setNewReport((curr) => ({ ...curr, roll_no: e.target.value }))}
              >
                <option value="">{newReport.course_code ? 'Select Student' : 'Select Course first'}</option>
                {roomStudents.map((s) => (
                  <option key={s.roll_no} value={s.roll_no}>
                    {s.roll_no} \u2014 {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label">
              Reporting Invigilator <span style={{ color: 'var(--itms-danger)' }}>*</span>
              {invigilatorOptions.length > 1 ? (
                <select
                  className="form-control"
                  value={newReport.invigilator}
                  required
                  onChange={(e) => setNewReport((curr) => ({ ...curr, invigilator: e.target.value }))}
                >
                  <option value="">Select Invigilator</option>
                  {invigilatorOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : invigilatorOptions.length === 1 ? (
                <input
                  type="text"
                  className="form-control"
                  value={invigilatorOptions[0]}
                  readOnly
                  style={{ background: '#f8fafc', fontWeight: 600 }}
                />
              ) : (
                <input
                  type="text"
                  className="form-control"
                  placeholder="Invigilator name"
                  value={newReport.invigilator}
                  required
                  onChange={(e) => setNewReport((curr) => ({ ...curr, invigilator: e.target.value }))}
                />
              )}
            </label>
          </div>

          <label className="form-label">
            Incident Description &amp; Material Recovered <span style={{ color: 'var(--itms-danger)' }}>*</span>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Describe what occurred, unauthorized material seized (mobile phone, cheat sheet), and desk location..."
              value={newReport.details}
              required
              onChange={(e) => setNewReport({ ...newReport, details: e.target.value })}
            />
          </label>

          {/* Evidence Photos */}
          <div>
            <label className="form-label">
              Physical Evidence Photos <span style={{ color: 'var(--itms-danger)' }}>*</span>
            </label>
            <input
              type="file"
              className="form-control"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
            />
            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {photos.map((src, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img
                      src={src}
                      alt={`Evidence ${i + 1}`}
                      style={{ width: 75, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(i)}
                      style={{
                        position: 'absolute',
                        top: -5,
                        right: -5,
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: 18,
                        height: 18,
                        fontSize: 11,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Digital Signature */}
          <div>
            <div className="form-label" style={{ fontWeight: 600 }}>
              Invigilator Digital Signature <span style={{ color: 'var(--itms-danger)' }}>*</span>
            </div>
            <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
              <canvas
                ref={canvasRef}
                width={550}
                height={120}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{
                  width: '100%',
                  height: 120,
                  border: '1.5px dashed var(--itms-border-strong)',
                  borderRadius: 6,
                  touchAction: 'none',
                  background: '#ffffff',
                  cursor: 'crosshair',
                }}
              />
              {!newReport.signature_data && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#94a3b8',
                    pointerEvents: 'none',
                    fontSize: '0.84rem',
                  }}
                >
                  Sign here using mouse or touch
                </div>
              )}
            </div>
            <div style={{ marginTop: 4 }}>
              <button
                type="button"
                className="btn btn--sm btn--outline"
                onClick={clearSignature}
                style={{ fontSize: '0.76rem' }}
              >
                Clear Signature
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Record Statements / Review Modal */}
      <Modal
        isOpen={Boolean(actionCase)}
        title={actionCase?.step === 'statement' ? 'Record Statements' : 'Instructor Review'}
        onClose={() => setActionCase(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setActionCase(null)}
              disabled={isAdvancing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                if (actionCase.step === 'statement') {
                  handleAdvanceStatus(actionCase.report, 'statement_recorded', {
                    student_statement: actionFields.student_statement,
                    invigilator_remarks: actionFields.invigilator_remarks,
                  });
                } else {
                  handleAdvanceStatus(actionCase.report, 'instructor_reviewed', {
                    instructor_comments: actionFields.instructor_comments,
                  });
                }
              }}
              disabled={isAdvancing}
            >
              {isAdvancing ? 'Saving...' : 'Save & Advance Workflow'}
            </button>
          </>
        }
      >
        {actionCase && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
              <strong>Case #{actionCase.report.id} &bull; {actionCase.report.roll_no}</strong>
              <div style={{ color: 'var(--itms-text-muted)', marginTop: 2 }}>
                {actionCase.report.course_code} &bull; Room {actionCase.report.room_id}
              </div>
            </div>

            {actionCase.step === 'statement' ? (
              <>
                <label className="form-label">
                  Student Examinee Statement
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Enter verbatim student explanation or response..."
                    value={actionFields.student_statement}
                    onChange={(e) => setActionFields({ ...actionFields, student_statement: e.target.value })}
                  />
                </label>
                <label className="form-label">
                  Invigilator Remarks
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Invigilator observation or additional remarks..."
                    value={actionFields.invigilator_remarks}
                    onChange={(e) => setActionFields({ ...actionFields, invigilator_remarks: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <label className="form-label">
                Course Instructor Review Comments
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Enter instructor findings and recommendation for the ECR committee..."
                  value={actionFields.instructor_comments}
                  onChange={(e) => setActionFields({ ...actionFields, instructor_comments: e.target.value })}
                />
              </label>
            )}
          </div>
        )}
      </Modal>

      {/* View Full Case Dossier Modal */}
      <Modal
        isOpen={Boolean(viewCase)}
        title={`UMC Case Dossier #${viewCase?.id}`}
        onClose={() => setViewCase(null)}
        footer={
          <button type="button" className="btn btn--outline" onClick={() => setViewCase(null)}>
            Close
          </button>
        }
      >
        {viewCase && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div><strong>Student:</strong> {viewCase.roll_no}</div>
              <div><strong>Course:</strong> {viewCase.course_code}</div>
              <div><strong>Exam Slot:</strong> {formatSlotLabel(viewCase.slot_id)}</div>
              <div><strong>Room:</strong> {viewCase.room_id}</div>
              <div><strong>Reporting Invigilator:</strong> {viewCase.invigilator || '—'}</div>
              <div><strong>Status:</strong> {viewCase.status}</div>
            </div>

            <div>
              <strong>Allegation / Incident Details:</strong>
              <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 6, marginTop: 4 }}>
                {viewCase.details}
              </div>
            </div>

            {viewCase.student_statement && (
              <div>
                <strong>Student Statement:</strong>
                <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 6, marginTop: 4 }}>
                  {viewCase.student_statement}
                </div>
              </div>
            )}

            {viewCase.instructor_comments && (
              <div>
                <strong>Instructor Review Comments:</strong>
                <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 6, marginTop: 4 }}>
                  {viewCase.instructor_comments}
                </div>
              </div>
            )}

            {viewCase.evidence && viewCase.evidence.length > 0 && (
              <div>
                <strong>Physical Evidence Photos:</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {viewCase.evidence.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`Evidence ${i + 1}`}
                      style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1' }}
                    />
                  ))}
                </div>
              </div>
            )}

            {viewCase.signature_data && (
              <div>
                <strong>Invigilator Digital Signature:</strong>
                <div style={{ marginTop: 4 }}>
                  <img
                    src={viewCase.signature_data}
                    alt="Signature"
                    style={{ maxHeight: 60, border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', padding: 4 }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
