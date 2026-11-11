import React, { useState, useMemo } from 'react';

export default function DatesheetPage({
  datesheet = { datesheet: [], unplaced: [] },
  onGenerate,
  isGenerating,
  coursesCount = 0,
  studentsCount = 0,
  roomsCount = 0,
}) {
  const entries = datesheet.datesheet || [];
  const unplaced = datesheet.unplaced || [];

  // Instant Search filter like AAKING333
  const [searchQuery, setSearchQuery] = useState('');

  // Distinct dates in the schedule
  const distinctDates = useMemo(() => {
    return Array.from(new Set(entries.map((e) => e.date))).length;
  }, [entries]);

  // Distinct rooms allocated across all papers
  const distinctRoomsAllocated = useMemo(() => {
    const rSet = new Set();
    entries.forEach((e) => {
      if (Array.isArray(e.allocated_rooms)) {
        e.allocated_rooms.forEach((r) => rSet.add(r));
      }
    });
    return rSet.size;
  }, [entries]);

  // Filtered entries based on instant search (AAKING333 style)
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase().trim();
    return entries.filter((e) => {
      const codeMatch = (e.course_code || '').toLowerCase().includes(q);
      const titleMatch = (e.course_title || '').toLowerCase().includes(q);
      const instructorMatch = (e.instructor || '').toLowerCase().includes(q);
      const dateMatch = (e.date || '').toLowerCase().includes(q);
      const dayMatch = (e.day_name || '').toLowerCase().includes(q);
      const labelMatch = (e.label || '').toLowerCase().includes(q);
      const batchMatch = (e.batches || '').toLowerCase().includes(q);
      const roomMatch = Array.isArray(e.allocated_rooms) &&
        e.allocated_rooms.some((r) => r.toLowerCase().includes(q));

      return (
        codeMatch ||
        titleMatch ||
        instructorMatch ||
        dateMatch ||
        dayMatch ||
        labelMatch ||
        batchMatch ||
        roomMatch
      );
    });
  }, [entries, searchQuery]);

  // Clean parser for instructor cell
  const parseInstructorCell = (rawStr) => {
    if (!rawStr) return [];
    let str = rawStr.replace(/\s*\(All Batches:[^)]*\)/i, '').trim();

    if (str.includes('|')) {
      const parts = str.split('|').map((p) => p.trim()).filter(Boolean);
      const map = new Map();
      for (const part of parts) {
        if (part.includes(':') && !part.match(/^(?:Dr\.|Engr\.|Mr\.|Ms\.)/i)) {
          const [left, right] = part.split(':').map((s) => s.trim());
          const teacher = right;
          const tag = left;
          if (!map.has(teacher)) map.set(teacher, []);
          if (tag && !map.get(teacher).includes(tag)) map.get(teacher).push(tag);
        } else {
          const m = part.match(/^([^(]+?)\s*(?:\((.+)\))?$/);
          if (m) {
            const teacher = m[1].trim();
            const tag = m[2]?.trim() || '';
            if (!map.has(teacher)) map.set(teacher, []);
            if (tag && !map.get(teacher).includes(tag)) map.get(teacher).push(tag);
          } else {
            if (!map.has(part)) map.set(part, []);
          }
        }
      }

      const result = [];
      map.forEach((tags, teacher) => {
        let cleanTag = tags.join(', ');
        const progs = [...new Set(tags.map((t) => t.match(/BS[A-Z]+/i)?.[0]).filter(Boolean))];
        const secs = [...new Set(tags.map((t) => t.match(/Sec\s*([A-D](?:\s*&\s*[A-D])?)/i)?.[1]).filter(Boolean))];
        if (progs.length && secs.length > 1) {
          cleanTag = progs.join('/') + ': Sec ' + secs.join(', ');
        } else if (progs.length && secs.length === 1) {
          cleanTag = progs.join('/') + ': Sec ' + secs[0];
        }
        result.push({ name: teacher, tag: cleanTag });
      });
      return result;
    }

    const m = str.match(/^([^(]+?)\s*(?:\((.+)\))?$/);
    if (m) {
      return [{ name: m[1].trim(), tag: m[2]?.trim() || '' }];
    }
    return [{ name: str, tag: '' }];
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="itms-dash__main">
      {/* Page Header with Action Toolbar */}
      <div className="itms-dash__pageHeader no-print">
        <div>
          <h1 className="itms-dash__pageTitle">Midterm Examination Datesheet</h1>
          <p className="itms-dash__pageSub">
            Automated clash-free examination datesheet with synchronized hall allocations and back-paper compliance.
          </p>
        </div>
        <div className="toolbar__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating Schedule...' : 'Generate Datesheet'}
          </button>

          <a
            href="/api/datesheet/export.xlsx"
            className={`btn btn--secondary ${!entries.length ? 'disabled' : ''}`}
            download
            style={{ pointerEvents: !entries.length ? 'none' : 'auto', opacity: !entries.length ? 0.6 : 1 }}
          >
            Export Excel
          </a>

          <button
            type="button"
            className="btn btn--outline"
            onClick={handlePrint}
            disabled={!entries.length}
          >
            Print Datesheet
          </button>
        </div>
      </div>

      {/* KPI Stats Strip (AAKING333 Style) */}
      <div className="datesheet-kpi-grid no-print">
        <div className="datesheet-kpi-card">
          <span className="datesheet-kpi-label">TOTAL COURSES</span>
          <span className="datesheet-kpi-val">{coursesCount || entries.length}</span>
        </div>
        <div className="datesheet-kpi-card">
          <span className="datesheet-kpi-label">TOTAL STUDENTS</span>
          <span className="datesheet-kpi-val">{studentsCount || 200}</span>
        </div>
        <div className="datesheet-kpi-card">
          <span className="datesheet-kpi-label">SCHEDULED PAPERS</span>
          <span className="datesheet-kpi-val">{entries.length}</span>
        </div>
        <div className="datesheet-kpi-card">
          <span className="datesheet-kpi-label">ACTIVE EXAM HALLS</span>
          <span className="datesheet-kpi-val">
            {distinctRoomsAllocated > 0 ? distinctRoomsAllocated : roomsCount || 4}
          </span>
        </div>
      </div>

      {/* Critical Unplaced Courses Warning (if any) */}
      {unplaced.length > 0 && (
        <div className="alert-banner alert-banner--danger no-print" style={{ borderLeft: '4px solid var(--itms-danger)', background: '#fef2f2' }}>
          <div>
            <strong style={{ color: 'var(--itms-danger)' }}>Scheduling Conflict:</strong>{' '}
            {unplaced.length} course(s) could not be placed due to insufficient exam dates or student clashes.
            <p style={{ margin: '0.3rem 0', fontSize: '0.82rem', color: '#991b1b' }}>
              Under IIUI policy, each student can sit at most 1 regular paper per day. Please configure at least 5 separate exam dates in Time Slots Management.
            </p>
            <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0, fontSize: '0.78rem', color: '#7f1d1d' }}>
              {unplaced.map((u) => (
                <li key={u.course_code}>
                  <strong>{u.course_code}</strong>: {u.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Main Table Container with Instant Search Bar */}
      <div className="card-table-wrapper" style={{ padding: '1.25rem' }}>
        {/* Instant Search Bar Header (AAKING333 Style) */}
        <div className="datesheet-filter-strip no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--iiui-navy)' }}>
              Examination Datesheet Table
            </span>
            <span className="badge badge--muted" style={{ fontSize: '0.74rem' }}>
              {filteredEntries.length === entries.length
                ? `${entries.length} Papers Scheduled`
                : `Showing ${filteredEntries.length} of ${entries.length} Papers`}
            </span>
          </div>

          <div className="datesheet-search-wrapper">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search course, code, teacher, room, date..."
              className="datesheet-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="datesheet-search-clear"
                title="Clear search"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Print Only Official IIUI Header */}
        <div className="print-only" style={{ textAlign: 'center', marginBottom: '1.5rem', display: 'none' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', color: '#004D25', fontWeight: 800 }}>
            INTERNATIONAL ISLAMIC UNIVERSITY, ISLAMABAD
          </h2>
          <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: '#006633', fontWeight: 700 }}>
            DEPARTMENT OF COMPUTER SCIENCE &amp; INFORMATION TECHNOLOGY
          </h3>
          <h4 style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 700, textDecoration: 'underline' }}>
            MIDTERM EXAMS DATESHEET (MALE) &mdash; FALL 2026
          </h4>
        </div>

        {/* Clean IIUI Datesheet Table (AAKING333 Matching Format) */}
        <div className="table-responsive">
          <table className="data-table datesheet-table">
            <thead>
              <tr style={{ background: '#004D25', color: '#ffffff' }}>
                <th style={{ width: '13%' }}>Date &amp; Day</th>
                <th style={{ width: '12%' }}>Time</th>
                <th style={{ width: '9%' }}>Code</th>
                <th style={{ width: '22%' }}>Course Title</th>
                <th style={{ width: '21%' }}>Instructor(s)</th>
                <th style={{ width: '9%', textAlign: 'center' }}>Enrolled</th>
                <th style={{ width: '14%' }}>Allocated Rooms</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((d, i) => (
                <tr key={`${d.slot_id}-${d.course_code}-${i}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong style={{ color: 'var(--iiui-navy)', fontSize: '0.86rem' }}>{d.date}</strong>
                    <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--itms-text-muted)', fontWeight: 500 }}>
                      {d.day_name || 'Exam Day'}
                    </span>
                  </td>

                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.84rem', color: 'var(--itms-text-primary)' }}>
                      {d.start_time} &ndash; {d.end_time}
                    </span>
                  </td>

                  <td>
                    <span style={{ color: '#006633', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.88rem' }}>
                      {d.course_code}
                    </span>
                  </td>

                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--itms-text-primary)', fontSize: '0.86rem', lineHeight: 1.35 }}>
                      {d.course_title}
                    </div>
                    {d.batches && (
                      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {d.batches.split(',').map((b, bIdx) => (
                          <span
                            key={bIdx}
                            className={`badge ${b.includes('IT') ? 'badge--info' : 'badge--primary'}`}
                            style={{ fontSize: '0.67rem', padding: '1px 6px', fontWeight: 600 }}
                          >
                            {b.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {parseInstructorCell(d.instructor).map((inst, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: 'var(--itms-text-primary)', fontSize: '0.84rem' }}>
                            {inst.name}
                          </span>
                          {inst.tag && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                color: 'var(--iiui-navy)',
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                padding: '1px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              {inst.tag}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>

                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {d.back_students > 0 ? (
                      <div style={{ lineHeight: 1.3 }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--iiui-navy)' }}>
                          {d.students} <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--itms-text-muted)' }}>total</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-secondary)', marginTop: '2px' }}>
                          <span>{d.regular_students} regular</span> + <span style={{ color: '#d97706', fontWeight: 700 }}>{d.back_students} back</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ lineHeight: 1.3 }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--iiui-navy)' }}>
                          {d.students}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)', marginTop: '2px' }}>
                          regular
                        </div>
                      </div>
                    )}
                  </td>

                  <td>
                    {Array.isArray(d.allocated_rooms) && d.allocated_rooms.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {d.allocated_rooms.map((rm, rIdx) => (
                          <span
                            key={rIdx}
                            style={{
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              background: '#eff6ff',
                              color: '#1e40af',
                              border: '1px solid #bfdbfe',
                              padding: '2px 7px',
                              borderRadius: '4px',
                            }}
                          >
                            {rm}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.76rem', color: 'var(--itms-text-muted)' }}>Auto assigned</span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredEntries.length === 0 && entries.length > 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--itms-text-muted)' }}>
                      No examination papers match your search "{searchQuery}".
                    </p>
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => setSearchQuery('')}
                      style={{ marginTop: '0.75rem' }}
                    >
                      Clear Search Filter
                    </button>
                  </td>
                </tr>
              )}

              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem', color: 'var(--iiui-navy)', fontSize: '1.1rem' }}>
                      Ready to Generate Examination Datesheet
                    </h3>
                    <p style={{ margin: '0 0 1.25rem', color: 'var(--itms-text-muted)', fontSize: '0.86rem' }}>
                      Click "Generate Datesheet" above to compute the clash-free schedule with alternating hall allocations.
                    </p>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={onGenerate}
                      disabled={isGenerating}
                    >
                      {isGenerating ? 'Generating Schedule...' : 'Generate Datesheet Now'}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
