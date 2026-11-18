import React, { useState, useEffect } from 'react';

export default function Dashboard({
  health,
  studentsCount = 0,
  coursesCount = 0,
  roomsCount = 0,
  slotsCount = 0,
  datesheetCount = 0,
  totalCapacity = 0,
  onNavigate,
  onGenerateDatesheet,
  isGenerating,
}) {
  const [execSummary, setExecSummary] = useState(null);
  const [summaryTab, setSummaryTab] = useState('day'); // 'day' | 'week' | 'session'
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoadingSummary(true);
      try {
        const res = await fetch('/api/system/executive-summary');
        if (res.ok) {
          const data = await res.json();
          setExecSummary(data);
        }
      } catch {
        // silent fallback
      } finally {
        setIsLoadingSummary(false);
      }
    };
    fetchSummary();
  }, [datesheetCount]);

  const stats = [
    { label: 'Registered Students', value: studentsCount, nav: 'students' },
    { label: 'Academic Courses', value: coursesCount, nav: 'courses' },
    { label: 'Exam Rooms', value: `${roomsCount} (${totalCapacity} seats/slot)`, nav: 'rooms' },
    { label: 'Time Slots', value: slotsCount, nav: 'slots' },
    { label: 'Scheduled Papers', value: datesheetCount > 0 ? `${datesheetCount} placed` : 'Pending', nav: 'datesheet' },
  ];

  return (
    <div className="itms-dash__main">
      <div className="itms-dash__pageHeader">
        <div>
          <h1 className="itms-dash__pageTitle">Executive Examination Console</h1>
          <p className="itms-dash__pageSub">
            International Islamic University Islamabad &bull; Examination Operations &amp; Resource Allocation
          </p>
        </div>
        <div className="toolbar__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onGenerateDatesheet}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating Datesheet...' : 'Generate Datesheet'}
          </button>
        </div>
      </div>

      <section className="itms-dash__stats" aria-label="Key performance indicators">
        {stats.map(({ label, value, nav }) => (
          <article
            key={label}
            className="itms-dash__statCard"
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate(nav)}
            title={`View ${label}`}
          >
            <div className="itms-dash__statBody">
              <span className="itms-dash__statLabel">{label}</span>
              <span className="itms-dash__statValue">{value}</span>
            </div>
          </article>
        ))}
      </section>

      {/* Executive Examination Summary & ECR Console (Imran's Note & PRD v3.0) */}
      <section className="itms-dash__panel" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem' }}>
        <div className="itms-dash__panelHead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h2 className="itms-dash__panelTitle" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <span>📊</span>
              <span>Executive Examination Summary &amp; ECR Console</span>
            </h2>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Whole-exam analytics, daily candidate turnout, duty teacher allocation, UMC cheating monitoring, and ECR slot incharge roster.
            </p>
          </div>

          {/* Tab Selector */}
          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '6px' }}>
            <button
              type="button"
              className={`btn btn--sm ${summaryTab === 'day' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setSummaryTab('day')}
              style={{ fontSize: '0.78rem', padding: '4px 10px', height: '28px' }}
            >
              Day-wise Summary
            </button>
            <button
              type="button"
              className={`btn btn--sm ${summaryTab === 'week' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setSummaryTab('week')}
              style={{ fontSize: '0.78rem', padding: '4px 10px', height: '28px' }}
            >
              Week-wise Summary
            </button>
            <button
              type="button"
              className={`btn btn--sm ${summaryTab === 'session' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setSummaryTab('session')}
              style={{ fontSize: '0.78rem', padding: '4px 10px', height: '28px' }}
            >
              Session-wise Summary
            </button>
          </div>
        </div>

        {/* Executive KPI Micro-Cards */}
        {execSummary?.whole_exam && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Total Candidates</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#14532d', marginTop: '2px' }}>
                {(execSummary.whole_exam.total_candidates || 0).toLocaleString()}
              </div>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>Papers Placed</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1e3a8a', marginTop: '2px' }}>
                {execSummary.whole_exam.total_papers || 0}
              </div>
            </div>
            <div style={{ background: '#fdf4ff', border: '1px solid #f5d0fe', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#86198f', textTransform: 'uppercase' }}>Duty Teachers</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#701a75', marginTop: '2px' }}>
                {execSummary.whole_exam.total_duty_teachers || 0}
              </div>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>UMC Cheating Cases</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#7f1d1d', marginTop: '2px' }}>
                {execSummary.whole_exam.total_umc_cases || 0}
              </div>
            </div>
            <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#854d0e', textTransform: 'uppercase' }}>ECR Incharges</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#713f12', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={execSummary.whole_exam.unique_ecr_incharges?.join(', ') || ''}>
                {execSummary.whole_exam.unique_ecr_incharges?.join(', ') || 'Tariq Sadad, Jibran, Musharraf'}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content Tables */}
        {isLoadingSummary ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading executive summary...</div>
        ) : !execSummary ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Generate datesheet to display executive metrics.</div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {summaryTab === 'day' && (
              <table className="data-table" style={{ width: '100%', fontSize: '0.82rem', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ textAlign: 'center', width: '8%' }}>Day</th>
                    <th style={{ textAlign: 'left', width: '18%' }}>Exam Date</th>
                    <th style={{ textAlign: 'center', width: '16%' }}>Candidates Appearing</th>
                    <th style={{ textAlign: 'center', width: '14%' }}>Papers Placed</th>
                    <th style={{ textAlign: 'center', width: '15%' }}>Duty Teachers</th>
                    <th style={{ textAlign: 'center', width: '11%' }}>UMC Cases</th>
                    <th style={{ textAlign: 'left', width: '18%' }}>ECR Slot Incharge</th>
                  </tr>
                </thead>
                <tbody>
                  {(execSummary.day_wise || []).map((d) => (
                    <tr key={d.date}>
                      <td style={{ fontWeight: 700 }}>Day {d.day_idx}</td>
                      <td style={{ textAlign: 'left', fontWeight: 600 }}>
                        {d.date} <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({d.day_name})</span>
                      </td>
                      <td style={{ fontWeight: 700, color: '#166534' }}>
                        {(d.candidates || 0).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>{d.papers || 0}</td>
                      <td style={{ fontWeight: 600 }}>{d.duty_teachers || 0}</td>
                      <td style={{ fontWeight: 700, color: d.umc_cases > 0 ? '#dc2626' : '#64748b' }}>
                        {d.umc_cases || 0}
                      </td>
                      <td style={{ textAlign: 'left', fontWeight: 600, color: '#92400e' }}>
                        <span style={{ background: '#fef3c7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fde68a', fontSize: '0.75rem' }}>
                          🛡️ {d.ecr_incharge || 'Assigned'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {summaryTab === 'week' && (
              <table className="data-table" style={{ width: '100%', fontSize: '0.82rem', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ textAlign: 'center', width: '12%' }}>Week</th>
                    <th style={{ textAlign: 'left', width: '32%' }}>Exam Dates Span</th>
                    <th style={{ textAlign: 'center', width: '18%' }}>Candidates Appearing</th>
                    <th style={{ textAlign: 'center', width: '14%' }}>Papers Placed</th>
                    <th style={{ textAlign: 'center', width: '14%' }}>Duty Teachers</th>
                    <th style={{ textAlign: 'center', width: '10%' }}>UMC Cases</th>
                  </tr>
                </thead>
                <tbody>
                  {(execSummary.week_wise || []).map((w) => (
                    <tr key={w.week}>
                      <td style={{ fontWeight: 700 }}>Week {w.week}</td>
                      <td style={{ textAlign: 'left', fontWeight: 600 }}>
                        {w.dates?.join(', ') || '—'}
                      </td>
                      <td style={{ fontWeight: 700, color: '#166534' }}>
                        {(w.candidates || 0).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>{w.papers || 0}</td>
                      <td style={{ fontWeight: 600 }}>{w.duty_teachers || 0}</td>
                      <td style={{ fontWeight: 700, color: w.umc_cases > 0 ? '#dc2626' : '#64748b' }}>
                        {w.umc_cases || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {summaryTab === 'session' && (
              <table className="data-table" style={{ width: '100%', fontSize: '0.82rem', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ textAlign: 'center', width: '10%' }}>Slot</th>
                    <th style={{ textAlign: 'left', width: '22%' }}>Date &amp; Time</th>
                    <th style={{ textAlign: 'center', width: '12%' }}>Session Band</th>
                    <th style={{ textAlign: 'center', width: '15%' }}>Candidates</th>
                    <th style={{ textAlign: 'center', width: '10%' }}>Papers</th>
                    <th style={{ textAlign: 'center', width: '11%' }}>Invigilators</th>
                    <th style={{ textAlign: 'center', width: '8%' }}>UMC</th>
                    <th style={{ textAlign: 'left', width: '12%' }}>ECR Incharge</th>
                  </tr>
                </thead>
                <tbody>
                  {(execSummary.session_wise || []).map((s) => (
                    <tr key={s.slot_id}>
                      <td style={{ fontWeight: 700 }}>{s.slot_id}</td>
                      <td style={{ textAlign: 'left', fontWeight: 600 }}>
                        {s.date} <span style={{ color: '#475569', fontSize: '0.74rem' }}>({s.time_str})</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            background: s.session_type === 'Morning' ? '#fffbeb' : '#f5f3ff',
                            color: s.session_type === 'Morning' ? '#92400e' : '#5b21b6',
                            border: `1px solid ${s.session_type === 'Morning' ? '#fde68a' : '#ddd6fe'}`,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                          }}
                        >
                          {s.session_type === 'Morning' ? '☀️ Morning' : '🌙 Evening'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: '#166534' }}>
                        {(s.candidates || 0).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>{s.papers || 0}</td>
                      <td style={{ fontWeight: 600 }}>{s.duty_teachers || 0}</td>
                      <td style={{ fontWeight: 700, color: s.umc_cases > 0 ? '#dc2626' : '#64748b' }}>
                        {s.umc_cases || 0}
                      </td>
                      <td style={{ textAlign: 'left', fontWeight: 600, color: '#92400e' }}>
                        <span style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '0.72rem' }}>
                          🛡️ {s.ecr_incharge || 'Assigned'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      <section className="itms-dash__panel">
        <div className="itms-dash__panelHead">
          <h2 className="itms-dash__panelTitle">System Status &amp; Policy Compliance</h2>
          <span className="itms-dash__verifiedChip">
            DCS EXAM CONTROLLER
          </span>
        </div>
        <p className="itms-dash__panelText">
          Automated timetable and room allocation algorithms adhere to the{' '}
          <strong>IIUI Repeater Examination Rule (v2)</strong>:
        </p>
        <ul style={{ fontSize: '0.86rem', color: 'var(--itms-text-secondary)', lineHeight: '1.7', margin: '0.6rem 0 1rem 1.25rem' }}>
          <li>
            <strong>Single Slot Integrity:</strong> A student is never scheduled for two papers in the same time slot.
          </li>
          <li>
            <strong>Regular Paper Quota:</strong> At most 1 REGULAR paper per student per calendar day.
          </li>
          <li>
            <strong>Daily Limit:</strong> At most 2 papers total per day (1 regular + 1 repeater paper in different sessions).
          </li>
          <li>
            <strong>Room Seating Alternation:</strong> Adjacent columns in an examination hall never host the same paper (column rotation enforcement).
          </li>
        </ul>
      </section>

      <section className="itms-dash__panel">
        <h2 className="itms-dash__panelTitle" style={{ marginBottom: '1rem' }}>
          Administrative Workflow (Standard Operating Sequence)
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <div
            className="card-table-wrapper"
            style={{ padding: '1.15rem', cursor: 'pointer', margin: 0 }}
            onClick={() => onNavigate('rooms')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--iiui-navy)' }}>1. Rooms &amp; Capacity</span>
              <span style={{ color: 'var(--iiui-green)', fontWeight: 700 }}>&rarr;</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Configure hall dimensions (rows &times; cols) and verify total seat capacity.
            </p>
          </div>

          <div
            className="card-table-wrapper"
            style={{ padding: '1.15rem', cursor: 'pointer', margin: 0 }}
            onClick={() => onNavigate('slots')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--iiui-navy)' }}>2. Time Slots</span>
              <span style={{ color: 'var(--iiui-green)', fontWeight: 700 }}>&rarr;</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Review or add exam dates and official IIUI midterm session timings.
            </p>
          </div>

          <div
            className="card-table-wrapper"
            style={{ padding: '1.15rem', cursor: 'pointer', margin: 0 }}
            onClick={() => onNavigate('students')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--iiui-navy)' }}>3. Students &amp; Enrolments</span>
              <span style={{ color: 'var(--iiui-green)', fontWeight: 700 }}>&rarr;</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Manage student cohorts, enroll in courses, and designate regular or repeater papers.
            </p>
          </div>

          <div
            className="card-table-wrapper"
            style={{ padding: '1.15rem', cursor: 'pointer', margin: 0 }}
            onClick={() => onNavigate('datesheet')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--iiui-navy)' }}>4. Datesheet Engine</span>
              <span style={{ color: 'var(--iiui-green)', fontWeight: 700 }}>&rarr;</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Execute collision-free datesheet generation and export formatted IIUI Excel.
            </p>
          </div>

          <div
            className="card-table-wrapper"
            style={{ padding: '1.15rem', cursor: 'pointer', margin: 0 }}
            onClick={() => onNavigate('seating')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--iiui-navy)' }}>5. Seating Plan Matrix</span>
              <span style={{ color: 'var(--iiui-green)', fontWeight: 700 }}>&rarr;</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              View room grids or official DCS seating sheets with column alternation audit.
            </p>
          </div>

          <div
            className="card-table-wrapper"
            style={{ padding: '1.15rem', cursor: 'pointer', margin: 0 }}
            onClick={() => onNavigate('verification')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--iiui-navy)' }}>6. Exam Allocations</span>
              <span style={{ color: 'var(--iiui-green)', fontWeight: 700 }}>&rarr;</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--itms-text-muted)' }}>
              Administrative verification of student allocated rooms and seats across sessions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

