import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../components/Modal.jsx';

export default function CoursesManagement({ courses = [], onRefresh, showBanner }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    credit_hours: 3,
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalRegular = courses.reduce((acc, c) => acc + (c.regular_students || 0), 0);
  const totalBack = courses.reduce((acc, c) => acc + (c.back_students || 0), 0);

  const handleOpenAdd = () => {
    setEditingCourse(null);
    setFormData({
      code: '',
      title: '',
      credit_hours: 3,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (course) => {
    setEditingCourse(course);
    setFormData({
      code: course.code,
      title: course.title,
      credit_hours: course.credit_hours || 3,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.title.trim()) {
      showBanner('Course code and title are required.', 'danger');
      return;
    }

    const cr = parseInt(formData.credit_hours, 10);
    if (isNaN(cr) || cr < 1 || cr > 6) {
      showBanner('Credit hours must be between 1 and 6.', 'danger');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCourse) {
        const res = await fetch(`/api/courses/${editingCourse.code}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title.trim(),
            credit_hours: cr,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        showBanner(`Course ${editingCourse.code} updated successfully.`, 'success');
      } else {
        const res = await fetch('/api/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: formData.code.trim().toUpperCase(),
            title: formData.title.trim(),
            credit_hours: cr,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        showBanner(`Course ${formData.code.toUpperCase()} created successfully.`, 'success');
      }
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      showBanner(`Operation failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (code) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/courses/${code}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showBanner(`Course ${code} deleted successfully.`, 'success');
      setDeleteConfirm(null);
      onRefresh();
    } catch (err) {
      showBanner(`Delete failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="itms-dash__main">
      <div className="itms-dash__pageHeader">
        <div>
          <h1 className="itms-dash__pageTitle">Academic Courses Directory</h1>
          <p className="itms-dash__pageSub">
            Official university courses catalog defining course codes, titles, and credit hours.
          </p>
        </div>
        <div className="toolbar__actions">
          <button type="button" className="btn btn--primary" onClick={handleOpenAdd}>
            <Plus size={16} />
            Add New Course
          </button>
        </div>
      </div>

      <section className="itms-dash__stats">
        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Courses Registered</span>
            <span className="itms-dash__statValue">{courses.length}</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Regular Enrolments</span>
            <span className="itms-dash__statValue">{totalRegular}</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Back-Paper Registrations</span>
            <span className="itms-dash__statValue">{totalBack}</span>
          </div>
        </article>
      </section>

      <div className="card-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '130px' }}>Course Code</th>
              <th>Course Title</th>
              <th style={{ width: '140px', textAlign: 'center' }}>Credit Hours</th>
              <th style={{ width: '220px' }}>Enrolment Status</th>
              <th style={{ width: '140px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.code}>
                <td>
                  <span className="badge badge--info" style={{ fontWeight: 700, letterSpacing: '0.5px' }}>
                    {c.code}
                  </span>
                </td>
                <td>
                  <strong style={{ fontSize: '0.94rem', color: 'var(--iiui-navy)' }}>{c.title}</strong>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span
                    className="badge badge--muted"
                    style={{ fontSize: '0.82rem', fontWeight: 700, padding: '3px 10px', backgroundColor: '#f1f5f9' }}
                  >
                    {c.credit_hours || 3} Cr. Hrs
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge--success" style={{ fontSize: '0.74rem' }}>
                      {c.regular_students || 0} Regular
                    </span>
                    {c.back_students > 0 && (
                      <span className="badge badge--warning" style={{ fontSize: '0.74rem' }}>
                        {c.back_students} Back
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn btn--sm btn--outline"
                      onClick={() => handleOpenEdit(c)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => setDeleteConfirm(c.code)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--itms-text-muted)' }}>
                  No courses registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Course Modal */}
      <Modal
        isOpen={isModalOpen}
        title={editingCourse ? `Edit Course ${editingCourse.code}` : 'Add New Academic Course'}
        onClose={() => setIsModalOpen(false)}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label className="form-label" style={{ fontWeight: 600 }}>Course Code</label>
            <input
              type="text"
              className="form-control"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g. CS101, IT201, MA101"
              required
              disabled={!!editingCourse}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: 600 }}>Course Title</label>
            <input
              type="text"
              className="form-control"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Introduction to Programming"
              required
            />
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: 600 }}>Credit Hours</label>
            <input
              type="number"
              min="1"
              max="6"
              className="form-control"
              value={formData.credit_hours}
              onChange={(e) => setFormData({ ...formData, credit_hours: e.target.value })}
              placeholder="e.g. 3 or 4"
              required
            />
            <small style={{ color: 'var(--itms-text-muted)', fontSize: '0.78rem' }}>
              Standard university theory/lab course credit weight (e.g. 2, 3, or 4).
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
              {isSubmitting ? 'Saving...' : editingCourse ? 'Save Changes' : 'Create Course'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        title="Confirm Course Deletion"
        onClose={() => setDeleteConfirm(null)}
      >
        <div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', color: 'var(--itms-text)' }}>
            Are you sure you want to delete course <strong>{deleteConfirm}</strong>? This will remove all
            associated instructor assignments and student enrolments.
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
              {isSubmitting ? 'Deleting...' : 'Delete Course'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
