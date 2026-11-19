import React, { useState, useMemo } from 'react';
import Modal from '../components/Modal.jsx';
import { extractErrorMessage } from '../services/apiClient.js';

const PRESET_PROGRAMS = ['BSCS', 'BSIT', 'BSSE'];

const DEPARTMENT_LABELS = {
  CS: 'Computer Science (CS)',
  IT: 'Information Technology (IT)',
  SE: 'Software Engineering (SE)',
};
const PRESET_BATCHES = ['F24', 'F23', 'F22', 'F21'];
const PRESET_SECTIONS = ['A', 'B', 'C', 'D'];

export default function InstructorAssignmentsPage({
  assignments = [],
  courses = [],
  onRefresh,
  showBanner,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [formData, setFormData] = useState({
    program: 'BSIT',
    batch: 'F23',
    section: 'A',
    course_code: 'CS201',
    instructor: '',
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic filter sets
  const distinctPrograms = useMemo(() => {
    const list = Array.from(new Set(assignments.map((a) => a.program).filter(Boolean)));
    return list.length > 0 ? list : PRESET_PROGRAMS;
  }, [assignments]);

  const distinctBatches = useMemo(() => {
    const list = Array.from(new Set(assignments.map((a) => a.batch).filter(Boolean)));
    return list.length > 0 ? list : PRESET_BATCHES;
  }, [assignments]);

  const distinctSections = useMemo(() => {
    const list = Array.from(new Set(assignments.map((a) => a.section).filter(Boolean))).sort();
    return list.length > 0 ? list : PRESET_SECTIONS;
  }, [assignments]);

  // Filtered view
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        a.instructor.toLowerCase().includes(q) ||
        a.course_code.toLowerCase().includes(q);

      const matchProg = !programFilter || a.program === programFilter;
      const matchBatch = !batchFilter || a.batch === batchFilter;
      const matchSec = !sectionFilter || a.section === sectionFilter;
      const matchCourse = !courseFilter || a.course_code === courseFilter;

      return matchSearch && matchProg && matchBatch && matchSec && matchCourse;
    });
  }, [assignments, searchTerm, programFilter, batchFilter, sectionFilter, courseFilter]);

  const handleOpenAdd = () => {
    setEditingAssignment(null);
    setFormData({
      program: 'BSIT',
      batch: 'F23',
      section: 'A',
      course_code: courses.length > 0 ? courses[0].code : 'CS101',
      instructor: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingAssignment(item);
    setFormData({
      program: item.program || 'BSIT',
      batch: item.batch || 'F23',
      section: item.section || 'A',
      course_code: item.course_code || '',
      instructor: item.instructor || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const instName = (formData.instructor || '').trim();
    const cCode = (formData.course_code || '').trim().toUpperCase();
    const prog = (formData.program || '').trim().toUpperCase();
    const bat = (formData.batch || '').trim().toUpperCase();
    const sec = (formData.section || '').trim().toUpperCase();

    if (!cCode) {
      showBanner('Validation Error: Course selection is required.', 'danger');
      return;
    }
    if (!instName || instName.length < 2) {
      showBanner('Validation Error: Instructor name must have at least 2 characters.', 'danger');
      return;
    }
    if (!/[A-Za-z]/.test(instName)) {
      showBanner('Validation Error: Instructor name must contain letters and cannot be purely numeric or symbols.', 'danger');
      return;
    }
    if (!prog || prog.length < 2) {
      showBanner('Validation Error: Degree program must be at least 2 characters (e.g. BSCS, BSIT).', 'danger');
      return;
    }
    if (!bat || bat.length < 2) {
      showBanner('Validation Error: Batch must be at least 2 characters (e.g. F23, S24).', 'danger');
      return;
    }
    if (!sec) {
      showBanner('Validation Error: Section is required (e.g. A, B).', 'danger');
      return;
    }

    // Frontend duplicate check
    const isDuplicate = assignments.some((a) => {
      if (editingAssignment && a.id === editingAssignment.id) return false;
      return (
        a.program.toUpperCase() === prog &&
        a.batch.toUpperCase() === bat &&
        a.section.toUpperCase() === sec &&
        a.course_code.toUpperCase() === cCode
      );
    });

    if (isDuplicate) {
      showBanner(`Validation Error: An instructor assignment already exists for ${prog} ${bat} Section ${sec} in course ${cCode}.`, 'danger');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingAssignment) {
        const res = await fetch(`/api/instructor-assignments/${editingAssignment.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            program: prog,
            batch: bat,
            section: sec,
            course_code: cCode,
            instructor: instName,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(extractErrorMessage(errData, 'Failed to update assignment.'));
        }
        showBanner('Instructor assignment updated successfully.', 'success');
      } else {
        const res = await fetch('/api/instructor-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            program: prog,
            batch: bat,
            section: sec,
            course_code: cCode,
            instructor: instName,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(extractErrorMessage(errData, 'Failed to create assignment.'));
        }
        showBanner('Instructor assigned successfully.', 'success');
      }
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      showBanner(err.message, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/instructor-assignments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(errData, 'Failed to delete assignment.'));
      }
      showBanner('Instructor assignment removed.', 'success');
      setDeleteConfirm(null);
      onRefresh();
    } catch (err) {
      showBanner(err.message, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const courseTitleMap = useMemo(() => {
    const map = {};
    courses.forEach((c) => {
      map[c.code] = c.title;
    });
    return map;
  }, [courses]);

  // Department block -> batch blocks -> section blocks -> course rows.
  const departmentOf = (program) => {
    const key = String(program || '').toUpperCase();
    if (key === 'BSIT') return 'IT';
    if (key === 'BSSE') return 'SE';
    return 'CS';
  };

  const assignmentGroups = useMemo(() => {
    const deptMap = new Map();
    filteredAssignments.forEach((a) => {
      const dept = departmentOf(a.program);
      const batch = a.batch || '—';
      const section = a.section || '—';
      if (!deptMap.has(dept)) deptMap.set(dept, new Map());
      const batchMap = deptMap.get(dept);
      if (!batchMap.has(batch)) batchMap.set(batch, new Map());
      const sectionMap = batchMap.get(batch);
      if (!sectionMap.has(section)) sectionMap.set(section, []);
      sectionMap.get(section).push(a);
    });
    return Array.from(deptMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dept, batchMap]) => {
        const batches = Array.from(batchMap.entries())
          .sort(([a], [b]) => String(b).localeCompare(String(a)))
          .map(([batch, sectionMap]) => {
            const sections = Array.from(sectionMap.entries())
              .sort(([a], [b]) => String(a).localeCompare(String(b)))
              .map(([section, items]) => ({
                section,
                items: [...items].sort((x, y) => x.course_code.localeCompare(y.course_code)),
              }));
            return {
              batch,
              sections,
              total: sections.reduce((sum, s) => sum + s.items.length, 0),
            };
          });
        return {
          dept,
          batches,
          total: batches.reduce((sum, b) => sum + b.total, 0),
        };
      });
  }, [filteredAssignments]);

  return (
    <div className="itms-dash__main">
      <div className="itms-dash__pageHeader">
        <div>
          <h1 className="itms-dash__pageTitle">Instructor Course Assignments</h1>
        </div>
        <div className="toolbar__actions">
          <button type="button" className="btn btn--primary" onClick={handleOpenAdd}>
            + Assign Instructor
          </button>
        </div>
      </div>

      <section className="itms-dash__stats">
        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Total Section Allocations</span>
            <span className="itms-dash__statValue">{assignments.length}</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Active Faculty Members</span>
            <span className="itms-dash__statValue">
              {new Set(assignments.map((a) => a.instructor.trim()).filter(Boolean)).size}
            </span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Filtered Allocations</span>
            <span className="itms-dash__statValue">{filteredAssignments.length}</span>
          </div>
        </article>
      </section>

      {/* Toolbar / Search & Filters */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="toolbar__search" style={{ minWidth: '240px', flex: '1 1 240px' }}>
          <input
            type="text"
            placeholder="Search by instructor name or course..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="toolbar__actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <select
            className="form-control"
            style={{ width: 'auto', fontSize: '0.82rem', fontWeight: 600 }}
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
          >
            <option value="">All Programs</option>
            {distinctPrograms.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            className="form-control"
            style={{ width: 'auto', fontSize: '0.82rem', fontWeight: 600 }}
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
          >
            <option value="">All Batches</option>
            {distinctBatches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <select
            className="form-control"
            style={{ width: 'auto', fontSize: '0.82rem', fontWeight: 600 }}
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="">All Sections</option>
            {distinctSections.map((s) => (
              <option key={s} value={s}>Sec {s}</option>
            ))}
          </select>

          <select
            className="form-control"
            style={{ width: 'auto', fontSize: '0.82rem', fontWeight: 600 }}
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="">All Courses</option>
            {courses.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} &ndash; {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {assignmentGroups.length === 0 ? (
        <div className="card-table-wrapper" style={{ padding: '2rem', textAlign: 'center', color: 'var(--itms-text-muted)' }}>
          No instructor assignments found matching current filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {assignmentGroups.map((deptBlock) => (
            <div
              key={deptBlock.dept}
              className="card-table-wrapper"
              style={{ padding: '0.85rem 1.15rem' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  marginBottom: '0.6rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '2px solid var(--iiui-green-100, #d8ead9)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <strong style={{ color: 'var(--iiui-navy)', fontSize: '1rem' }}>
                    Department of {DEPARTMENT_LABELS[deptBlock.dept] || deptBlock.dept}
                  </strong>
                  <span className="badge badge--muted" style={{ fontWeight: 700 }}>
                    {deptBlock.batches.length} batch{deptBlock.batches.length === 1 ? '' : 'es'}
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--itms-text-muted)' }}>
                  {deptBlock.total} allocation{deptBlock.total === 1 ? '' : 's'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {deptBlock.batches.map((batchBlock) => (
                  <div key={`${deptBlock.dept}-${batchBlock.batch}`}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <strong style={{ color: 'var(--iiui-navy)', fontSize: '0.92rem' }}>
                          Batch {batchBlock.batch}
                        </strong>
                        <span className="badge badge--muted" style={{ fontWeight: 700 }}>
                          {batchBlock.sections.length} section{batchBlock.sections.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.76rem', color: 'var(--itms-text-muted)' }}>
                        {batchBlock.total} allocation{batchBlock.total === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {batchBlock.sections.map((sectionBlock) => (
                        <div
                          key={`${deptBlock.dept}-${batchBlock.batch}-${sectionBlock.section}`}
                          style={{
                            border: '1px solid var(--itms-border)',
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: '#ffffff',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.5rem',
                              padding: '0.45rem 0.8rem',
                              background: 'var(--iiui-green-50)',
                              borderBottom: '1px solid var(--itms-border)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className="badge badge--success" style={{ fontWeight: 700, padding: '2px 8px' }}>
                                Sec {sectionBlock.section}
                              </span>
                              <span style={{ fontSize: '0.78rem', color: 'var(--itms-text-secondary)' }}>
                                {Array.from(new Set(sectionBlock.items.map((a) => a.program))).join(' · ')}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.76rem', color: 'var(--itms-text-muted)' }}>
                              {sectionBlock.items.length} course{sectionBlock.items.length === 1 ? '' : 's'}
                            </span>
                          </div>

                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Course Code &amp; Title</th>
                                <th>Assigned Faculty Instructor</th>
                                <th style={{ width: '130px', textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sectionBlock.items.map((a) => (
                                <tr key={a.id}>
                                  <td>
                                    <strong style={{ color: 'var(--iiui-navy)', marginRight: '6px' }}>{a.course_code}</strong>
                                    <span style={{ color: 'var(--itms-text-muted)', fontSize: '0.85rem' }}>
                                      {courseTitleMap[a.course_code] || ''}
                                    </span>
                                  </td>
                                  <td>
                                    <strong style={{ color: '#0f172a' }}>{a.instructor}</strong>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                                      <button
                                        type="button"
                                        className="btn btn--sm btn--outline"
                                        onClick={() => handleOpenEdit(a)}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn--sm btn--danger"
                                        onClick={() => setDeleteConfirm(a)}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Instructor Assignment Modal */}
      <Modal
        isOpen={isModalOpen}
        title={editingAssignment ? 'Edit Instructor Assignment' : 'Assign Faculty Instructor to Course'}
        onClose={() => setIsModalOpen(false)}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Degree Program</label>
              <select
                className="form-control"
                value={formData.program}
                onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                required
              >
                <option value="BSCS">BSCS</option>
                <option value="BSIT">BSIT</option>
                <option value="BSSE">BSSE</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Batch</label>
              <input
                type="text"
                className="form-control"
                value={formData.batch}
                onChange={(e) => setFormData({ ...formData, batch: e.target.value.toUpperCase() })}
                placeholder="e.g. F23, F24"
                required
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Section</label>
              <input
                type="text"
                className="form-control"
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value.toUpperCase() })}
                placeholder="e.g. A, B, C"
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: 600 }}>Course</label>
            <select
              className="form-control"
              value={formData.course_code}
              onChange={(e) => setFormData({ ...formData, course_code: e.target.value })}
              required
            >
              {courses.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} &ndash; {c.title} ({c.credit_hours || 3} Cr. Hrs)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: 600 }}>Faculty Instructor</label>
            <input
              type="text"
              className="form-control"
              value={formData.instructor}
              onChange={(e) => setFormData({ ...formData, instructor: e.target.value })}
              placeholder="e.g. Dr. Adeel, Dr. Sajid Ali Khan"
              required
            />
            <small style={{ color: 'var(--itms-text-muted)', fontSize: '0.78rem' }}>
              Used in DCS Seating Sheets, datesheets, and Teacher Clash Guard detection.
            </small>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingAssignment ? 'Save Changes' : 'Assign Faculty'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        title="Confirm Assignment Deletion"
        onClose={() => setDeleteConfirm(null)}
      >
        <div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', color: 'var(--itms-text)' }}>
            Are you sure you want to remove the instructor assignment for <strong>{deleteConfirm?.course_code}</strong>{' '}
            ({deleteConfirm?.program} {deleteConfirm?.batch} Sec {deleteConfirm?.section}) with instructor{' '}
            <strong>{deleteConfirm?.instructor}</strong>?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => handleDelete(deleteConfirm.id)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete Assignment'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

