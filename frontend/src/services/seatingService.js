import { http } from './apiClient.js';

/**
 * Service methods for Seating Plan management.
 */
export const seatingService = {
  getSeatingPlan: (slotId) => http.get(`/seating-plan?slot_id=${encodeURIComponent(slotId)}`),
  saveCustomPlan: (plan) => http.put('/seating-plan', plan),
  regeneratePlan: (slotId) => http.post(`/seating-plan/generate?slot_id=${encodeURIComponent(slotId)}`),
  getExcelExportUrl: (slotId) => `/api/seating-plan/export.xlsx?slot_id=${encodeURIComponent(slotId)}`,
};
