import { http } from './apiClient.js';

/**
 * Service methods for Exam Operations (Invigilation Duties, UMC Reports, Roll Slips, Verifications).
 */
export const examOpsService = {
  // Invigilation Duties
  getDuties: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return http.get(`/invigilation/duties${qs ? `?${qs}` : ''}`);
  },
  getRoster: () => http.get('/invigilation/roster'),
  getFaculty: () => http.get('/invigilation/faculty'),
  getSlotRequirements: (slotId) =>
    http.get(`/invigilation/slots/${encodeURIComponent(slotId)}/requirements`),
  generateDuties: (options = {}) =>
    http.post('/invigilation/generate', {
      slot_ids: [],
      preserve_manual: true,
      duty_cap: 4,
      release_invalid_manual: false,
      ...options,
    }),
  recalculateDuties: (options = {}) =>
    http.post('/invigilation/recalculate', {
      slot_ids: [],
      preserve_manual: true,
      duty_cap: 4,
      release_invalid_manual: false,
      ...options,
    }),
  createDuty: (data) => http.post('/invigilation/duties', data),
  updateDuty: (id, data) => http.patch(`/invigilation/duties/${encodeURIComponent(id)}`, data),
  deleteDuty: (id) => http.delete(`/invigilation/duties/${encodeURIComponent(id)}`),

  // UMC Reports
  getUMCReports: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return http.get(`/umc${qs ? `?${qs}` : ''}`);
  },
  getUMCReport: (id) => http.get(`/umc/${encodeURIComponent(id)}`),
  createUMCReport: (data) => http.post('/umc', data),
  updateUMCReport: (id, data) => http.patch(`/umc/${encodeURIComponent(id)}`, data),
  getUMCPdfUrl: (id) => `/api/umc/${encodeURIComponent(id)}/pdf`,

  // Verifications & Slips
  getVerifications: (search = '') => {
    return http.get(`/student-verifications${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  },
  getRollSlip: (rollNo) => http.get(`/roll-slip/${encodeURIComponent(rollNo)}`),
  getRollSlipPdfUrl: (rollNo) => `/api/roll-slip/${encodeURIComponent(rollNo)}/pdf`,
  getAllRollSlipsPdfUrl: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return `/api/roll-slips/all-pdf${qs ? `?${qs}` : ''}`;
  },
};
