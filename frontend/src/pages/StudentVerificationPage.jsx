import React, { useState, useEffect } from 'react';

export default function StudentVerificationPage({ showBanner }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRecords = async (query = '') => {
    setIsLoading(true);
    try {
      const url = query ? `/api/student-verifications?search=${encodeURIComponent(query)}` : '/api/student-verifications';
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRecords(data);
    } catch (err) {
      showBanner(`Could not load verifications: ${err.message}`, 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchRecords(searchTerm);
  };

  return (
    <div className="itms-dash__main">
      <div className="itms-dash__pageHeader no-print">
        <div>
          <h1 className="itms-dash__pageTitle">Student Examination Rosters &amp; Seating Verification</h1>
          <p className="itms-dash__pageSub">
            Administrative inspection of allocated examination halls, assigned desks, and paper registration compliance.
          </p>
        </div>
      </div>

      <div className="alert-banner alert-banner--info no-print">
        <div>
          <strong>Administrative Access Only:</strong> This console is designated for examination controllers and hall invigilators
          to verify student seating allocations and enrollment eligibility.
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="toolbar no-print">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.6rem', flex: 1, maxWidth: '480px' }}>
          <div className="toolbar__search" style={{ flex: 1 }}>
            <input
              type="text"
              placeholder="Search by Roll No or Student Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn--primary">
            Search
          </button>
          {searchTerm && (
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => {
                setSearchTerm('');
                fetchRecords('');
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div className="toolbar__actions">
          <button type="button" className="btn btn--outline" onClick={() => window.print()}>
            Print Verification List
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--itms-text-muted)' }}>
          Loading student exam allocations...
        </div>
      ) : records.length === 0 ? (
        <div className="card-table-wrapper" style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 500, color: 'var(--itms-text-muted)' }}>
            No student examination records found. Generate the datesheet first to calculate allocations.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {records.map((student) => (
            <div key={student.roll_no} className="card-table-wrapper" style={{ padding: '1.25rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '0.9rem',
                  borderBottom: '1px solid var(--itms-border)',
                  paddingBottom: '0.75rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span className="badge badge--info" style={{ fontSize: '0.85rem' }}>
                      {student.roll_no}
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: 'var(--iiui-navy)' }}>
                      {student.name}
                    </strong>
                    {student.papers.some((p) => p.type === 'back') && (
                      <span className="badge badge--warning">Contains Back Paper</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)', marginTop: '0.25rem' }}>
                    Father Name: {student.father_name || '&mdash;'} &bull; Program: {student.program} ({student.batch}) &bull; Faculty: {student.faculty}
                  </div>
                </div>

                <div>
                  <span className="badge badge--success">
                    {student.papers.length} Papers Scheduled
                  </span>
                </div>
              </div>

              {/* Student Exam Table - WITHOUT download roll no slip button */}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Course Code &amp; Title</th>
                    <th>Exam Date</th>
                    <th>Session Window</th>
                    <th>Allocated Hall</th>
                    <th>Assigned Desk</th>
                    <th>Paper Status</th>
                  </tr>
                </thead>
                <tbody>
                  {student.papers.map((p, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong>{p.course_code}</strong> &mdash; {p.course_title}
                      </td>
                      <td>
                        {p.date}
                      </td>
                      <td>
                        {p.start_time} &ndash; {p.end_time}
                      </td>
                      <td>
                        <strong>{p.room}</strong>
                      </td>
                      <td>
                        <span className="badge badge--muted">{p.seat}</span>
                      </td>
                      <td>
                        <span className={`badge ${p.type === 'back' ? 'badge--warning' : 'badge--success'}`}>
                          {p.remarks}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

