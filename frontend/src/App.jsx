import React, { useState, useEffect, useCallback } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import AdminTopbar from './components/AdminTopbar.jsx';
import AdminSidebar from './components/AdminSidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import RoomsManagement from './pages/RoomsManagement.jsx';
import CoursesManagement from './pages/CoursesManagement.jsx';
import StudentsManagement from './pages/StudentsManagement.jsx';
import InstructorAssignmentsPage from './pages/InstructorAssignmentsPage.jsx';
import TimeSlotsManagement from './pages/TimeSlotsManagement.jsx';
import DatesheetPage from './pages/DatesheetPage.jsx';
import SeatingPlanPage from './pages/SeatingPlanPage.jsx';
import RollSlipPage from './pages/RollSlipPage.jsx';
import StudentVerificationPage from './pages/StudentVerificationPage.jsx';
import './styles/tokens.css';
import './styles/dashboard.css';
import './styles/admin.css';

export default function App() {
  const [currentView, setCurrentView] = useState('slots');
  const [isNavExpanded, setIsNavExpanded] = useState(true);

  // Core Data
  const [health, setHealth] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [courses, setCourses] = useState([]);
  const [instructorAssignments, setInstructorAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [slots, setSlots] = useState([]);
  const [datesheet, setDatesheet] = useState({ datesheet: [], unplaced: [] });

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const showBanner = useCallback((message, type = 'info', options = {}) => {
    const toastType = type === 'danger' ? 'error' : type;
    const toastFn = typeof toast[toastType] === 'function' ? toast[toastType] : toast.info;
    const defaultOptions = toastType === 'error' ? { autoClose: 6500 } : {};
    toastFn(message, { ...defaultOptions, ...options });
  }, []);

  // Load all foundational records
  const loadInitialData = useCallback(async () => {
    try {
      const [hRes, rRes, cRes, sRes, slotRes, dRes, iaRes] = await Promise.all([
        fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/rooms').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/courses').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/students').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/time-slots').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/datesheet').then((r) => (r.ok ? r.json() : { datesheet: [], unplaced: [] })),
        fetch('/api/instructor-assignments').then((r) => (r.ok ? r.json() : [])),
      ]);

      setHealth(hRes);
      setRooms(rRes);
      setCourses(cRes);
      setStudents(sRes);
      setSlots(slotRes);
      setDatesheet(dRes);
      setInstructorAssignments(iaRes);
    } catch (err) {
      showBanner(`System notice: Could not connect to API server (${err.message})`, 'danger');
    }
  }, [showBanner]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Generate Datesheet
  const handleGenerateDatesheet = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/datesheet/generate', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Datesheet generation failed.');
      }
      const data = await res.json();
      setDatesheet(data);
      showBanner(
        data.unplaced?.length
          ? `Datesheet generated with ${data.unplaced.length} unplaced course(s). Check diagnostic warnings.`
          : `Datesheet successfully generated: all ${data.datesheet?.length || 0} examination papers placed!`,
        data.unplaced?.length ? 'warning' : 'success'
      );
      loadInitialData();
    } catch (err) {
      const rawMsg = err.message || 'Datesheet generation failed.';
      const match = rawMsg.match(/(\d+)\s+course\(s\)/i);
      const unplacedCount = match ? match[1] : null;

      if (unplacedCount) {
        showBanner(
          <div className="itms-toast-card">
            <div className="itms-toast-card__header">
              <span className="itms-toast-card__title">Scheduling Conflict</span>
              <span className="itms-toast-card__badge">{unplacedCount} Unplaced</span>
            </div>
            <div className="itms-toast-card__desc">
              Not enough exam dates to place all courses without student clashes.
            </div>
            <div className="itms-toast-card__action">
              <strong>IIUI Rule:</strong> Max 1 exam/day per student. Please configure at least 5 separate dates in Time Slots.
            </div>
          </div>,
          'danger',
          { autoClose: 7500 }
        );
      } else {
        const cleanMsg = rawMsg
          .replace(/^Datesheet generation error:\s*/i, '')
          .replace(/^Critical Error:\s*/i, '');
        showBanner(cleanMsg, 'danger');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset to seed data
  const handleResetData = async () => {
    if (!window.confirm('Reset database to default seed state? Any custom entries will be restored to seed defaults.')) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch('/api/reset-data', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      await loadInitialData();
      showBanner('Database successfully reset to initial factory seed data.', 'success');
    } catch (err) {
      showBanner(`Reset failed: ${err.message}`, 'danger');
    } finally {
      setIsResetting(false);
    }
  };

  const totalCapacity = rooms.reduce((acc, r) => acc + (r.capacity || 0), 0);

  return (
    <div className="itms-portal-shell">
      <AdminTopbar />

      <ToastContainer
        position="top-right"
        autoClose={3500}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        icon={({ type }) => {
          if (type === 'success') {
            return (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#16a34a" />
                <path
                  d="M8 12.5l2.8 2.8 5.7-5.8"
                  stroke="#ffffff"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          }
          if (type === 'error') {
            return (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#dc2626" />
                <path
                  d="M8.5 8.5l7 7M15.5 8.5l-7 7"
                  stroke="#ffffff"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          }
          if (type === 'info') {
            return (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#2563eb" />
                <path
                  d="M12 7.5v6M12 16.5v.5"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            );
          }
          if (type === 'warning') {
            return (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#d97706" />
                <path
                  d="M12 7.5v6M12 16.5v.5"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            );
          }
          return null;
        }}
      />

      <div className="itms-portal-body">
        <AdminSidebar
          active={currentView}
          onNavigate={(viewId) => setCurrentView(viewId)}
          expanded={isNavExpanded}
          onToggle={() => setIsNavExpanded((prev) => !prev)}
        />

        <main className="itms-portal-content">
          {/* Dashboard code is preserved in src/pages/Dashboard.jsx but excluded from active portal */}
          {false && currentView === 'dashboard' && (
            <Dashboard
              health={health}
              studentsCount={students.length}
              coursesCount={courses.length}
              roomsCount={rooms.length}
              slotsCount={slots.length}
              datesheetCount={datesheet.datesheet?.length || 0}
              totalCapacity={totalCapacity}
              onNavigate={setCurrentView}
              onGenerateDatesheet={handleGenerateDatesheet}
              isGenerating={isGenerating}
            />
          )}


          {currentView === 'slots' && (
            <TimeSlotsManagement
              slots={slots}
              onRefresh={loadInitialData}
              showBanner={showBanner}
            />
          )}

          {currentView === 'rooms' && (
            <RoomsManagement
              rooms={rooms}
              onRefresh={loadInitialData}
              showBanner={showBanner}
            />
          )}

          {currentView === 'courses' && (
            <CoursesManagement
              courses={courses}
              onRefresh={loadInitialData}
              showBanner={showBanner}
            />
          )}

          {currentView === 'instructors' && (
            <InstructorAssignmentsPage
              assignments={instructorAssignments}
              courses={courses}
              onRefresh={loadInitialData}
              showBanner={showBanner}
            />
          )}

          {currentView === 'students' && (
            <StudentsManagement
              students={students}
              courses={courses}
              onRefresh={loadInitialData}
              showBanner={showBanner}
            />
          )}

          {(currentView === 'datesheet' || currentView === 'verification') && (
            <DatesheetPage
              datesheet={datesheet}
              onGenerate={handleGenerateDatesheet}
              isGenerating={isGenerating}
              coursesCount={courses.length}
              studentsCount={students.length}
              roomsCount={rooms.length}
            />
          )}

          {currentView === 'seating' && (
            <SeatingPlanPage
              slots={slots}
              datesheet={datesheet}
              courses={courses}
            />
          )}

          {currentView === 'rollslip' && (
            <RollSlipPage
              showBanner={showBanner}
            />
          )}
        </main>
      </div>
    </div>
  );
}
