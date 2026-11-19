import React, { useState, useMemo } from 'react';
import { formatTimeRange12 } from '../utils/timeFormat.js';

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

  // Instant Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Room type helper for visual color differentiation (Imran's Note & PRD v3.0)
  const isLabRoom = (rName) => /lab/i.test(rName || '');

  // Morning vs Evening helper
  const isMorningSlot = (timeStr, startTime) => {
    if (startTime) {
      const h = parseInt(startTime.split(':')[0], 10);
      return h < 12;
    }
    if (!timeStr) return true;
    const m = timeStr.match(/(\d\d?):(\d\d)/);
    if (!m) return true;
    return parseInt(m[1], 10) < 12;
  };

  // Distinct rooms allocated across all papers
  const distinctRoomsAllocated = useMemo(() => {
    const rSet = new Set();
    entries.forEach((e) => {
      if (Array.isArray(e.allocated_rooms)) {
        e.allocated_rooms.forEach((r) => r && rSet.add(r));
      }
    });
    return rSet.size;
  }, [entries]);

  // Clean format helpers matching official IIUI Reference Datesheet
  const fmtCourseCode = (code) => {
    if (!code) return '';
    return code.replace(/([A-Za-z]+)(\d+)/, '$1 $2');
  };

  const TOTAL_COHORT_SECTIONS = {
    'BSCS F23': ['A', 'B', 'C'],
    'BSCS F24': ['A', 'B'],
    'BSCS F25': ['A', 'B'],
    'BSCS F26': ['A', 'B'],
    'BSIT F23': ['A', 'B'],
    'BSIT F24': ['A', 'B'],
    'BSIT F25': ['A', 'B'],
    'BSIT F26': ['A', 'B'],
  };

  const formatCourseBatches = (centries) => {
    if (!centries || centries.length === 0) return '—';
    const cohortMap = new Map();

    centries.forEach((e) => {
      let prog = (e.program || '').trim();
      let batch = (e.batch || '').trim();
      if (!prog || !batch) {
        const m = (e.batches || '').match(/(BSCS|BSIT|BSSE|BSDS|MSCS|MSDS|PhD CS)\s+([F|S]\d+)/i);
        if (m) {
          prog = m[1].toUpperCase();
          batch = m[2].toUpperCase();
        }
      }
      const key = `${prog} ${batch}`.trim();
      if (!key) return;
      if (!cohortMap.has(key)) cohortMap.set(key, new Set());

      const secs = cohortMap.get(key);
      if (Array.isArray(e.sections) && e.sections.length > 0) {
        e.sections.forEach((s) => s && secs.add(String(s).trim().toUpperCase()));
      } else if (e.section) {
        String(e.section).split(/[,+/]/).forEach((s) => s && secs.add(String(s).trim().toUpperCase()));
      } else if (e.batches) {
        const secMatch = e.batches.match(/Section\s+([A-Za-z0-9+,\s]+)/i);
        if (secMatch) {
          secMatch[1].split(/[+,\s]+/).forEach((s) => s && secs.add(String(s).trim().toUpperCase()));
        }
      }
    });

    if (cohortMap.size === 0) {
      return centries[0].batches || '—';
    }

    const labels = [];
    cohortMap.forEach((sectionsSet, key) => {
      const knownAll = TOTAL_COHORT_SECTIONS[key] || ['A', 'B'];
      const presentSecs = Array.from(sectionsSet).sort();
      const isAll = presentSecs.length >= knownAll.length && knownAll.every((s) => sectionsSet.has(s));

      if (presentSecs.length > 0 && !isAll) {
        labels.push(`${key} (Sec ${presentSecs.join(', ')})`);
      } else {
        labels.push(key);
      }
    });

    return labels.join(' / ') || '—';
  };

  const cleanInstName = (instructorStr) => {
    if (!instructorStr) return '';
    return instructorStr
      .replace(/\s*\(All Batches:[^)]*\)/i, '')
      .replace(/\s*\((?:BSCS|BSIT|BSSE|BSDS|MSCS|MSDS|PhD CS)[^)]*\)/gi, '')
      .replace(/,\s*,/g, ',')
      .trim();
  };

  const fmtDateString = (dateStr) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        return `${parts[2]}/${parts[1]}/${parts[0]} - ${dayName}`;
      }
    } catch {
      // fallback
    }
    return dateStr;
  };

  // Filtered entries based on instant search
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
      const roomMatch =
        Array.isArray(e.allocated_rooms) &&
        e.allocated_rooms.some((r) => r && r.toLowerCase().includes(q));

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

  // Group filtered entries by Date -> Session Window -> Unique Course
  const groupedDatesheet = useMemo(() => {
    const dateMap = new Map();
    const sorted = [...filteredEntries].sort((a, b) => {
      const dComp = (a.date || '').localeCompare(b.date || '');
      if (dComp !== 0) return dComp;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });

    for (const e of sorted) {
      const d = e.date || 'Unscheduled';
      if (!dateMap.has(d)) dateMap.set(d, []);
      dateMap.get(d).push(e);
    }

    const result = [];

    dateMap.forEach((dayEntries, dateStr) => {
      const slotMap = new Map();
      for (const e of dayEntries) {
        const skey = `${e.slot_id || ''}|${e.start_time || ''}|${e.end_time || ''}`;
        if (!slotMap.has(skey)) {
          slotMap.set(skey, {
            slot_id: e.slot_id || '',
            start_time: e.start_time || '',
            end_time: e.end_time || '',
            time_str: formatTimeRange12(e.start_time, e.end_time),
            entries: [],
          });
        }
        slotMap.get(skey).entries.push(e);
      }

      const sessions = [];
      slotMap.forEach((slotData) => {
        const sessionRolls = new Set();
        slotData.entries.forEach((e) => {
          (e.student_rolls || []).forEach((r) => r && sessionRolls.add(String(r).trim()));
        });
        const totalSessionStudents = sessionRolls.size
          || slotData.entries.reduce((sum, e) => sum + (e.students || 0), 0);

        // Group by unique course_code
        const courseMap = new Map();
        for (const e of slotData.entries) {
          const ccode = e.course_code || '';
          if (!courseMap.has(ccode)) courseMap.set(ccode, []);
          courseMap.get(ccode).push(e);
        }

        const courses = [];
        courseMap.forEach((centries, ccode) => {
          const title = centries[0]?.course_title || '';
          const fmtCode = fmtCourseCode(ccode);
          const courseName = `${fmtCode} ${title}`.trim();

          // Deduplicate instructors
          const instSet = new Set();
          for (const e of centries) {
            const raw = e.instructor || '';
            const cleaned = cleanInstName(raw);
            cleaned.split(',').forEach((p) => {
              const trimmed = p.trim();
              if (trimmed && trimmed !== '—' && trimmed !== '-') {
                instSet.add(trimmed);
              }
            });
          }
          const instructorStr = Array.from(instSet).join(', ') || '—';

          // Section-aware cohort label (e.g. BSCS F26 (Sec B) or BSCS F23 / BSIT F23)
          const batchStr = formatCourseBatches(centries);

          // Allocated rooms
          const roomSet = new Set();
          for (const e of centries) {
            if (Array.isArray(e.allocated_rooms)) {
              e.allocated_rooms.forEach((r) => r && roomSet.add(r));
            }
          }
          const rooms = Array.from(roomSet);
          const roomStr = rooms.join(', ') || '—';

          const courseRolls = new Set();
          centries.forEach((e) => {
            (e.student_rolls || []).forEach((r) => r && courseRolls.add(String(r).trim()));
          });
          const courseStudents = courseRolls.size
            || centries.reduce((sum, e) => sum + (e.students || 0), 0);

          courses.push({
            course_code: ccode,
            fmt_code: fmtCode,
            course_title: title,
            course_name: courseName,
            instructor: instructorStr,
            batches: batchStr,
            rooms,
            room_str: roomStr,
            students: courseStudents,
          });
        });

        const allSameRooms =
          courses.length > 1 &&
          new Set(courses.map((c) => c.room_str)).size === 1;

        sessions.push({
          slot_id: slotData.slot_id,
          time_str: slotData.time_str,
          is_morning: isMorningSlot(slotData.time_str, slotData.start_time),
          session_total: totalSessionStudents,
          all_same_rooms: allSameRooms,
          courses,
        });
      });

      const dayRolls = new Set();
      dayEntries.forEach((e) => {
        (e.student_rolls || []).forEach((r) => r && dayRolls.add(String(r).trim()));
      });
      const totalDayStudents = dayRolls.size
        || sessions.reduce((sum, s) => sum + (s.session_total || 0), 0);

      result.push({
        date: dateStr,
        date_formatted: fmtDateString(dateStr),
        total_day_students: totalDayStudents,
        sessions,
      });
    });

    return result;
  }, [filteredEntries]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="itms-dash__main">
      {/* Top Action Toolbar (hidden during print) */}
      <div className="itms-dash__pageHeader no-print">
        <div>
          <h1 className="itms-dash__pageTitle">Midterm Examination Datesheet</h1>
        </div>
        <div className="toolbar__actions" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onGenerate()}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating Schedule...' : 'Generate Datesheet'}
          </button>

          <a
            href="/api/datesheet/export.xlsx"
            className={`btn btn--secondary ${!entries.length ? 'disabled' : ''}`}
            download="IIUI_Midterm_Exam_Datesheet_Fall_2026.xlsx"
            style={{
              pointerEvents: !entries.length ? 'none' : 'auto',
              opacity: !entries.length ? 0.6 : 1,
            }}
          >
            Export Excel
          </a>

          <a
            href="/api/datesheet/export.pdf"
            className={`btn btn--secondary ${!entries.length ? 'disabled' : ''}`}
            download="IIUI_Midterm_Exam_Datesheet_Fall_2026.pdf"
            style={{
              pointerEvents: !entries.length ? 'none' : 'auto',
              opacity: !entries.length ? 0.6 : 1,
            }}
          >
            Export PDF
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

      {/* Version Status Banner (hidden during print) */}
      {datesheet.version && (
        <div
          className={`alert-banner ${datesheet.status === 'SUPERSEDED' ? 'alert-banner--danger' : 'alert-banner--success'} no-print`}
          style={{ marginBottom: '1rem' }}
        >
          Datesheet version {datesheet.version} · {datesheet.status}
          {datesheet.published_at
            ? ` · Published ${new Date(datesheet.published_at).toLocaleString()}`
            : ''}
          {datesheet.status === 'SUPERSEDED' &&
            ' · Roll slips and seating charts from this version are no longer valid.'}
        </div>
      )}

      {/* Unplaced Courses Warning (if any) */}
      {unplaced.length > 0 && (
        <div
          className="alert-banner alert-banner--danger no-print"
          style={{
            borderLeft: '4px solid var(--itms-danger)',
            background: '#fef2f2',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <strong style={{ color: 'var(--itms-danger)' }}>Scheduling Conflict:</strong>{' '}
            {unplaced.length} course(s) could not be placed due to insufficient exam dates or student clashes.
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

      {/* Main Datesheet Card */}
      <div className="card-table-wrapper" style={{ padding: '1.25rem' }}>
        {/* Instant Search Bar (hidden during print) */}
        <div className="datesheet-filter-strip no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--iiui-navy)' }}>
              Official Datesheet Schedule
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

        {/* Institutional Reference Header (Matches doc/reference_datesheet.xlsx Rows 1-4) */}
        <div className="reference-datesheet-header">
          <div className="ref-univ-title">INTERNATIONAL ISLAMIC UNIVERSITY</div>
          <div className="ref-dept-title">DEPARTMENT OF COMPUTER SCIENCE &amp; INFORMATION TECHNOLOGY</div>
          <div className="ref-exam-title">MIDTERM EXAMS DATESHEET (MALE) - FALL 2026</div>
          <div className="ref-version-title">Version {datesheet.version || '1.2'}</div>
        </div>

        {/* Clean Datesheet Table (Exact 7 Columns from doc/reference_datesheet.xlsx) */}
        <div className="table-responsive">
          <table className="data-table datesheet-table">
            <thead>
              <tr>
                <th style={{ width: '13%' }}>Date  (Day)</th>
                <th style={{ width: '27%', textAlign: 'left' }}>Course</th>
                <th style={{ width: '22%', textAlign: 'left' }}>Instructor</th>
                <th style={{ width: '12%' }}>Batch(es)</th>
                <th style={{ width: '12%' }}>Room No.</th>
                <th style={{ width: '7%' }}>Students Count</th>
                <th style={{ width: '7%' }}>Total Students per Session</th>
              </tr>
            </thead>
            <tbody>
              {groupedDatesheet.map((dayGroup) => (
                <React.Fragment key={dayGroup.date}>
                  {/* Date Header Row (Same to same as Reference Datesheet Row 7 + Total Day Candidates) */}
                  <tr className="datesheet-date-banner-row">
                    <td colSpan={7}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <strong>{dayGroup.date_formatted}</strong>
                        <span
                          style={{
                            background: '#047857',
                            color: '#ffffff',
                            padding: '3px 12px',
                            borderRadius: '12px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                          }}
                        >
                          Total Day Candidates: {dayGroup.total_day_students} students
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Sessions in this day */}
                  {dayGroup.sessions.map((session, sIdx) => {
                    const k = session.courses.length;
                    return (
                      <React.Fragment key={`${dayGroup.date}-${session.slot_id}-${sIdx}`}>
                        {session.courses.map((c, cIdx) => (
                          <tr key={`${session.slot_id}-${c.course_code}-${cIdx}`} className="datesheet-row">
                            {/* Col 1: Date (Day) / Time Slot (Morning vs Evening Bands) */}
                            {cIdx === 0 && (
                              <td
                                rowSpan={k}
                                className="datesheet-cell-slot"
                                style={{
                                  textAlign: 'center',
                                  verticalAlign: 'middle',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  background: session.is_morning ? '#fffbeb' : '#f5f3ff',
                                  color: session.is_morning ? '#92400e' : '#5b21b6',
                                  borderLeft: session.is_morning ? '4px solid #f59e0b' : '4px solid #8b5cf6',
                                }}
                              >
                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px', opacity: 0.9 }}>
                                  {session.is_morning ? '☀️ Morning' : '🌙 Evening'}
                                </div>
                                <div>{session.time_str}</div>
                              </td>
                            )}

                            {/* Col 2: Course */}
                            <td className="datesheet-cell-course" style={{ textAlign: 'left' }}>
                              <span className="course-code-tag">{c.fmt_code}</span>
                              <span>{c.course_title}</span>
                            </td>

                            {/* Col 3: Instructor */}
                            <td className="datesheet-cell-instructor" style={{ textAlign: 'left' }}>
                              {c.instructor}
                            </td>

                            {/* Col 4: Batch(es) */}
                            <td className="datesheet-cell-batches" style={{ textAlign: 'center' }}>
                              <span className="batch-pill">{c.batches}</span>
                            </td>

                            {/* Col 5: Room No. (Differentiated Lab vs Hall Badges) */}
                            {session.all_same_rooms ? (
                              cIdx === 0 && (
                                <td
                                  rowSpan={k}
                                  className="datesheet-cell-rooms"
                                  style={{ textAlign: 'center', verticalAlign: 'middle' }}
                                >
                                  {c.rooms.length > 0 ? (
                                    c.rooms.map((r, rIdx) => {
                                      const isLab = isLabRoom(r);
                                      return (
                                        <span
                                          key={rIdx}
                                          className={`room-pill ${isLab ? 'room-pill--lab' : 'room-pill--hall'}`}
                                          style={{
                                            background: isLab ? '#e0f2fe' : '#ecfdf5',
                                            color: isLab ? '#0369a1' : '#047857',
                                            border: `1px solid ${isLab ? '#7dd3fc' : '#a7f3d0'}`,
                                            padding: '2px 7px',
                                            borderRadius: '4px',
                                            fontWeight: 700,
                                            fontSize: '0.76rem',
                                            display: 'inline-block',
                                            margin: '2px',
                                          }}
                                          title={isLab ? 'Computer Laboratory' : 'Examination Hall / Lecture Room'}
                                        >
                                          {isLab ? '🖥️ ' : '🏛️ '}{r}
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span>—</span>
                                  )}
                                </td>
                              )
                            ) : (
                              <td className="datesheet-cell-rooms" style={{ textAlign: 'center' }}>
                                {c.rooms.length > 0 ? (
                                  c.rooms.map((r, rIdx) => {
                                    const isLab = isLabRoom(r);
                                    return (
                                      <span
                                        key={rIdx}
                                        className={`room-pill ${isLab ? 'room-pill--lab' : 'room-pill--hall'}`}
                                        style={{
                                          background: isLab ? '#e0f2fe' : '#ecfdf5',
                                          color: isLab ? '#0369a1' : '#047857',
                                          border: `1px solid ${isLab ? '#7dd3fc' : '#a7f3d0'}`,
                                          padding: '2px 7px',
                                          borderRadius: '4px',
                                          fontWeight: 700,
                                          fontSize: '0.76rem',
                                          display: 'inline-block',
                                          margin: '2px',
                                        }}
                                        title={isLab ? 'Computer Laboratory' : 'Examination Hall / Lecture Room'}
                                      >
                                        {isLab ? '🖥️ ' : '🏛️ '}{r}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span>—</span>
                                )}
                              </td>
                            )}

                            {/* Col 6: Students Count */}
                            <td className="datesheet-cell-count" style={{ textAlign: 'center' }}>
                              {c.students}
                            </td>

                            {/* Col 7: Total Students per Session */}
                            {cIdx === 0 && (
                              <td
                                rowSpan={k}
                                className="datesheet-cell-session-total"
                                style={{
                                  textAlign: 'center',
                                  verticalAlign: 'middle',
                                  fontWeight: 800,
                                }}
                              >
                                {session.session_total}
                              </td>
                            )}
                          </tr>
                        ))}

                        {/* Blank separator row between sessions (Matches Reference Rows 9, 12, 16) */}
                        <tr className="datesheet-session-spacer-row">
                          <td colSpan={7} />
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
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
                      onClick={() => onGenerate()}
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
