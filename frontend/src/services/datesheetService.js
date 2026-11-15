import { http } from './apiClient.js';

/**
 * Service methods for Datesheet management and exports.
 */
export const datesheetService = {
  getDatesheet: () => http.get('/datesheet'),
  generateDatesheet: () => http.post('/datesheet/generate'),
  getVersions: () => http.get('/datesheet/versions'),
  getExcelExportUrl: () => '/api/datesheet/export.xlsx',
  getPdfExportUrl: () => '/api/datesheet/export.pdf',
};
