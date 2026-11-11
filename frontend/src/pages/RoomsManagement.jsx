import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../components/Modal.jsx';

export default function RoomsManagement({ rooms = [], onRefresh, showBanner }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [formData, setFormData] = useState({ name: '', rows: 6, columns: 10, capacity: 60 });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalCapacity = rooms.reduce((acc, r) => acc + (r.capacity || 0), 0);
  const avgCapacity = rooms.length ? Math.round(totalCapacity / rooms.length) : 0;

  const handleOpenAdd = () => {
    setEditingRoom(null);
    setFormData({ name: '', rows: 6, columns: 10, capacity: 60 });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (room) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      rows: room.rows,
      columns: room.columns,
      capacity: room.capacity || room.rows * room.columns,
    });
    setIsModalOpen(true);
  };

  const handleDimensionsChange = (rows, cols) => {
    const r = parseInt(rows, 10) || 0;
    const c = parseInt(cols, 10) || 0;
    setFormData((prev) => ({
      ...prev,
      rows: r,
      columns: c,
      capacity: r * c,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showBanner('Room name is required.', 'danger');
      return;
    }
    if (formData.rows <= 0 || formData.columns <= 0) {
      showBanner('Rows and columns must be greater than 0.', 'danger');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingRoom) {
        const res = await fetch(`/api/rooms/${editingRoom.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error(await res.text());
        showBanner(`Room "${formData.name}" updated successfully.`, 'success');
      } else {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error(await res.text());
        showBanner(`Room "${formData.name}" added successfully.`, 'success');
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
            Configure physical exam halls, grid dimensions (rows &times; columns), and seating thresholds.
          </p>
        </div>
        <div className="toolbar__actions">
          <button type="button" className="btn btn--primary" onClick={handleOpenAdd}>
            <Plus size={16} />
            Add New Room
          </button>
        </div>
      </div>

      <section className="itms-dash__stats">
        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Configured Halls</span>
            <span className="itms-dash__statValue">{rooms.length}</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Total Session Capacity</span>
            <span className="itms-dash__statValue">{totalCapacity} seats</span>
          </div>
        </article>

        <article className="itms-dash__statCard">
          <div className="itms-dash__statBody">
            <span className="itms-dash__statLabel">Average Capacity / Hall</span>
            <span className="itms-dash__statValue">{avgCapacity} seats</span>
          </div>
        </article>
      </section>

      <div className="card-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Room ID</th>
              <th>Hall Name</th>
              <th>Grid Dimensions</th>
              <th>Total Capacity</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="badge badge--info">{r.id}</span>
                </td>
                <td>
                  <strong>{r.name}</strong>
                </td>
                <td>
                  {r.rows} Rows &times; {r.columns} Columns
                </td>
                <td>
                  <strong>{r.capacity}</strong> seats
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
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
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
        title={editingRoom ? `Edit Hall: ${editingRoom.name}` : 'Add Examination Room'}
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
              {isSubmitting ? 'Saving...' : editingRoom ? 'Update Hall' : 'Create Hall'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Hall Name / Identifier</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Room D or Examination Hall 1"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Number of Rows</label>
              <input
                type="number"
                min="1"
                max="50"
                className="form-control"
                value={formData.rows}
                onChange={(e) => handleDimensionsChange(e.target.value, formData.columns)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Number of Columns</label>
              <input
                type="number"
                min="1"
                max="50"
                className="form-control"
                value={formData.columns}
                onChange={(e) => handleDimensionsChange(formData.rows, e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Total Seating Capacity</label>
            <input
              type="number"
              min="1"
              max="2500"
              className="form-control"
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value, 10) || 0 })}
            />
            <span className="form-hint">
              Default is calculated as Rows &times; Columns ({formData.rows * formData.columns} seats).
            </span>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteConfirm)}
        title="Confirm Hall Deletion"
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
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong> (Capacity:{' '}
          {deleteConfirm?.capacity} seats)?
        </p>
        <p style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--itms-danger)' }}>
          This will invalidate any cached seating plan allocations containing this room.
        </p>
      </Modal>
    </div>
  );
}

