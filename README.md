# IIUI Examination Management Portal

Interactive examination scheduling, seating, roll-slip, and reporting system for the **International Islamic University, Islamabad (IIUI)** — Department of Computer Science & Information Technology, Male Campus.

Built with **FastAPI** on the backend and **React + Vite + Tailwind CSS** on the frontend. The scheduler is deterministic, clash-free, and designed around real examination constraints: student slot clashes, one paper per student per day, instructor double-booking, room capacity, and the paper-level two-column seating rule.

---

## Repository Layout

```text
.
├── backend/
│   ├── main.py                 # FastAPI app and API routes
│   ├── run_server.py           # Single-command Uvicorn launcher
│   ├── data_generator.py       # Deterministic IIUI dummy data
│   ├── scheduler.py            # Clash-free graph-colouring scheduler
│   ├── seating_engine.py       # Room allocation and seating rules
│   ├── excel_exporter.py       # Styled multi-sheet Excel report
│   ├── test_portal.py          # 19-test unit suite
│   ├── verify.py               # Standalone end-to-end integrity check
│   └── requirements.txt
├── frontend/
│   ├── src/                    # React application
│   ├── dist/                   # Committed production build (served by FastAPI)
│   ├── package.json
│   └── package-lock.json
├── docs/
│   ├── sample-roll-slip.pdf
│   ├── reference-roll-slip.pdf
│   ├── exam-management-portal-prd.pdf
│   ├── reference-datesheet.xlsx
│   └── PROJECT_BRIEFING_GUIDE.md
├── Exam_Schedule_Report.xlsx
├── IIUI_Exam_Schedule_Seating_Report.xlsx
└── README.md
```

---

## Features

### Backend

- **Deterministic data generator**: 8 exam halls, 240 male students, 16 courses, 622 enrollments, and 20 slots (5 exam days × 4 sessions).
- **Clash-free scheduling** using graph colouring:
  - Courses sharing enrolled students never share a slot.
  - The same instructor is never double-booked.
  - One paper per student per day, with a documented soft fallback only when the conflict graph requires it.
  - A seatability check runs before accepting a slot, so every datesheet is physically seatable.
- **Seating engine**:
  - Primary two-column rule: adjacent columns in a room never carry the same course.
  - Controlled fallback: same-course adjacent columns are allowed only when teachers/sections differ and leaving the column empty would make candidates unseated.
  - Raises `SeatingError` instead of silently dropping students when capacity is insufficient.
- **Excel export** with IIUI academic-green branding, A4 landscape print setup, repeating headers, wrapped text, readable row heights, formatted dates, and explicit seat numbers.
- **API endpoints**:
  - `GET /api/generate` — run scheduling and seating
  - `GET /api/download-excel` — download the formatted workbook
  - `GET /api/health` — health check
  - `GET /api/students` — student picker data
  - `GET /api/roll-slip/{roll_no}` — complete roll slip for one student
- **Production SPA serving**: FastAPI serves the committed `frontend/dist` build.

### Frontend

- Single-page React UI built with Vite and Tailwind CSS.
- **Run Generation** action with summary cards for halls, candidates, courses, registrations, and sessions.
- Interactive **Datesheet** table.
- Tabbed **Seating Arrangement** view with date/session/hall filters and a student/faculty finder.
- **Student Roll Slip** tab with a searchable student picker (name, roll number, or batch).
- Formal one-page A4 roll slip with:
  - University header and examination branch line
  - Student details
  - Every exam with date, session, course, instructor, hall, seat label, and seat number
  - Notes i–iv
  - Auto-generated footer
- **Print / Save PDF** renders a dedicated print copy through `#print-root` and a focused `@media print` stylesheet, so the slip prints on one page without blank pages.
- **Download Excel Report** button calling `/api/download-excel`.

---

## Clone the Repository

```bash
git clone https://github.com/AAKING333/IIUI-Examination-System.git
cd IIUI-Examination-System
```

---

## Quick Start (Fresh Clone)

### Prerequisites

- **Python 3.10+** (tested with Python 3.14)
- **Node.js 18+** and npm (only needed for frontend development)

### 1. Backend dependencies

```bash
cd backend
python -m pip install -r requirements.txt
```

If you prefer an isolated dependency folder matching the project launcher, install into `backend/site-packages` instead:

```bash
cd backend
python -m pip install --target site-packages -r requirements.txt
```

`backend/site-packages/` is ignored by Git.

### 2. Run the unified app

The committed `frontend/dist` build means you do **not** need to build the frontend just to run the portal.

```bash
cd backend
python run_server.py
```

Open: **http://localhost:8000**

### 3. Optional frontend development mode

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run the backend in one terminal:

```bash
cd backend
python run_server.py
```

Run Vite in another terminal:

```bash
cd frontend
npm run dev
```

Open: **http://localhost:5173**

To rebuild the production frontend after changes:

```bash
cd frontend
npm run build
```

The generated `frontend/dist` files are committed so the unified backend mode keeps working after cloning.

---

## Verification & Tests

Run from the `backend` directory:

```bash
# Full unit test suite (19 tests)
python -m unittest test_portal -v

# Standalone integrity check; exits non-zero on any hard failure
python verify.py
```

`verify.py` checks:

- Every course is scheduled exactly once
- No student has two courses in one slot
- No student has two exams on the same day
- No instructor is double-booked
- Every enrolled candidate is seated
- Room capacity and seat bounds are respected
- No duplicate seat positions or duplicate students within a slot
- The paper-level two-column rule (including the controlled fallback)
- Datesheet rooms match seating plans exactly
- The Excel workbook is valid and contains the expected sheets and rows

---

## Sample Outputs

- [`Exam_Schedule_Report.xlsx`](Exam_Schedule_Report.xlsx) — formatted workbook with datesheet, roll-number slips, and seating charts.
- [`IIUI_Exam_Schedule_Seating_Report.xlsx`](IIUI_Exam_Schedule_Seating_Report.xlsx) — same workbook under the download filename used by the UI.
- [`docs/sample-roll-slip.pdf`](docs/sample-roll-slip.pdf) — one-page formal A4 roll slip generated from the portal.
- [`docs/reference-roll-slip.pdf`](docs/reference-roll-slip.pdf) — reference layout supplied for the formal slip.
- [`docs/reference-datesheet.xlsx`](docs/reference-datesheet.xlsx) — reference datesheet data.
- [`docs/exam-management-portal-prd.pdf`](docs/exam-management-portal-prd.pdf) — project requirements document.
- [`docs/PROJECT_BRIEFING_GUIDE.md`](docs/PROJECT_BRIEFING_GUIDE.md) — project briefing and walkthrough.

---

## Notes

- The application uses a fixed random seed, so a fresh generation produces repeatable data.
- `backend/site-packages/`, `frontend/node_modules/`, and Python caches are intentionally excluded from Git. Install them with the commands above.
- The built frontend is committed because FastAPI serves it directly in unified mode.
