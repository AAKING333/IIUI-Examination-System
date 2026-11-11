import React, { useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../components/Modal.jsx';

const PRESET_PROGRAMS = ['BSCS', 'BSIT', 'BSSE'];
const PRESET_BATCHES = ['F24', 'F23', 'F22', 'F21'];
const PRESET_SECTIONS = ['A', 'B', 'C', 'D'];

export default function StudentsManagement({
  students = [],
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
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({
    roll_no: '',
    name: '',
    father_name: '',
    program: 'BSIT',
    batch: 'F23',
    section: 'A',
    faculty: 'Computing and Information Technology',
    enrolments: [],
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Distinct filters dynamically derived
  const distinctPrograms = useMemo(() => {
    const list = Array.from(new Set(students.map((s) => s.program).filter(Boolean)));
    return list.length > 0 ? list : PRESET_PROGRAMS;
  }, [students]);

  const distinctBatches = useMemo(() => {
    const list = Array.from(new Set(students.map((s) => s.batch).filter(Boolean)));
    return list.length > 0 ? list : PRESET_BATCHES;
  }, [students]);

  const distinctSections = useMemo(() => {
    const list = Array.from(new Set(students.map((s) => s.section).filter(Boolean))).sort();
    return list.length > 0 ? list : PRESET_SECTIONS;
  }, [students]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.roll_no.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.father_name && s.father_name.toLowerCase().includes(q));

      const matchProg = !programFilter || s.program === programFilter;
      const matchBatch = !batchFilter || s.batch === batchFilter;
      const matchSec = !sectionFilter || s.section === sectionFilter;
      const matchCourse =
        !courseFilter ||
        (s.enrolments && s.enrolments.some((e) => e.course === courseFilter)) ||
        (s.courses && s.courses.includes(courseFilter));

      return matchSearch && matchProg && matchBatch && matchSec && matchCourse;
    });
  }, [students, searchTerm, programFilter, batchFilter, sectionFilter, courseFilter]);

  const handleOpenAdd = () => {
    setEditingStudent(null);
    const nextNum = students.length + 1;
    setFormData({
      roll_no: `2024-CS-${String(nextNum).padStart(3, '0')}`,
      name: '',
      father_name: '',
      program: 'BSIT',
      batch: 'F23',
      section: 'A',
      faculty: 'Computing and Information Technology',
      enrolments: courses.slice(0, 3).map((c) => ({ course: c.code, type: 'regular' })),
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student) => {
    setEditingStudent(student);
    const existingEnrols =
      student.enrolments ||
      (student.courses || []).map((c) => ({ course: c, type: 'regular' }));

    setFormData({
      roll_no: student.roll_no,
      name: student.name,
      father_name: student.father_name || '',
      program: student.program || 'BSIT',
      batch: student.batch || 'F23',
      section: student.section || 'A',
      faculty: student.faculty || 'Computing and Information Technology',
      enrolments: existingEnrols.map((e) => ({ course: e.course, type: e.type || 'regular' })),
    });
    setIsModalOpen(true);
  };

  const handleAddEnrolmentRow = () => {
    if (courses.length === 0) return;
    const available = courses.find((c) => !formData.enrolments.some((e) => e.course === c.code));
    const nextCode = available ? available.code : courses[0].code;
    setFormData((prev) => ({
      ...prev,
      enrolments: [...prev.enrolments, { course: nextCode, type: 'regular' }],
    }));
  };

  const handleRemoveEnrolmentRow = (index) => {
    setFormData((prev) => ({
      ...prev,
      enrolments: prev.enrolments.filter((_, i) => i !== index),
    }));
  };

  const handleEnrolmentChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.enrolments];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, enrolments: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.roll_no.trim() || !formData.name.trim()) {
      showBanner('Roll number and student name are required.', 'danger');
      return;
    }
    if (formData.enrolments.length === 0) {
      showBanner('At least one course enrolment is required.', 'danger');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingStudent) {
        const res = await fetch(`/api/students/${editingStudent.roll_no}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name.trim(),
            father_name: formData.father_name.trim(),
            program: formData.program.trim(),
            batch: formData.batch.trim(),
            section: formData.section.trim().toUpperCase(),
            faculty: formData.faculty.trim(),
            enrolments: formData.enrolments,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        showBanner(`Student ${editingStudent.roll_no} updated successfully.`, 'success');
      } else {
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roll_no: formData.roll_no.trim().toUpperCase(),
            name: formData.name.trim(),
            father_name: formData.father_name.trim(),
            program: formData.program.trim(),
            batch: formData.batch.trim(),
            section: formData.section.trim().toUpperCase(),
            faculty: formData.faculty.trim(),
            enrolments: formData.enrolments,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        showBanner(`Student ${formData.roll_no.toUpperCase()} registered successfully.`, 'success');
      }
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      showBanner(`Operation failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (rollNo) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/students/${rollNo}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showBanner(`Student ${rollNo} removed successfully.`, 'success');
      setDeleteConfirm(null);
      onRefresh();
    } catch (err) {
      showBanner(`Delete failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const backStudentsCount = useMemo(() => {
    return students.filter((s) => (s.enrolments || []).some((e) => e.type === 'back')).length;
  }, [students]);

  return (
    <div className="itms-dash__main">
      <div className="itms-dash__pageHeader">
        <div>
          <h1 className="itms-dash__pageTitle">Students &amp; Course Enrolments Management</h1>
          <p className="itms-dash__pageSub">
            Manage student registrations, programs, batches, sections, and course enrolments with Regular &amp; Back-paper designations.
          </p>
        </div>
        <div className="toolbar__actions">
          <button type="button" className="btn btn--primary" onClick={handleOpenAdd}>
            <Plus size={16} />
            Register Student
          </button>
        </div>
      </div>

      <section className="itms-dash__stats">
        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Registered Students</span>
            <span className="itms-dash__statValue">{students.length}</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Back-Paper Candidates</span>
            <span className="itms-dash__statValue">{backStudentsCount}</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Filtered Results</span>
            <span className="itms-dash__statValue">{filteredStudents.length} Students</span>
          </div>
        </article>
      </section>

      {/* Toolbar / Search & Filters */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="toolbar__search" style={{ minWidth: '240px', flex: '1 1 240px' }}>
          <input
            type="text"
            placeholder="Search by Roll No, Name or Father Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="toolbar__actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {/* Program filter */}
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

          {/* Batch filter */}
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

          {/* Section filter */}
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

          {/* Course filter */}
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
              <th style={{ width: '130px' }}>Roll Number</th>
              <th>Student Name</th>
              <th>Father Name</th>
              <th style={{ width: '100px' }}>Program</th>
              <th style={{ width: '85px' }}>Batch</th>
              <th style={{ width: '85px', textAlign: 'center' }}>Section</th>
              <th>Enrolled Courses &amp; Status</th>
              <th style={{ width: '130px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.slice(0, 100).map((s) => {
              const enrols =
                s.enrolments || (s.courses || []).map((c) => ({ course: c, type: 'regular' }));

              return (
                <tr key={s.roll_no}>
                  <td>
                    <span className="badge badge--info" style={{ fontWeight: 700 }}>
                      {s.roll_no}
                    </span>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--iiui-navy)' }}>{s.name}</strong>
                  </td>
                  <td style={{ color: 'var(--itms-text-muted)', fontSize: '0.85rem' }}>
                    {s.father_name || '—'}
                  </td>
                  <td>
                    <span
                      className={`badge ${s.program === 'BSIT' ? 'badge--info' : s.program === 'BSSE' ? 'badge--warning' : 'badge--primary'}`}
                      style={{ fontWeight: 700, fontSize: '0.74rem' }}
                    >
                      {s.program || 'BSCS'}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge--muted" style={{ fontWeight: 700, fontSize: '0.74rem' }}>
                      {s.batch || 'F24'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      className="badge badge--success"
                      style={{ fontWeight: 700, fontSize: '0.74rem', padding: '2px 8px' }}
                    >
                      {s.section || 'A'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {enrols.map((e, idx) => (
                        <span
                          key={idx}
                          className={`badge ${e.type === 'back' ? 'badge--warning' : 'badge--outline'}`}
                          style={{
                            fontSize: '0.70rem',
                            padding: '2px 6px',
                            fontWeight: 600,
                            border: e.type === 'back' ? 'none' : '1px solid var(--itms-border)',
                          }}
                        >
                          {e.course}
                          {e.type === 'back' ? ' (Back)' : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn--sm btn--outline"
                        onClick={() => handleOpenEdit(s)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm btn--danger"
                        onClick={() => setDeleteConfirm(s.roll_no)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredStudents.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--itms-text-muted)' }}>
                  No students found matching current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filteredStudents.length > 100 && (
          <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--itms-text-muted)', borderTop: '1px solid var(--itms-border)' }}>
            Showing first 100 of {filteredStudents.length} students. Use filters above to narrow your view.
          </div>
        )}
      </div>

      {/* Add / Edit Student Modal */}
      <Modal
        isOpen={isModalOpen}
        title={editingStudent ? `Edit Student: ${editingStudent.roll_no}` : 'Register New Student'}
        onClose={() => setIsModalOpen(false)}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Roll Number</label>
              <input
                type="text"
                className="form-control"
                value={formData.roll_no}
                onChange={(e) => setFormData({ ...formData, roll_no: e.target.value.toUpperCase() })}
                placeholder="e.g. 2024-CS-001"
                required
                disabled={!!editingStudent}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Student Full Name</label>
              <input
                type="text"
                className="form-control"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Ahmed Khan"
                required
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Father Name</label>
              <input
                type="text"
                className="form-control"
                value={formData.father_name}
                onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
                placeholder="e.g. Farooq Ali Khan"
              />
            </div>
          </div>

          {/* Academic Placement: Program, Batch, Section */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '1rem',
              padding: '0.85rem',
              backgroundColor: '#f8fafc',
              borderRadius: 'var(--itms-radius-sm)',
              border: '1px solid var(--itms-border)',
            }}
          >
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Degree Program</label>
              <select
                className="form-control"
                value={formData.program}
                onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                required
              >
                <option value="BSCS">BSCS (Computer Science)</option>
                <option value="BSIT">BSIT (Information Technology)</option>
                <option value="BSSE">BSSE (Software Engineering)</option>
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

          {/* Enrolments List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                Course Enrolments &amp; Exam Status
              </label>
              <button
                type="button"
                className="btn btn--sm btn--outline"
                onClick={handleAddEnrolmentRow}
              >
                + Add Course
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {formData.enrolments.map((enrol, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    className="form-control"
                    style={{ flex: 1 }}
                    value={enrol.course}
                    onChange={(e) => handleEnrolmentChange(idx, 'course', e.target.value)}
                  >
                    {courses.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} &ndash; {c.title}
                      </option>
                    ))}
                  </select>

                  <select
                    className="form-control"
                    style={{ width: '130px', fontWeight: 600 }}
                    value={enrol.type}
                    onChange={(e) => handleEnrolmentChange(idx, 'type', e.target.value)}
                  >
                    <option value="regular">Regular</option>
                    <option value="back">Back-Paper</option>
                  </select>

                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    onClick={() => handleRemoveEnrolmentRow(idx)}
                    title="Remove course"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
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
              {isSubmitting ? 'Saving...' : editingStudent ? 'Save Changes' : 'Register Student'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        title="Confirm Student Deletion"
        onClose={() => setDeleteConfirm(null)}
      >
        <div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', color: 'var(--itms-text)' }}>
            Are you sure you want to remove student <strong>{deleteConfirm}</strong>? This action will
            unenroll the student from all registered examination papers.
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
              onClick={() => handleDelete(deleteConfirm)}
              disabled={isSubmitting}
            >
              <Trash2 size={14} />
              {isSubmitting ? 'Deleting...' : 'Delete Student'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
