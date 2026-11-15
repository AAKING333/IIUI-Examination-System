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
  generateDuties: (slotIds = []) => http.post('/invigilation/generate', { slot_ids: slotIds }),

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
