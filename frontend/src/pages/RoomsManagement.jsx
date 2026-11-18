import React, { useState } from 'react';
import Modal from '../components/Modal.jsx';

const defaultForm = (room_type = 'hall') => ({
  name: '',
  department: 'CS',
  rows: 5,
  columns: 8,
  capacity: 40,
  reserve_capacity: 0,
  invigilators_required: 1,
  room_type,
});

export default function RoomsManagement({ rooms = [], onRefresh, showBanner }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [formData, setFormData] = useState(defaultForm());
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalRegularCapacity = rooms.reduce((acc, r) => acc + Number(r.capacity || 0), 0);
  const totalReserve = rooms.reduce((acc, r) => acc + Number(r.reserve_capacity || 0), 0);
  const totalUsableCapacity = rooms.reduce(
    (acc, r) => acc + Number(r.total_usable_seats ?? (Number(r.capacity || 0) + Number(r.reserve_capacity || 0))),
    0
  );

  const handleOpenAdd = () => {
    setEditingRoom(null);
    setFormData(defaultForm('hall'));
    setIsModalOpen(true);
  };

  const handleOpenEdit = (room) => {
    setEditingRoom(room);
    const capacity = Number(room.capacity || (room.rows || 0) * (room.columns || 0) || 0);
    setFormData({
      name: room.name || '',
      department: room.department || 'CS',
      rows: Number(room.rows || 0),
      columns: Number(room.columns || 0),
      capacity,
      reserve_capacity: Number(room.reserve_capacity || 0),
      invigilators_required: Number(room.invigilators_required || 1),
      room_type: room.room_type || (String(room.name || '').toLowerCase().includes('lab') ? 'lab' : 'hall'),
    });
    setIsModalOpen(true);
  };

  const handleDimensionsChange = (rows, cols) => {
    const r = parseInt(rows, 10) || 0;
    const c = parseInt(cols, 10) || 0;
    const calc = r * c;
    setFormData((prev) => ({
      ...prev,
      rows: r,
      columns: c,
      capacity: calc,
      reserve_capacity: prev.room_type === 'lab' || calc < 50 ? 0 : (prev.reserve_capacity || 10),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showBanner('Validation Error: Room name is required.', 'danger');
      return;
    }
    const rows = Number(formData.rows);
    const cols = Number(formData.columns);
    const cap = Number(formData.capacity) || (rows * cols);

    if (rows <= 0 || cols <= 0) {
      showBanner('Validation Error: Rows and columns must be greater than 0.', 'danger');
      return;
    }
    if (rows > 15) {
      showBanner(`Validation Error: Number of rows cannot exceed 15 (provided: ${rows}). Maximum allowed rows is 15.`, 'danger');
      return;
    }
    if (cols > 11) {
      showBanner(`Validation Error: Number of columns cannot exceed 11 (provided: ${cols}). Maximum allowed columns is 11.`, 'danger');
      return;
    }
    if (cap > 165) {
      showBanner(`Validation Error: Room capacity cannot exceed 165 seats (calculated: ${cap}). Maximum capacity is 15 rows × 11 columns (165 seats).`, 'danger');
      return;
    }
    if (cap < 1) {
      showBanner('Validation Error: Room capacity must be at least 1 seat.', 'danger');
      return;
    }

    const payload = {
      ...formData,
      name: formData.name.trim(),
      department: (formData.department || '').trim() || 'CS',
      rows: rows,
      columns: cols,
      capacity: cap,
      reserve_capacity: Number(formData.reserve_capacity || 0),
      invigilators_required: Number(formData.invigilators_required || 1),
    };

    setIsSubmitting(true);
    try {
      if (editingRoom) {
        const res = await fetch(`/api/rooms/${editingRoom.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = typeof errData.detail === 'string' ? errData.detail : (Array.isArray(errData.detail) ? errData.detail.map(d => d.msg).join(', ') : 'Update failed');
          throw new Error(errMsg);
        }
        showBanner(`Room "${payload.name}" updated successfully.`, 'success');
      } else {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = typeof errData.detail === 'string' ? errData.detail : (Array.isArray(errData.detail) ? errData.detail.map(d => d.msg).join(', ') : 'Creation failed');
          throw new Error(errMsg);
        }
        showBanner(`Room "${payload.name}" added successfully.`, 'success');
      }
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      showBanner(`Operation failed: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (roomId) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showBanner('Room removed successfully.', 'success');
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
          <h1 className="itms-dash__pageTitle">Examination Rooms &amp; Capacity Management</h1>
          <p className="itms-dash__pageSub">
            Configure physical exam halls/labs, departments, grid dimensions, regular capacity, reserve buffer, and invigilator requirements.
          </p>
        </div>
        <div className="toolbar__actions">
          <button type="button" className="btn btn--primary" onClick={handleOpenAdd}>
            + Add New Room
          </button>
        </div>
      </div>

      <section className="itms-dash__stats">
        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Configured Venues</span>
            <span className="itms-dash__statValue">{rooms.length}</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Total Regular Capacity</span>
            <span className="itms-dash__statValue">{totalRegularCapacity} seats</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Reserve Buffer Seats</span>
            <span className="itms-dash__statValue">+{totalReserve} seats</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Total Usable Capacity</span>
            <span className="itms-dash__statValue">{totalUsableCapacity} seats</span>
          </div>
        </article>
      </section>

      <div className="card-table-wrapper">
        <table className="data-table data-table--wide data-table--sticky-actions">
          <thead>
            <tr>
              <th>Dept</th>
              <th>Room / Hall</th>
              <th>Category</th>
              <th>Grid Dimensions</th>
              <th>Regular Capacity</th>
              <th>Reserve Buffer</th>
              <th>Total Usable Seats</th>
              <th>Required Invigilators</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => {
              const regular = Number(r.capacity || 0);
              const reserve = Number(r.reserve_capacity || 0);
              const totalUsable = Number(r.total_usable_seats ?? regular + reserve);
              const isLab = r.room_type === 'lab' || String(r.name || '').toLowerCase().includes('lab');
              return (
                <tr key={r.id}>
                  <td>
                    <span className="badge badge--info" style={{ fontWeight: 700 }}>{r.department || 'CS'}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--iiui-navy)' }}>{r.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--itms-text-muted)' }}>{r.id}</div>
                  </td>
                  <td>
                    {isLab ? (
                      <span className="badge badge--success" style={{ fontWeight: 600 }}>Computer Lab</span>
                    ) : (
                      <span className="badge badge--secondary" style={{ fontWeight: 600 }}>Examination Hall</span>
                    )}
                  </td>
                  <td>{r.rows} Rows &times; {r.columns} Columns</td>
                  <td><strong>{regular}</strong> seats</td>
                  <td>{reserve > 0 ? `+${reserve} reserve` : '0 reserve'}</td>
                  <td><strong>{totalUsable}</strong> seats</td>
                  <td>
                    <span className="badge badge--outline" style={{ fontWeight: 700 }}>
                      {Number(r.invigilators_required || 1)} {Number(r.invigilators_required || 1) === 1 ? 'Invigilator' : 'Invigilators'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={() => handleOpenEdit(r)}
                        title="Edit room configuration"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => setDeleteConfirm(r)}
                        title="Delete room"
                        disabled={rooms.length <= 1}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                  No examination rooms configured. Click "Add New Room" above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        title={editingRoom ? `Edit Room: ${editingRoom.name}` : 'Add Examination Room'}
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : editingRoom ? 'Update Room' : 'Create Room'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Room / Hall Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Room 25 or Lab 2"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <select
                className="form-control"
                value={formData.department || 'CS'}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              >
                <option value="CS">CS Dept</option>
                <option value="IT">IT Dept</option>
                <option value="CS/IT">CS/IT</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Room Category / Type</label>
              <select
                className="form-control"
                value={formData.room_type || 'hall'}
                onChange={(e) => {
                  const room_type = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    room_type,
                    reserve_capacity: room_type === 'lab' || (prev.capacity || 0) < 50 ? 0 : (prev.reserve_capacity || 10),
                  }));
                }}
              >
                <option value="hall">Examination Hall (Room)</option>
                <option value="lab">Computer Lab (Lab)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Required Invigilators</label>
              <input
                type="number"
                min="1"
                max="10"
                className="form-control"
                value={formData.invigilators_required}
                onChange={(e) => setFormData({ ...formData, invigilators_required: parseInt(e.target.value, 10) || 1 })}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Number of Rows (Max 15)</label>
              <input
                type="number"
                min="1"
                max="15"
                className="form-control"
                value={formData.rows}
                onChange={(e) => handleDimensionsChange(e.target.value, formData.columns)}
                required
              />
              <span className="form-hint">Physical room row count (1 to 15 rows).</span>
            </div>
            <div className="form-group">
              <label className="form-label">Number of Columns (Max 11)</label>
              <input
                type="number"
                min="1"
                max="11"
                className="form-control"
                value={formData.columns}
                onChange={(e) => handleDimensionsChange(formData.rows, e.target.value)}
                required
              />
              <span className="form-hint">Physical room column count (1 to 11 columns).</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Regular Capacity (Max 165)</label>
              <input
                type="number"
                min="1"
                max="165"
                className="form-control"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value, 10) || 0 })}
                required
              />
              <span className="form-hint">Default: Rows &times; Columns ({Number(formData.rows || 0) * Number(formData.columns || 0)} seats, max 165).</span>
            </div>
            <div className="form-group">
              <label className="form-label">Reserve Buffer</label>
              <input
                type="number"
                min="0"
                max="100"
                className="form-control"
                value={formData.reserve_capacity}
                onChange={(e) => setFormData({ ...formData, reserve_capacity: parseInt(e.target.value, 10) || 0 })}
                disabled={formData.room_type === 'lab'}
              />
              <span className="form-hint">
                Buffer seats reserved only for large halls (50+ capacity, e.g. Room 18 &amp; 26) hosting repeater courses.
              </span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Total Usable Seats</label>
            <input
              type="text"
              className="form-control"
              value={`${Number(formData.capacity || 0) + Number(formData.reserve_capacity || 0)} seats`}
              readOnly
            />
            <span className="form-hint">Regular capacity + reserve buffer.</span>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteConfirm)}
        title="Confirm Room Deletion"
        onClose={() => setDeleteConfirm(null)}
        footer={
          <>
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
              {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: '0.88rem' }}>
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong> (Regular:{' '}
          {deleteConfirm?.capacity}, Reserve: {deleteConfirm?.reserve_capacity || 0}, Total usable:{' '}
          {(deleteConfirm?.capacity || 0) + (deleteConfirm?.reserve_capacity || 0)})?
        </p>
        <p style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--itms-danger)' }}>
          This will invalidate any cached seating plan allocations containing this room.
        </p>
      </Modal>
    </div>
  );
}

