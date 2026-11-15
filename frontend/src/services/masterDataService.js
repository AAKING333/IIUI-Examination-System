import { http } from './apiClient.js';

/**
 * Service methods for Master Data (Rooms, Courses, Assignments, Students, Slots).
 */
export const masterDataService = {
  // Rooms
  getRooms: () => http.get('/rooms'),
  createRoom: (data) => http.post('/rooms', data),
  updateRoom: (id, data) => http.put(`/rooms/${encodeURIComponent(id)}`, data),
  deleteRoom: (id) => http.delete(`/rooms/${encodeURIComponent(id)}`),

  // Courses
  getCourses: () => http.get('/courses'),
  createCourse: (data) => http.post('/courses', data),
  updateCourse: (code, data) => http.put(`/courses/${encodeURIComponent(code)}`, data),
  deleteCourse: (code) => http.delete(`/courses/${encodeURIComponent(code)}`),

  // Instructor Assignments
  getAssignments: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return http.get(`/instructor-assignments${qs ? `?${qs}` : ''}`);
  },
  createAssignment: (data) => http.post('/instructor-assignments', data),
  updateAssignment: (id, data) => http.put(`/instructor-assignments/${encodeURIComponent(id)}`, data),
  deleteAssignment: (id) => http.delete(`/instructor-assignments/${encodeURIComponent(id)}`),

  // Students
  getStudents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return http.get(`/students${qs ? `?${qs}` : ''}`);
  },
  getStudent: (rollNo) => http.get(`/students/${encodeURIComponent(rollNo)}`),
  createStudent: (data) => http.post('/students', data),
  updateStudent: (rollNo, data) => http.put(`/students/${encodeURIComponent(rollNo)}`, data),
  deleteStudent: (rollNo) => http.delete(`/students/${encodeURIComponent(rollNo)}`),

  // Time Slots
  getTimeSlots: () => http.get('/time-slots'),
  createTimeSlot: (data) => http.post('/time-slots', data),
  updateTimeSlot: (id, data) => http.put(`/time-slots/${encodeURIComponent(id)}`, data),
  deleteTimeSlot: (id) => http.delete(`/time-slots/${encodeURIComponent(id)}`),
  clearAllTimeSlots: () => http.delete('/time-slots'),
  generateSlots: (params) => http.post('/time-slots/generate', params),
  createPresetSlots: (params) => http.post('/time-slots/presets', params),
  bulkDeleteSlots: (ids) => http.post('/time-slots/bulk-delete', { slot_ids: ids }),
  bulkShiftSlots: (ids, days) => http.post('/time-slots/bulk-shift', { slot_ids: ids, shift_days: days }),

  // System
  getHealth: () => http.get('/health'),
  resetData: () => http.post('/reset-data'),
};
