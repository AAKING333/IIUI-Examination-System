import React, { useState, useEffect, useMemo } from 'react';

export default function RollSlipPage({ showBanner }) {
  const [students, setStudents] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRollNo, setSelectedRollNo] = useState('');
  const [slipData, setSlipData] = useState(null);
  const [isLoadingSlip, setIsLoadingSlip] = useState(false);
  const [slipError, setSlipError] = useState(null);

  // Load students directory for live picker
  useEffect(() => {
    const fetchStudents = async () => {
      setIsLoadingStudents(true);
      try {
        const res = await fetch('/api/students');
        if (!res.ok) throw new Error('Failed to load students');
        const data = await res.json();
        setStudents(Array.isArray(data) ? data : []);
      } catch (err) {
        if (showBanner) showBanner(`Could not load students: ${err.message}`, 'danger');
      } finally {
        setIsLoadingStudents(false);
      }
    };
    fetchStudents();
  }, [showBanner]);

  // Fetch slip when selectedRollNo changes
  const fetchSlip = async (rollNo) => {
    if (!rollNo) return;
    setIsLoadingSlip(true);
    setSlipError(null);
    try {
      const res = await fetch(`/api/roll-slip/${encodeURIComponent(rollNo)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch roll number slip');
      }
      const data = await res.json();
      setSlipData(data);
    } catch (err) {
      setSlipError(err.message);
      setSlipData(null);
    } finally {
      setIsLoadingSlip(false);
    }
  };

  // Filter student matches based on searchQuery
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) {
      return students.slice(0, 12);
    }
    const q = searchQuery.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.roll_no.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.batch && s.batch.toLowerCase().includes(q))
    ).slice(0, 24);
  }, [students, searchQuery]);

  const handleSelectStudent = (s) => {
    setSelectedRollNo(s.roll_no);
    fetchSlip(s.roll_no);
  };

  const handlePrint = () => {
    window.print();
  };

  const currentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="itms-dash__main">
      {/* Page Header */}
      <div className="itms-dash__pageHeader no-print">
        <div>
          <h1 className="itms-dash__pageTitle">Student Roll Number Slips</h1>
          <p className="itms-dash__pageSub">
            Official IIUI examination admit cards with synchronized hall seating allocations, timetable, and conduct code.
          </p>
        </div>
        <div className="toolbar__actions">
          <a
            href="/api/roll-slips/all-pdf"
            className="btn btn--primary"
            download="IIUI_All_Students_Roll_Number_Slips.pdf"
            title="Download single PDF containing roll number slips for all enrolled students"
          >
            Download All Slips (PDF)
          </a>
        </div>
      </div>

      {/* Student Picker Card (AAKING333 Style) */}
      <div className="card-table-wrapper no-print" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.98rem', color: 'var(--iiui-navy)', fontWeight: 700 }}>
              Search &amp; Select Student
            </h3>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Enter student name, roll number, or select from the quick list below.
            </p>
          </div>

          {slipData && (
            <button
              type="button"
              className="btn btn--sm btn--outline"
              onClick={() => {
                setSlipData(null);
                setSelectedRollNo('');
                setSearchQuery('');
              }}
            >
              Change Student
            </button>
          )}
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '420px', marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-control"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g. 2024-CS-001 or Ahmed Khan"
            style={{ paddingRight: '2.2rem' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.6rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '1.1rem',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Quick candidate chips / grid */}
        {isLoadingStudents ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--itms-text-muted)' }}>Loading student directory...</div>
        ) : filteredStudents.length > 0 ? (
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Select Candidate Student ({filteredStudents.length} matches):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.5rem' }}>
              {filteredStudents.map((s) => {
                const isSelected = selectedRollNo === s.roll_no;
                return (
                  <button
                    key={s.roll_no}
                    type="button"
                    onClick={() => handleSelectStudent(s)}
                    style={{
                      textAlign: 'left',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--iiui-green-700)' : '1px solid var(--itms-border)',
                      background: isSelected ? 'var(--iiui-green-50)' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem', color: isSelected ? 'var(--iiui-green-700)' : '#0f172a' }}>
                        {s.roll_no}
                      </span>
                      <span className="badge badge--muted" style={{ fontSize: '0.68rem', padding: '1px 5px' }}>
                        {s.batch}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--itms-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.82rem', color: 'var(--itms-text-muted)' }}>
            No student found matching "{searchQuery}".
          </div>
        )}
      </div>

      {/* Error state */}
      {slipError && (
        <div className="alert-banner alert-banner--danger no-print" style={{ marginBottom: '1.5rem' }}>
          <div>
            <strong>Slip Generation Notice:</strong> {slipError}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoadingSlip && (
        <div className="card-table-wrapper no-print" style={{ padding: '3rem', textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--iiui-green-700)', fontSize: '0.95rem' }}>
            Compiling Official Roll Number Slip...
          </div>
        </div>
      )}

      {/* Roll Slip Document (Clean IIUI Format) */}
      {slipData && !isLoadingSlip && (
        <div style={{ maxWidth: '900px', margin: '0 auto 2.5rem' }}>
          {/* Action Toolbar above slip */}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.86rem', color: 'var(--itms-text-secondary)' }}>
              Official examination admit card for{' '}
              <strong style={{ color: 'var(--iiui-navy)' }}>{slipData.student.name}</strong> ({slipData.student.roll_no})
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a
                href={`/api/roll-slip/${encodeURIComponent(slipData.student.roll_no)}/pdf`}
                className="btn btn--secondary btn--sm"
                download
              >
                Download PDF
              </a>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handlePrint}
              >
                Print / Save PDF
              </button>
            </div>
          </div>

          {/* Official Document Sheet */}
          <div className="iiui-roll-slip-document" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2rem 2.5rem', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }}>
            {/* Document Header */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Midterm Examination Fall-2026 Semester
              </div>
              <h1 style={{ margin: '0.2rem 0', fontSize: '1.35rem', fontWeight: 800, color: '#004D25', letterSpacing: '0.02em' }}>
                INTERNATIONAL ISLAMIC UNIVERSITY, ISLAMABAD
              </h1>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                (EXAMINATION BRANCH)
              </div>
              <div style={{ height: '2px', background: '#006633', width: '100%', margin: '0.5rem 0' }} />
              <h2 style={{ margin: '0.3rem 0', fontSize: '1.05rem', fontWeight: 800, color: '#004D25' }}>
                ROLL NO SLIP FOR MIDTERM EXAMINATION (FALL-2026) SEMESTER
              </h2>
            </div>

            {/* Student Information Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <tbody>
                <tr>
                  <th style={{ width: '22%', border: '1px solid #cbd5e1', background: '#f1f8f3', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                    Roll No. / Reg No#
                  </th>
                  <td style={{ width: '28%', border: '1px solid #cbd5e1', padding: '6px 10px', fontWeight: 700, fontFamily: 'monospace', color: '#004D25' }}>
                    {slipData.student.roll_no}
                  </td>
                  <th style={{ width: '22%', border: '1px solid #cbd5e1', background: '#f1f8f3', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                    Student Name Mr./Ms:
                  </th>
                  <td style={{ width: '28%', border: '1px solid #cbd5e1', padding: '6px 10px', fontWeight: 700, color: '#0f172a' }}>
                    {slipData.student.name}
                  </td>
                </tr>
                <tr>
                  <th style={{ border: '1px solid #cbd5e1', background: '#f1f8f3', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                    Son/Daughter of:
                  </th>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px' }} colSpan={3}>
                    {slipData.student.father_name || '—'}
                  </td>
                </tr>
                <tr>
                  <th style={{ border: '1px solid #cbd5e1', background: '#f1f8f3', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                    Faculty/Institute/School
                  </th>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px' }} colSpan={3}>
                    {slipData.student.faculty || 'Computing and Information Technology'}
                  </td>
                </tr>
                <tr>
                  <th style={{ border: '1px solid #cbd5e1', background: '#f1f8f3', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                    Degree Program
                  </th>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', fontWeight: 600 }}>
                    {slipData.student.program} ({slipData.student.batch})
                  </td>
                  <th style={{ border: '1px solid #cbd5e1', background: '#f1f8f3', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                    Campus
                  </th>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px' }}>
                    {slipData.student.campus || 'Male Campus'}
                  </td>
                </tr>
                <tr>
                  <th style={{ border: '1px solid #cbd5e1', background: '#f1f8f3', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                    Examination to be held in
                  </th>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', fontWeight: 600 }}>
                    Fall-2026
                  </td>
                  <th style={{ border: '1px solid #cbd5e1', background: '#f1f8f3', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                    Issue Date
                  </th>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px' }}>
                    {currentDate}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Courses & Examination Schedule Table */}
            <div style={{ marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.84rem', color: '#004D25', textTransform: 'uppercase' }}>
              Detail of Courses, Allowed to be Appeared in Exam Fall-2026
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#004D25', color: '#ffffff' }}>
                  <th style={{ border: '1px solid #003319', padding: '6px', textAlign: 'center', width: '5%' }}>S.No</th>
                  <th style={{ border: '1px solid #003319', padding: '6px', textAlign: 'left', width: '12%' }}>Course Code</th>
                  <th style={{ border: '1px solid #003319', padding: '6px', textAlign: 'left', width: '28%' }}>Course Title</th>
                  <th style={{ border: '1px solid #003319', padding: '6px', textAlign: 'center', width: '13%' }}>Date &amp; Day</th>
                  <th style={{ border: '1px solid #003319', padding: '6px', textAlign: 'center', width: '12%' }}>Time</th>
                  <th style={{ border: '1px solid #003319', padding: '6px', textAlign: 'center', width: '12%' }}>Hall / Room</th>
                  <th style={{ border: '1px solid #003319', padding: '6px', textAlign: 'center', width: '18%' }}>Assigned Seat</th>
                </tr>
              </thead>
              <tbody>
                {slipData.exams.map((p, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'center', fontWeight: 600 }}>
                      {idx + 1}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px', fontFamily: 'monospace', fontWeight: 700, color: '#006633' }}>
                      {p.course_code}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px', fontWeight: 600 }}>
                      {p.course_title}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'center' }}>
                      <span style={{ fontWeight: 600 }}>{p.date}</span>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>{p.day_name}</span>
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'center', fontFamily: 'monospace' }}>
                      {p.start_time}&ndash;{p.end_time}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'center', fontWeight: 700, color: '#1e3a8a' }}>
                      {p.room || '—'}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'center', fontWeight: 600, color: '#0f172a' }}>
                      {p.seat || 'Assigned'}
                    </td>
                  </tr>
                ))}
                {slipData.exams.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ border: '1px solid #cbd5e1', padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                      No examination schedule generated yet. Please generate the datesheet first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Notes & Code of Conduct */}
            <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '0.75rem', marginBottom: '1.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', marginBottom: '0.35rem' }}>
                Note:
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.76rem', color: '#334155', lineHeight: 1.45 }}>
                <li>Bring this slip and your University Identity Card in the Examination Hall.</li>
                <li>Possession of a Cell Phone/Digital Gadgets in the Examination Hall is an offence as per University code of conduct.</li>
                <li>All Roll No. Slips are issued on a provisional basis. Therefore, appearing in the examination does not automatically entitle a student to claim the result until all eligibility requirements are fulfilled.</li>
                <li>Students should not appear in the exams if having short attendance (less than 75%) in any course(s) and result shall be cancelled in case they appear.</li>
              </ul>
            </div>

            {/* Signatures & Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '1.5rem', borderTop: '1px dashed #cbd5e1' }}>
              <div style={{ textAlign: 'center', width: '200px' }}>
                <div style={{ borderBottom: '1px solid #334155', height: '30px', marginBottom: '4px' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                  Student's Signature
                </span>
              </div>

              <div style={{ textAlign: 'center', fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                Al-Jamia (IT-Center) Auto Generated Examination System
              </div>

              <div style={{ textAlign: 'center', width: '220px' }}>
                <div style={{ borderBottom: '1px solid #334155', height: '30px', marginBottom: '4px' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#004D25' }}>
                  Deputy Controller of Examinations
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State when no student selected */}
      {!slipData && !isLoadingSlip && (
        <div className="card-table-wrapper no-print" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--iiui-navy)' }}>
            Select a Student to View &amp; Print Roll Number Slip
          </h3>
          <p style={{ margin: '0 0 1rem', fontSize: '0.86rem', color: 'var(--itms-text-muted)' }}>
            Choose any student from the directory search above to generate their official examination admit card.
          </p>
        </div>
      )}
    </div>
  );
}

