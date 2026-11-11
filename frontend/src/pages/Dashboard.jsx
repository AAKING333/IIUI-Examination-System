import React from 'react';

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

      <section className="itms-dash__panel">
        <div className="itms-dash__panelHead">
          <h2 className="itms-dash__panelTitle">System Status &amp; Policy Compliance</h2>
          <span className="itms-dash__verifiedChip">
            DCS EXAM CONTROLLER
          </span>
        </div>
        <p className="itms-dash__panelText">
          Automated timetable and room allocation algorithms adhere to the{' '}
          <strong>IIUI Back-Paper Examination Rule (v2)</strong>:
        </p>
        <ul style={{ fontSize: '0.86rem', color: 'var(--itms-text-secondary)', lineHeight: '1.7', margin: '0.6rem 0 1rem 1.25rem' }}>
          <li>
            <strong>Single Slot Integrity:</strong> A student is never scheduled for two papers in the same time slot.
          </li>
          <li>
            <strong>Regular Paper Quota:</strong> At most 1 REGULAR paper per student per calendar day.
          </li>
          <li>
            <strong>Daily Limit:</strong> At most 2 papers total per day (1 regular + 1 repeat/back paper in different sessions).
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
              Manage student cohorts, enroll in courses, and designate regular or back papers.
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

