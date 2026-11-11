# IIUI Examination Management Portal — Production Edition

Enterprise administrative portal built for the **Department of Computer Science & Information Technology, International Islamic University Islamabad (IIUI)**.

Engineered with **React (Vite)** + **FastAPI**, styled in adherence to the official IIUI design system inspired by the ITMS Admin Console:
- Institutional palette (:root `--iiui-green: #1a5f2a`, `--iiui-navy: #192f59`, emblem gold `--iiui-gold: #c9a227`).
- Collapsible sidebar navigation with `lucide-react` iconography.
- Complete CRUD systems for Rooms & Capacity, Students & Enrolments, Academic Courses, and Time Slots.
- Back-paper rule validation engine with collision-free Datesheet and Seating Plan matrix.
- **Roll Number Slip Download Separation:** As per examination security requirements, roll number slip downloads are omitted from this administrative portal. Invigilators and controllers have access to a dedicated **Exam Allocations & Seating Verification** audit roster.

---

## Key Modules & Capabilities

### 1. Executive Dashboard
- Real-time KPIs: Registered Students, Active Courses, Configured Halls & Capacity, Time Slots, Placed Papers.
- Live API connectivity monitoring and quick action workflow triggers.
- Policy compliance summary for the IIUI Back-Paper Rule (v2).
- One-click factory data reset (`Reset Seed Data`).

### 2. Rooms & Capacity Management (Full CRUD)
- **Create / Edit / Delete** examination halls.
- Configure physical grid dimensions: **Rows &times; Columns** with real-time capacity calculation (`rows * cols`).
- Custom capacity override support and deletion safeguards.

### 3. Time Slots Management (Full CRUD)
- **Create / Edit / Delete** examination time slots.
- Configure calendar dates, session time windows (Start Time &ndash; End Time), and shifts (`Morning 1`, `Morning 2`, `Afternoon 1`, `Afternoon 2`).
- Prevents duplicate time slot overlap.

### 4. Academic Courses Management (Full CRUD)
- **Create / Edit / Delete** courses, faculty instructors, and target cohorts (e.g. `BSCS F24`, `BSIT F24`).
- Real-time aggregation of regular vs back-paper enrolled students per course.

### 5. Students & Course Enrolments Management (Full CRUD)
- **Create / Edit / Delete** students: Roll No (e.g. `2024-CS-097`), Full Name, Father Name, Degree Program, Batch, Faculty.
- **Dynamic Course Enrolments**: Assign courses with explicit designation as **Regular** or **Back Paper (Repeat)**.
- Filter by Batch, filter by Enrolled Course, and live search by Roll No, Name, or Father Name.

### 6. Datesheet Engine
- Dynamic greedy packing algorithm strictly adhering to the **IIUI Back-Paper Rule (v2)**:
  1. No student ever has 2 papers in the same time slot.
  2. At most 1 REGULAR paper per student per day.
  3. At most 2 papers total per student per day (1 regular + 1 back paper in distinct shifts).
  4. Total enrolled students in a slot must not exceed total room capacity.
- Diagnostic reporting for any unplaced courses.
- **Excel Export**: Formatted to official IIUI DCS midterm datesheet specifications.
- Print-ready datesheet layout.

### 7. Seating Plan Matrix & Arrangements
- Paper-aware best-fit room allocation: minimizes wasted seats and distributes student cohorts evenly.
- **Adjacent-Column Alternation Rule**:
  - Same paper never sits in side-by-side (adjacent) columns.
  - Same paper is allowed in the same column (front-to-back).
  - Automated compliance verification badge (`RULE PASS` / `RULE FAIL`).
- **Dual View Modes**:
  1. *Visual Grid View*: Color-coded seats per paper with student roll number, name, and desk coordinate.
  2. *Official DCS Seating Sheet*: University header, Column 01... with paper codes and vertical roll number lists.
- **Excel Export**: Generates official multi-sheet workbook per room.
- Print view formatted for notice boards and examination halls.

### 8. Student Exam Allocations & Verification (Admin Audit)
- Roster of student examination schedules across dates, sessions, allocated halls, and assigned desk numbers.
- Filter and search by roll number or student name.
- *Notice:* Download roll no slip actions are omitted from this administrative console.

---

## Quick Start — Windows

### 1. Start the FastAPI Backend
```bat
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
*(Or double-click `run-backend.bat`)*

Backend API docs available at: **http://localhost:8000/docs**

### 2. Start the React Frontend
```bat
cd frontend
npm install
npm run dev
```
*(Or double-click `run-frontend.bat`)*

Open your browser at: **http://localhost:5173**

---

## Production Build Verification

To verify frontend production compilation:
```bash
cd frontend
npm run build
```
Builds cleanly to `frontend/dist` with minified JS and CSS bundles.
