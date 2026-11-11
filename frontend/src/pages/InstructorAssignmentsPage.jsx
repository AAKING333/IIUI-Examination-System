import React, { useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../components/Modal.jsx';

const PRESET_PROGRAMS = ['BSCS', 'BSIT', 'BSSE'];
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
    if (!formData.instructor.trim() || !formData.course_code.trim()) {
      showBanner('Course and instructor name are required.', 'danger');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingAssignment) {
        const res = await fetch(`/api/instructor-assignments/${editingAssignment.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            program: formData.program.trim().toUpperCase(),
            batch: formData.batch.trim().toUpperCase(),
            section: formData.section.trim().toUpperCase(),
            course_code: formData.course_code.trim().toUpperCase(),
            instructor: formData.instructor.trim(),
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        showBanner('Instructor assignment updated successfully.', 'success');
      } else {
        const res = await fetch('/api/instructor-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            program: formData.program.trim().toUpperCase(),
            batch: formData.batch.trim().toUpperCase(),
            section: formData.section.trim().toUpperCase(),
            course_code: formData.course_code.trim().toUpperCase(),
            instructor: formData.instructor.trim(),
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        showBanner('Instructor assigned successfully.', 'success');
      }
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      showBanner(`Operation failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/instructor-assignments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showBanner('Instructor assignment removed.', 'success');
      setDeleteConfirm(null);
      onRefresh();
    } catch (err) {
      showBanner(`Delete failed: ${err.message}`, 'danger');
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

  return (
    <div className="itms-dash__main">
      <div className="itms-dash__pageHeader">
        <div>
          <h1 className="itms-dash__pageTitle">Instructor Course Assignments</h1>
          <p className="itms-dash__pageSub">
            Assign faculty instructors to courses by degree program, batch cohort, and section.
          </p>
        </div>
        <div className="toolbar__actions">
          <button type="button" className="btn btn--primary" onClick={handleOpenAdd}>
            <Plus size={16} />
            Assign Instructor
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

      <div className="card-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '110px' }}>Program</th>
              <th style={{ width: '90px' }}>Batch</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Section</th>
              <th>Course Code &amp; Title</th>
              <th>Assigned Faculty Instructor</th>
              <th style={{ width: '130px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssignments.map((a) => (
              <tr key={a.id}>
                <td>
                  <span
                    className={`badge ${a.program === 'BSIT' ? 'badge--info' : a.program === 'BSSE' ? 'badge--warning' : 'badge--primary'}`}
                    style={{ fontWeight: 700 }}
                  >
                    {a.program}
                  </span>
                </td>
                <td>
                  <span className="badge badge--muted" style={{ fontWeight: 700 }}>
                    {a.batch}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className="badge badge--success" style={{ fontWeight: 700, padding: '2px 8px' }}>
                    Sec {a.section}
                  </span>
                </td>
                <td>
                  <div>
                    <strong style={{ color: 'var(--iiui-navy)', marginRight: '6px' }}>{a.course_code}</strong>
                    <span style={{ color: 'var(--itms-text-muted)', fontSize: '0.85rem' }}>
                      {courseTitleMap[a.course_code] || ''}
                    </span>
                  </div>
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
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredAssignments.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--itms-text-muted)' }}>
                  No instructor assignments found matching current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
              <Trash2 size={14} />
              {isSubmitting ? 'Deleting...' : 'Delete Assignment'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

