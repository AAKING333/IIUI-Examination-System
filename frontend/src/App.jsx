import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'

// Cohort color tags with comfortable contrast on white/green cards
const BATCH_BADGES = {
  'BSCS-F23': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'BSCS-F24': 'bg-teal-100 text-teal-800 border-teal-300',
  'BSCS-F25': 'bg-green-100 text-green-800 border-green-300',
  'BSCS-F26': 'bg-lime-100 text-lime-800 border-lime-300',
  'BSIT-F23': 'bg-cyan-100 text-cyan-800 border-cyan-300',
  'BSIT-F24': 'bg-sky-100 text-sky-800 border-sky-300',
  'BSIT-F25': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'BSIT-F26': 'bg-amber-100 text-amber-800 border-amber-300',
}

function formatSlipDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function RollSlipDocument({ slip }) {
  const issueDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const generatedAt = slip.generated_at
    ? new Date(slip.generated_at).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : issueDate

  return (
    <div className="roll-slip bg-white text-slate-900">
      <div className="text-center">
        <div className="slip-kicker font-semibold text-slate-600">
          Midterm Examination Fall-2026 Semester
        </div>
        <h1 className="slip-university mt-0.5 font-extrabold uppercase leading-tight tracking-wide text-[#004D25]">
          International Islamic University, Islamabad
        </h1>
        <div className="slip-branch font-semibold uppercase tracking-[0.18em] text-slate-600">
          (Examination Branch)
        </div>
        <div className="mt-1.5 h-[2px] w-full bg-[#006633]" />
        <h2 className="slip-title mt-1.5 font-extrabold uppercase tracking-wide text-slate-900">
          Roll No Slip for Midterm Examination
        </h2>
        <div className="slip-semester font-semibold uppercase tracking-wide text-slate-700">
          (Fall-2026) Semester
        </div>
      </div>

      <table className="slip-info mt-2.5 w-full border-collapse leading-tight">
        <tbody>
          <tr>
            <th className="w-[21%] border border-slate-300 bg-[#F1F8F3] px-1.5 py-1 text-left font-semibold">
              Roll No. / Reg No#
            </th>
            <td className="w-[29%] border border-slate-300 px-1.5 py-1 font-mono font-bold">
              {slip.student.roll_no}
            </td>
            <th className="w-[21%] border border-slate-300 bg-[#F1F8F3] px-1.5 py-1 text-left font-semibold">
              Student Name
            </th>
            <td className="w-[29%] border border-slate-300 px-1.5 py-1 font-bold">
              {slip.student.name}
            </td>
          </tr>
          <tr>
            <th className="border border-slate-300 bg-[#F1F8F3] px-1.5 py-1 text-left font-semibold">
              Faculty/Institute/School
            </th>
            <td className="border border-slate-300 px-1.5 py-1" colSpan={3}>
              Computing and Information Technology
            </td>
          </tr>
          <tr>
            <th className="border border-slate-300 bg-[#F1F8F3] px-1.5 py-1 text-left font-semibold">
              Degree Program
            </th>
            <td className="border border-slate-300 px-1.5 py-1">
              {slip.student.program} ({slip.student.batch})
            </td>
            <th className="border border-slate-300 bg-[#F1F8F3] px-1.5 py-1 text-left font-semibold">
              Campus
            </th>
            <td className="border border-slate-300 px-1.5 py-1">
              {slip.student.campus}
            </td>
          </tr>
          <tr>
            <th className="border border-slate-300 bg-[#F1F8F3] px-1.5 py-1 text-left font-semibold">
              Examination to be held in
            </th>
            <td className="border border-slate-300 px-1.5 py-1">Fall-2026</td>
            <th className="border border-slate-300 bg-[#F1F8F3] px-1.5 py-1 text-left font-semibold">
              Issue Date
            </th>
            <td className="border border-slate-300 px-1.5 py-1">{issueDate}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-2.5">
        <div className="slip-section-title mb-1 font-extrabold uppercase tracking-wide text-slate-900">
          Detail of Courses, Allowed to be Appeared in Exam Fall-2026
        </div>
        {slip.exams.length === 0 ? (
          <div className="slip-info border border-slate-300 px-2 py-2 text-slate-600">
            No courses are currently allotted to this student.
          </div>
        ) : (
          <table className="slip-courses w-full border-collapse leading-tight">
            <thead>
              <tr className="bg-[#006633] text-white">
                <th className="w-[6%] border border-[#004D25] px-1 py-1 text-center font-bold">
                  S. No
                </th>
                <th className="w-[12%] border border-[#004D25] px-1 py-1 text-center font-bold">
                  Date
                </th>
                <th className="w-[16%] border border-[#004D25] px-1 py-1 text-center font-bold">
                  Session / Time
                </th>
                <th className="w-[11%] border border-[#004D25] px-1 py-1 text-center font-bold">
                  Course Code
                </th>
                <th className="border border-[#004D25] px-1 py-1 text-left font-bold">
                  Course Title / Instructor
                </th>
                <th className="w-[9%] border border-[#004D25] px-1 py-1 text-center font-bold">
                  Room
                </th>
                <th className="w-[15%] border border-[#004D25] px-1 py-1 text-center font-bold">
                  Seat
                </th>
              </tr>
            </thead>
            <tbody>
              {slip.exams.map((exam, idx) => (
                <tr
                  key={`${exam.slot_id}-${exam.course_id}-${exam.room_id}`}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F7FBF8]'}
                >
                  <td className="border border-slate-300 px-1 py-1 text-center">
                    {idx + 1}
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-center whitespace-nowrap">
                    {formatSlipDate(exam.date)}
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-center">
                    <div className="font-semibold">{exam.slot_name}</div>
                    <div className="slip-small text-slate-600">{exam.time}</div>
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-center font-mono font-semibold">
                    {exam.course_code}
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-left">
                    <div className="font-semibold">{exam.course_name}</div>
                    <div className="slip-small text-slate-600">
                      {exam.instructor}
                      {exam.section ? ` • ${exam.section}` : ''}
                    </div>
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-center font-mono font-semibold">
                    {exam.room_id}
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-center">
                    <div className="font-semibold">{exam.seat_label}</div>
                    <div className="slip-small text-slate-600">
                      Seat #{exam.seat_no}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="slip-note mt-2.5 border-t border-slate-300 pt-1.5">
        <div className="slip-section-title font-extrabold uppercase text-slate-900">
          Note:
        </div>
        <div className="mt-0.5 space-y-0.5 leading-snug text-slate-700">
          <p>
            <span className="font-semibold">i.</span> Bring this slip and your
            University Identity Card in the Examination Hall.
          </p>
          <p>
            <span className="font-semibold">ii.</span> Possession of a Cell
            Phone/Digital Gadgets in the Examination Hall is an offence as per
            University code of conduct.
          </p>
          <p>
            <span className="font-semibold">iii.</span> All Roll No. Slips are
            issued on a provisional basis. Therefore, appearing in the
            examination does not automatically entitle a student to claim the
            result of the respective courses until all eligibility
            requirements, as per university regulations, are duly fulfilled.
          </p>
          <p>
            <span className="font-semibold">iv.</span> Students should not
            appear in the exams if having short attendance (less than 75%) in
            any course(s) and result shall be cancelled in case they appear in
            the examination.
          </p>
        </div>
      </div>

      <div className="slip-footer mt-1.5 flex items-center justify-between border-t border-slate-300 pt-1 text-slate-500">
        <span>Al-Jamia (IT-Center) Auto Generated on {generatedAt}</span>
        <span>IIUI • Examination Branch</span>
      </div>
    </div>
  )
}

export default function App() {
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  // Main active tab
  const [mainView, setMainView] = useState('datesheet')

  // Search filter for Datesheet
  const [datesheetSearch, setDatesheetSearch] = useState('')

  // Structured Seating Filters
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [selectedRoom, setSelectedRoom] = useState('')

  // Student & Faculty Finder Search state in Seating Arrangement
  const [seatingSearch, setSeatingSearch] = useState('')

  // Student roll-number slip state
  const [slipQuery, setSlipQuery] = useState('')
  const [studentList, setStudentList] = useState(null)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [slip, setSlip] = useState(null)
  const [slipLoading, setSlipLoading] = useState(false)
  const [slipError, setSlipError] = useState(null)

  const printRoot =
    typeof document !== 'undefined'
      ? document.getElementById('print-root')
      : null

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate')
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Schedule generation failed')
      }
      const json = await res.json()
      setData(json)

      // Set initial filters from the generated seating plans
      if (json.seating_plans && json.seating_plans.length > 0) {
        const first = json.seating_plans[0]
        setSelectedDate(first.date)
        setSelectedSlot(first.slot_name)
        setSelectedRoom(first.room_id)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadExcel() {
    setDownloading(true)
    setError(null)
    try {
      const res = await fetch('/api/download-excel')
      if (!res.ok) throw new Error('Could not download Excel workbook')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'IIUI_Exam_Schedule_Seating_Report.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Delay revocation so the browser can start the download reliably.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError(e.message)
    } finally {
      setDownloading(false)
    }
  }

  // Load the student directory the first time the roll-slip view is opened.
  useEffect(() => {
    if (mainView !== 'slip' || studentList) return undefined
    let cancelled = false
    setStudentsLoading(true)
    fetch('/api/students')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load the student directory')
        return res.json()
      })
      .then((json) => {
        if (!cancelled) setStudentList(json.students || [])
      })
      .catch((e) => {
        if (!cancelled) setSlipError(e.message)
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mainView, studentList])

  async function handleSelectStudent(student) {
    setSlipLoading(true)
    setSlipError(null)
    try {
      const res = await fetch(`/api/roll-slip/${encodeURIComponent(student.roll_no)}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Could not generate the roll slip')
      }
      setSlip(await res.json())
      setSlipQuery('')
    } catch (e) {
      setSlipError(e.message)
    } finally {
      setSlipLoading(false)
    }
  }

  const slipMatches = useMemo(() => {
    if (!studentList) return []
    const q = slipQuery.trim().toLowerCase()
    if (!q) return studentList.slice(0, 6)
    return studentList
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.roll_no.toLowerCase().includes(q) ||
          s.batch.toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [studentList, slipQuery])

  // Available dates for cascading filter
  const availableDates = useMemo(() => {
    if (!data?.seating_plans) return []
    return Array.from(new Set(data.seating_plans.map((p) => p.date)))
  }, [data])

  // Available slots for selected date
  const availableSlots = useMemo(() => {
    if (!data?.seating_plans || !selectedDate) return []
    const slots = data.seating_plans
      .filter((p) => p.date === selectedDate)
      .map((p) => p.slot_name)
    return Array.from(new Set(slots))
  }, [data, selectedDate])

  // Available rooms for selected date & slot
  const availableRooms = useMemo(() => {
    if (!data?.seating_plans || !selectedDate || !selectedSlot) return []
    const rooms = data.seating_plans
      .filter((p) => p.date === selectedDate && p.slot_name === selectedSlot)
      .map((p) => p.room_id)
    return Array.from(new Set(rooms))
  }, [data, selectedDate, selectedSlot])

  // Currently displayed seating plan
  const activePlan = useMemo(() => {
    if (!data?.seating_plans) return null
    return (
      data.seating_plans.find(
        (p) =>
          p.date === selectedDate &&
          p.slot_name === selectedSlot &&
          p.room_id === selectedRoom
      ) || null
    )
  }, [data, selectedDate, selectedSlot, selectedRoom])

  // Column metadata keyed by the engine's 0-based column index so that
  // deliberately empty columns keep the header/cell alignment correct.
  const columnHeaderMap = useMemo(() => {
    const map = {}
    for (const ch of activePlan?.column_headers || []) {
      map[ch.col_index] = ch
    }
    return map
  }, [activePlan])

  const columnGridStyle = activePlan
    ? { gridTemplateColumns: `repeat(${activePlan.cols}, minmax(0, 1fr))` }
    : undefined

  // Reconstructed 2D Grid
  const reconstructedGrid = useMemo(() => {
    if (!activePlan) return []
    const grid = Array.from({ length: activePlan.rows }, () =>
      Array.from({ length: activePlan.cols }, () => null)
    )
    for (const seat of activePlan.seats || []) {
      if (seat.row <= activePlan.rows && seat.col <= activePlan.cols) {
        grid[seat.row - 1][seat.col - 1] = seat
      }
    }
    return grid
  }, [activePlan])

  // Global Student & Faculty Finder Results across ALL plans
  const searchResults = useMemo(() => {
    if (!data?.seating_plans || !seatingSearch.trim() || seatingSearch.trim().length < 2) return []
    const query = seatingSearch.toLowerCase().trim()
    const matches = []

    for (const plan of data.seating_plans) {
      for (const seat of plan.seats) {
        const matchName = seat.name && seat.name.toLowerCase().includes(query)
        const matchRoll = seat.roll_no && seat.roll_no.toLowerCase().includes(query)
        const matchTeacher = seat.instructor && seat.instructor.toLowerCase().includes(query)
        const matchCourse = seat.course_code && seat.course_code.toLowerCase().includes(query)

        if (matchName || matchRoll || matchTeacher || matchCourse) {
          matches.push({
            seat,
            plan,
            matchType: matchName ? 'Student Name' : matchRoll ? 'Roll Number' : matchTeacher ? 'Teacher' : 'Course'
          })
        }
      }
    }
    return matches
  }, [data, seatingSearch])

  // Filtered Datesheet
  const filteredSchedule = useMemo(() => {
    if (!data?.schedule) return []
    if (!datesheetSearch.trim()) return data.schedule
    const q = datesheetSearch.toLowerCase()
    return data.schedule.filter(
      (s) =>
        s.course_code.toLowerCase().includes(q) ||
        s.course_name.toLowerCase().includes(q) ||
        (s.instructor_str && s.instructor_str.toLowerCase().includes(q)) ||
        s.date.includes(q) ||
        s.slot_name.toLowerCase().includes(q) ||
        (s.allocated_rooms && s.allocated_rooms.join(' ').toLowerCase().includes(q))
    )
  }, [data, datesheetSearch])

  return (
    <div className="min-h-screen bg-[#F5F8F6] text-slate-800 flex flex-col font-sans">
      {/* ── Official IIUI University Green Header ── */}
      <header className="bg-gradient-to-r from-[#004D25] via-[#006633] to-[#008744] text-white shadow-md border-b-2 border-[#003B1C]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* University Crest Mark */}
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center p-1 shadow-sm border border-emerald-200 flex-shrink-0">
              <div className="w-full h-full rounded-full bg-[#006633] flex items-center justify-center text-white font-bold text-xs tracking-tighter">
                IIUI
              </div>
            </div>

            <div>
              <div className="text-[13px] font-medium text-emerald-100 tracking-wide font-sans">
                الجامعة الاسلامية العالمية • International Islamic University, Islamabad
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight">
                Exam Management Portal
              </h1>
              <div className="text-xs text-emerald-200 font-medium">
                Department of Computer Science &amp; Information Technology
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-[#006633] hover:bg-emerald-50 active:scale-[0.98] font-bold text-sm shadow-md transition disabled:opacity-60"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-[#006633]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span>Processing...</span>
                </>
              ) : (
                <span>Run Generation</span>
              )}
            </button>

            <button
              onClick={handleDownloadExcel}
              disabled={downloading || !data}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#004D25] hover:bg-[#003B1C] text-white border border-emerald-500/50 active:scale-[0.98] font-bold text-sm shadow-md transition disabled:opacity-50"
            >
              {downloading ? 'Preparing Excel...' : 'Download Excel'}
            </button>
          </div>
        </div>

        {/* Sub-navigation Strip (University Theme) */}
        <div className="bg-[#005229]/80 border-t border-emerald-600/40 px-4 sm:px-6 lg:px-8 py-1.5 text-xs text-emerald-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-white">Academic Session:</span> Fall 2026 Midterm Examinations
          </div>
          <div className="hidden sm:block text-emerald-200 font-mono text-[11px]">
            Faculty of Computing &amp; IT
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-800 rounded-r-lg text-sm flex items-center justify-between shadow-sm">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold text-red-600 hover:text-red-900 ml-4">✕</button>
          </div>
        )}

        {/* Generation Warnings (e.g. constrained seating fallback) */}
        {data?.warnings && data.warnings.length > 0 && (
          <div className="p-4 bg-amber-50 border-l-4 border-amber-500 text-amber-900 rounded-r-lg text-sm shadow-sm space-y-1">
            {data.warnings.map((w, i) => (
              <p key={i}>
                <span className="font-bold">Notice: </span>
                {w}
              </p>
            ))}
          </div>
        )}

        {/* Initial Prompt State */}
        {!data && !loading && (
          <div className="bg-white border border-emerald-100 rounded-2xl p-12 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 text-[#006633] flex items-center justify-center font-bold text-xl mb-3 border border-emerald-200">
              IIUI
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              Ready to Generate Datesheet &amp; Seating Plans
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              Click <strong>"Run Generation"</strong> above to schedule all departmental courses clash-free, allocate examination rooms across halls (R-101 to R-203, Hall-A, Hall-B), and format teacher-differentiated seating.
            </p>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="bg-white border border-emerald-100 rounded-2xl p-14 text-center shadow-sm animate-pulse">
            <div className="w-10 h-10 mx-auto border-4 border-emerald-200 border-t-[#008744] rounded-full animate-spin mb-4" />
            <p className="text-base font-bold text-slate-800">Computing Clash-Free Schedule &amp; Hall Plans</p>
            <p className="text-sm text-slate-500 mt-1">Synchronizing faculty sections and room grids in real-time...</p>
          </div>
        )}

        {/* Generated Content Dashboard */}
        {data && !loading && (
          <>
            {/* Top KPI Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: 'Campus Halls', val: `${data.meta.rooms} Halls` },
                { label: 'Male Candidates', val: `${data.meta.students} Enrolled` },
                { label: 'Scheduled Courses', val: `${data.meta.scheduled_courses ?? data.meta.courses} Courses` },
                { label: 'Course Registrations', val: `${data.meta.enrollments} Total` },
                { label: 'Time Sessions', val: `${data.meta.slots} Slots` },
              ].map((card) => (
                <div
                  key={card.label}
                  className="bg-white border-t-4 border-[#008744] rounded-xl p-4 shadow-sm border border-slate-200/80"
                >
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{card.label}</p>
                  <p className="text-xl sm:text-2xl font-extrabold text-[#006633] mt-1 font-sans">{card.val}</p>
                </div>
              ))}
            </div>

            {/* View Selector Controls & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-emerald-200 pb-3">
              <div className="inline-flex p-1 rounded-xl bg-slate-200/80 border border-slate-300">
                <button
                  onClick={() => setMainView('datesheet')}
                  className={`px-5 py-2 text-sm font-bold rounded-lg transition ${
                    mainView === 'datesheet'
                      ? 'bg-[#006633] text-white shadow-sm'
                      : 'text-slate-700 hover:text-[#006633]'
                  }`}
                >
                  Datesheet View
                </button>
                <button
                  onClick={() => setMainView('seating')}
                  className={`px-5 py-2 text-sm font-bold rounded-lg transition ${
                    mainView === 'seating'
                      ? 'bg-[#006633] text-white shadow-sm'
                      : 'text-slate-700 hover:text-[#006633]'
                  }`}
                >
                  Seating Arrangement
                </button>
                <button
                  onClick={() => setMainView('slip')}
                  className={`px-5 py-2 text-sm font-bold rounded-lg transition ${
                    mainView === 'slip'
                      ? 'bg-[#006633] text-white shadow-sm'
                      : 'text-slate-700 hover:text-[#006633]'
                  }`}
                >
                  Student Roll Slip
                </button>
              </div>

              {mainView === 'datesheet' && (
                <div className="relative w-full sm:w-72">
                  <input
                    type="text"
                    value={datesheetSearch}
                    onChange={(e) => setDatesheetSearch(e.target.value)}
                    placeholder="Search course, code, teacher, room..."
                    className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#008744] focus:ring-1 focus:ring-[#008744] shadow-xs"
                  />
                  {datesheetSearch && (
                    <button
                      onClick={() => setDatesheetSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── View 1: Clean Datesheet Table ── */}
            {mainView === 'datesheet' && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-[#004D25] text-white font-bold text-xs uppercase tracking-wider">
                        <th className="px-5 py-3.5 border-r border-emerald-800">Date &amp; Day</th>
                        <th className="px-4 py-3.5 border-r border-emerald-800">Session</th>
                        <th className="px-4 py-3.5 border-r border-emerald-800">Code</th>
                        <th className="px-5 py-3.5 border-r border-emerald-800">Course Title</th>
                        <th className="px-5 py-3.5 border-r border-emerald-800">Instructor(s)</th>
                        <th className="px-4 py-3.5 text-center border-r border-emerald-800">Enrolled</th>
                        <th className="px-5 py-3.5">Allocated Rooms</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-sans text-sm">
                      {filteredSchedule.map((entry, idx) => (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? 'bg-white hover:bg-emerald-50/50' : 'bg-slate-50/70 hover:bg-emerald-50/50'}
                        >
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            {entry.date}
                            <span className="text-slate-500 font-normal block text-xs">
                              {entry.day_label.split(',')[0]}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-block px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-[#006633] border border-emerald-200">
                              {entry.slot_name}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-bold text-[#006633] font-mono text-sm">
                            {entry.course_code}
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            {entry.course_name}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 text-xs leading-relaxed">
                            {entry.instructor_str}
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold text-slate-900">
                            {entry.enrolled_count}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-[#006633] font-mono text-xs">
                            {entry.allocated_rooms.join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── View 2: Seating Plan with Instant Student & Faculty Finder ── */}
            {mainView === 'seating' && (
              <div className="space-y-5">
                {/* Search Bar for Instant Student / Faculty Spot Lookup */}
                <div className="bg-white border-2 border-[#008744]/40 rounded-xl p-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <label className="text-sm font-bold text-[#006633] block">
                        Find Student Seat or Teacher Exam Spot
                      </label>
                      <p className="text-xs text-slate-500">
                        Type any Student Name, Roll Number, Teacher Name (e.g. Dr. Farrukh Nazir), or Course Code to jump directly to their seat.
                      </p>
                    </div>

                    <div className="relative w-full sm:w-80">
                      <input
                        type="text"
                        value={seatingSearch}
                        onChange={(e) => setSeatingSearch(e.target.value)}
                        placeholder="Search student, roll no, teacher..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#008744] focus:ring-1 focus:ring-[#008744]"
                      />
                      {seatingSearch && (
                        <button
                          onClick={() => setSeatingSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Search Results Dropdown Preview */}
                  {seatingSearch.trim().length >= 2 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Matching Results ({searchResults.length} found):
                      </div>

                      {searchResults.length === 0 ? (
                        <div className="text-xs text-slate-500 py-2">
                          No matching student or instructor seating record found for "{seatingSearch}".
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                          {searchResults.slice(0, 15).map((match, mIdx) => (
                            <button
                              key={mIdx}
                              onClick={() => {
                                setSelectedDate(match.plan.date)
                                setSelectedSlot(match.plan.slot_name)
                                setSelectedRoom(match.plan.room_id)
                              }}
                              className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-[#008744] hover:bg-emerald-50/50 bg-slate-50/60 transition group flex flex-col justify-between"
                            >
                              <div className="flex items-center justify-between gap-1 w-full">
                                <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-[#006633]">
                                  {match.seat.roll_no}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-[#006633]">
                                  {match.plan.room_id} • Col {match.seat.col_label} R{match.seat.row}
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-slate-800 truncate mt-1">
                                {match.seat.name}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {match.seat.course_code} • {match.seat.instructor}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                                {match.plan.date} • {match.plan.slot_name}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Clean Filter Strip */}
                <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#006633] mr-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#008744]" />
                    Filter Hall View:
                  </div>

                  {/* Date Selector */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <span className="text-slate-500 text-xs font-bold uppercase">Date:</span>
                    <select
                      value={selectedDate}
                      onChange={(e) => {
                        const newDate = e.target.value
                        setSelectedDate(newDate)
                        const slots = data.seating_plans
                          .filter((p) => p.date === newDate)
                          .map((p) => p.slot_name)
                        if (slots.length > 0) {
                          setSelectedSlot(slots[0])
                          const rooms = data.seating_plans
                            .filter((p) => p.date === newDate && p.slot_name === slots[0])
                            .map((p) => p.room_id)
                          if (rooms.length > 0) setSelectedRoom(rooms[0])
                        }
                      }}
                      className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer"
                    >
                      {availableDates.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Slot Selector */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <span className="text-slate-500 text-xs font-bold uppercase">Session:</span>
                    <select
                      value={selectedSlot}
                      onChange={(e) => {
                        const newSlot = e.target.value
                        setSelectedSlot(newSlot)
                        const rooms = data.seating_plans
                          .filter((p) => p.date === selectedDate && p.slot_name === newSlot)
                          .map((p) => p.room_id)
                        if (rooms.length > 0) setSelectedRoom(rooms[0])
                      }}
                      className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer"
                    >
                      {availableSlots.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Room Selector (Hall Buttons) */}
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-slate-500 text-xs font-bold uppercase mr-1 hidden sm:inline">
                      Hall:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {availableRooms.map((r) => (
                        <button
                          key={r}
                          onClick={() => setSelectedRoom(r)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono transition ${
                            selectedRoom === r
                              ? 'bg-[#008744] text-white shadow-sm'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Seating Plan Board */}
                {activePlan && (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    {/* Header Banner */}
                    <div className="px-6 py-4 bg-[#004D25] text-white flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold font-mono tracking-tight bg-white text-[#006633] px-3 py-1 rounded-md">
                          {activePlan.room_id}
                        </span>
                        <span className="text-sm text-emerald-100 font-medium">
                          {activePlan.date} • {activePlan.slot_name} ({activePlan.time})
                        </span>
                      </div>
                      <div className="text-sm font-medium text-emerald-100">
                        <span className="font-bold text-white text-base">{activePlan.seats.length}</span> / {activePlan.rows * activePlan.cols} Candidates Seated
                      </div>
                    </div>

                    {/* Seat Grid Layout */}
                    <div className="p-6 overflow-x-auto">
                      <div className="min-w-[980px] space-y-4">
                        {/* Column Header Titles */}
                        <div className="grid gap-3.5 pl-14" style={columnGridStyle}>
                          {Array.from({ length: activePlan.cols }).map((_, cIdx) => {
                            const ch = columnHeaderMap[cIdx]
                            const letter = String.fromCharCode(65 + cIdx)
                            return (
                              <div
                                key={cIdx}
                                className={`rounded-xl border p-3 text-center shadow-xs ${
                                  ch
                                    ? 'border-emerald-200 bg-emerald-50/70'
                                    : 'border-dashed border-slate-300 bg-slate-50'
                                }`}
                              >
                                <div className="text-xs font-mono font-bold text-emerald-800 uppercase tracking-wider">
                                  Column {letter}
                                </div>
                                {ch ? (
                                  <>
                                    <div className="text-sm font-extrabold text-[#006633] mt-1 font-mono truncate">
                                      {ch.course_code}
                                    </div>
                                    <div className="text-xs text-slate-700 truncate mt-0.5 font-medium">
                                      {ch.instructor}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-xs text-slate-400 mt-2 font-medium italic">
                                    Empty (spacing)
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Student Rows */}
                        {reconstructedGrid.map((rowArr, rIdx) => (
                          <div key={rIdx} className="flex items-center gap-3.5">
                            {/* Row Tag */}
                            <div className="w-10 text-center font-bold text-xs font-mono text-slate-500 uppercase">
                              Row {rIdx + 1}
                            </div>

                            {/* Column Cells */}
                            <div className="grid gap-3.5 flex-1" style={columnGridStyle}>
                              {rowArr.map((cell, cIdx) => {
                                const isSearched =
                                  seatingSearch.trim().length >= 2 &&
                                  cell &&
                                  (cell.name.toLowerCase().includes(seatingSearch.toLowerCase().trim()) ||
                                    cell.roll_no.toLowerCase().includes(seatingSearch.toLowerCase().trim()) ||
                                    cell.instructor.toLowerCase().includes(seatingSearch.toLowerCase().trim()) ||
                                    cell.course_code.toLowerCase().includes(seatingSearch.toLowerCase().trim()))

                                return (
                                  <div
                                    key={cIdx}
                                    className={`rounded-xl border p-3 min-h-[92px] flex flex-col justify-between transition shadow-xs ${
                                      cell
                                        ? isSearched
                                          ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400 shadow-md'
                                          : 'bg-white border-slate-200 hover:border-emerald-500 hover:shadow-md'
                                        : 'bg-slate-50/80 border-slate-200/60 flex items-center justify-center opacity-50'
                                    }`}
                                  >
                                    {cell ? (
                                      <>
                                        <div className="flex items-start justify-between gap-1">
                                          <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 tracking-tight">
                                            {cell.roll_no}
                                          </span>
                                          <span
                                            className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                                              BATCH_BADGES[cell.batch] ||
                                              'bg-slate-100 text-slate-700 border-slate-300'
                                            }`}
                                          >
                                            {cell.batch}
                                          </span>
                                        </div>

                                        <div className="text-xs sm:text-sm text-slate-800 font-semibold truncate mt-1">
                                          {cell.name}
                                        </div>

                                        <div className="text-[11px] text-[#006633] truncate font-medium mt-1">
                                          {cell.instructor}
                                        </div>
                                      </>
                                    ) : (
                                      <span className="text-xs font-mono text-slate-400 font-semibold uppercase tracking-wider">
                                        Vacant
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {!activePlan && (
                  <div className="bg-white border border-emerald-100 rounded-2xl p-10 text-center shadow-sm">
                    <h3 className="text-base font-bold text-slate-800">
                      No seating plan matches the selected filters
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Choose another date, session, or hall to view its seating arrangement.
                    </p>
                    {data.seating_plans?.length > 0 && (
                      <button
                        onClick={() => {
                          const first = data.seating_plans[0]
                          setSelectedDate(first.date)
                          setSelectedSlot(first.slot_name)
                          setSelectedRoom(first.room_id)
                        }}
                        className="mt-4 px-4 py-2 rounded-lg bg-[#006633] text-white text-sm font-bold hover:bg-[#004D25] transition"
                      >
                        Show first available hall
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── View 3: Individual Student Roll Number Slip ── */}
            {mainView === 'slip' && (
              <div className="space-y-5">
                {/* Student picker */}
                <div className="no-print bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-extrabold text-[#004D25]">
                        Generate Student Roll Number Slip
                      </h2>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Search by student name, roll number, or batch. The slip includes every exam, hall, and seat.
                      </p>
                    </div>
                    {slip && (
                      <button
                        onClick={() => {
                          setSlip(null)
                          setSlipQuery('')
                          setSlipError(null)
                        }}
                        className="shrink-0 px-4 py-2 rounded-lg border border-emerald-300 text-[#006633] text-sm font-bold hover:bg-emerald-50 transition"
                      >
                        Change student
                      </button>
                    )}
                  </div>

                  <div className="relative mt-4">
                    <span
                      aria-hidden="true"
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"
                    >
                      🔍
                    </span>
                    <input
                      type="text"
                      aria-label="Search students by name, roll number, or batch"
                      value={slipQuery}
                      onChange={(e) => setSlipQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && slipMatches.length > 0) {
                          handleSelectStudent(slipMatches[0])
                        }
                      }}
                      placeholder="e.g. BSCSF24-122 or Yasir Khan"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#008744] focus:ring-2 focus:ring-[#008744]/20"
                    />
                    {slipQuery && (
                      <button
                        onClick={() => setSlipQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {studentsLoading ? (
                    <div className="mt-4 text-sm text-slate-500 animate-pulse">
                      Loading student directory...
                    </div>
                  ) : (slipQuery.trim() || !slip) && slipMatches.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {slipMatches.map((student) => (
                        <button
                          key={student.student_id}
                          onClick={() => handleSelectStudent(student)}
                          className="text-left rounded-xl border border-slate-200 bg-slate-50/60 hover:border-[#008744] hover:bg-emerald-50/60 p-3 transition group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-[#006633]">
                              {student.roll_no}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-[#006633]">
                              {student.batch}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-slate-800 mt-1 truncate">
                            {student.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : slipQuery.trim() ? (
                    <div className="mt-4 text-sm text-slate-500">
                      No student matches "{slipQuery}".
                    </div>
                  ) : null}
                </div>

                {slipError && (
                  <div className="no-print p-4 bg-red-50 border-l-4 border-red-500 text-red-800 rounded-r-lg text-sm">
                    {slipError}
                  </div>
                )}

                {slipLoading && (
                  <div className="no-print bg-white border border-emerald-100 rounded-2xl p-10 text-center shadow-sm">
                    <div className="w-9 h-9 mx-auto border-4 border-emerald-200 border-t-[#008744] rounded-full animate-spin mb-3" />
                    <p className="text-sm font-semibold text-slate-700">
                      Assembling the roll number slip...
                    </p>
                  </div>
                )}

                {slip && !slipLoading && (
                  <div className="space-y-3">
                    <div className="no-print flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-slate-500">
                        Showing slip for{' '}
                        <span className="font-bold text-slate-800">
                          {slip.student.name}
                        </span>
                      </div>
                      <button
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#006633] hover:bg-[#004D25] text-white font-semibold text-sm transition"
                      >
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 14h12v7H6z"
                          />
                        </svg>
                        Print / Save PDF
                      </button>
                    </div>

                    <div className="mx-auto w-full max-w-[820px] border border-slate-300 bg-white p-6 shadow-sm sm:p-8">
                      <RollSlipDocument slip={slip} />
                    </div>

                    {printRoot &&
                      createPortal(
                        <RollSlipDocument slip={slip} />,
                        printRoot
                      )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
