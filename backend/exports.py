"""Excel / PDF exports matching the user's real IIUI samples.

Datesheet Excel — layout from
`Midterm_Exam_Date_Sheet_Fall_26__Male_Version_1.5.xlsx`:
  INTERNATIONAL ISLAMIC UNIVERSITY
  DEPARTMENT OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY
  MIDTERM EXAMS DATESHEET (MALE) - FALL 2026
  Version 1.5
  Columns: Date (Day) | Time | Course | Instructor | Batch(es) |
           Room No. | Students Count | Total Students per Session

Roll no slip PDF — layout from `rollno_slip.pdf`:
  INTERNATIONAL ISLAMIC UNIVERSITY, ISLAMABAD (EXAMINATION BRANCH)
  ROLL NO SLIP FOR MIDTERM EXAMINATION (FALL-2026) SEMESTER
  Fields: Roll No./Reg No#, Student Name, Son/Daughter of,
  Faculty/Institute/School, Degree Program, Examination to be held
  in, Issue Date. Course table S.No | Course Code | Course Title
  (+ Date, Time, Room, Seat, Remarks added after the sample columns,
  because the portal's slips must show them). Notes i-iv and the
  "Al-Jamia (IT-Center) Auto Generated on ..." footer.

Seating Excel — official seating sheet per room:
  INTERNATIONAL ISLAMIC UNIVERSITY
  DEPARTMENT OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY
  SEATING ARRANGEMENT — Date, Time Slot, Room No.
  Table: each physical column is a table column, head "Column 01",
  sub-head "Paper: <code>", roll numbers listed below it, Row 1 down.
"""

import datetime
import io
import re

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# Typography & Palette matching IIUI standards & reference datesheet
TITLE_FONT = Font(name="Times New Roman", size=15, bold=True, color="000000")
SUB_FONT = Font(name="Times New Roman", size=13, bold=True, color="000000")
VERSION_FONT = Font(name="Times New Roman", size=11, bold=True, color="333333")

HEADER_FILL = PatternFill("solid", fgColor="0B3B2C")  # IIUI Deep University Green
HEADER_FONT = Font(name="Times New Roman", size=11, bold=True, color="FFFFFF")

DATE_BANNER_FILL = PatternFill("solid", fgColor="EBF3EE")  # Elegant pale green banner
DATE_BANNER_FONT = Font(name="Times New Roman", size=12, bold=True, color="0B3B2C")

DATA_FONT = Font(name="Times New Roman", size=10, bold=False, color="111827")
DATA_BOLD_FONT = Font(name="Times New Roman", size=10, bold=True, color="111827")

THIN_BORDER_SIDE = Side(style="thin", color="CCCCCC")
THICK_BOTTOM_SIDE = Side(style="medium", color="0B3B2C")

CELL_BORDER = Border(
    left=THIN_BORDER_SIDE,
    right=THIN_BORDER_SIDE,
    top=THIN_BORDER_SIDE,
    bottom=THIN_BORDER_SIDE,
)

CENTER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT_ALIGN = Alignment(horizontal="left", vertical="center", wrap_text=True)
RIGHT_ALIGN = Alignment(horizontal="right", vertical="center", wrap_text=True)


def _weekday(date_str):
    try:
        return datetime.date.fromisoformat(date_str).strftime("%A")
    except ValueError:
        return ""


def _fmt_date(date_str):
    """'2026-11-10' -> '10/11/2026 - Tuesday' (sample style)."""
    try:
        d = datetime.date.fromisoformat(date_str)
        return f"{d.day:02d}/{d.month:02d}/{d.year} - {d.strftime('%A')}"
    except ValueError:
        return date_str


def _clean_instructor(instructor_str):
    if not instructor_str:
        return "—"
    # If it has '|' separators with 'Sec ...: Teacher'
    if "|" in instructor_str:
        parts = [p.strip() for p in instructor_str.split("|")]
        teachers = []
        for p in parts:
            if ":" in p:
                t = p.split(":", 1)[1].strip()
            else:
                t = p
            t = re.sub(r"\s*\((?:BSCS|BSIT|BSSE|BSDS|MSCS|MSDS|PhD CS)[^)]*\)", "", t, flags=re.IGNORECASE).strip()
            if t and t not in teachers:
                teachers.append(t)
        if teachers:
            return ", ".join(teachers)

    cleaned = re.sub(r"\s*\(All Batches:[^)]*\)", "", instructor_str)
    cleaned = re.sub(r"\s*\((?:BSCS|BSIT|BSSE|BSDS|MSCS|MSDS|PhD CS)[^)]*\)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r",\s*,", ",", cleaned).strip(" ,")
    return cleaned or instructor_str


def _apply_border_range(ws, start_row, start_col, end_row, end_col, border=CELL_BORDER):
    for r in range(start_row, end_row + 1):
        for c in range(start_col, end_col + 1):
            ws.cell(row=r, column=c).border = border


# ---------------------------------------------------------------- datesheet
def datesheet_xlsx(datesheet_entries, seating_by_slot):
    """datesheet_entries: list from datesheet_state['datesheet'].
    seating_by_slot: {slot_id: seating plan dict} for Room No. column.
    Formats exactly to match the official IIUI reference datesheet layout."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Datesheet"
    ws.views.sheetView[0].showGridLines = True

    headers = [
        "Date  (Day)",
        "Course",
        "Instructor",
        "Batch(es)",
        "Room No.",
        "Students Count",
        "Total Students per Session",
    ]
    ncols = len(headers)

    # 1. Header block (Rows 1-4)
    titles = [
        ("INTERNATIONAL ISLAMIC UNIVERSITY", TITLE_FONT, 24),
        ("DEPARTMENT OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY", SUB_FONT, 22),
        ("MIDTERM EXAMS DATESHEET (MALE) - FALL 2026", SUB_FONT, 22),
        ("Version 1.2", VERSION_FONT, 18),
    ]
    for row_idx, (text, font, height) in enumerate(titles, start=1):
        ws.row_dimensions[row_idx].height = height
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=ncols)
        c = ws.cell(row=row_idx, column=1, value=text)
        c.font = font
        c.alignment = CENTER_ALIGN

    # 2. Table Column Headers (Row 5)
    ws.row_dimensions[5].height = 36
    for j, h in enumerate(headers, start=1):
        c = ws.cell(row=5, column=j, value=h)
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.alignment = CENTER_ALIGN
        c.border = CELL_BORDER

    # Set column widths matching reference
    widths = [20, 38, 32, 22, 18, 16, 26]
    for j, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(j)].width = w

    # Row 6: Blank row before data
    ws.row_dimensions[6].height = 10

    # 3. Group entries by date, then by slot
    entries_by_date = {}
    for e in sorted(datesheet_entries, key=lambda x: (x.get("date", ""), x.get("start_time", ""))):
        d = e.get("date", "")
        entries_by_date.setdefault(d, []).append(e)

    curr_row = 7

    for date_str, day_entries in entries_by_date.items():
        # Date section banner
        ws.row_dimensions[curr_row].height = 26
        ws.merge_cells(start_row=curr_row, start_column=1, end_row=curr_row, end_column=ncols)
        banner_cell = ws.cell(row=curr_row, column=1, value=_fmt_date(date_str))
        banner_cell.font = DATE_BANNER_FONT
        banner_cell.fill = DATE_BANNER_FILL
        banner_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
        _apply_border_range(ws, curr_row, 1, curr_row, ncols, CELL_BORDER)
        curr_row += 1

        # Group by slot within this day
        slots_in_day = {}
        for e in day_entries:
            key = (e.get("slot_id", ""), e.get("start_time", ""), e.get("end_time", ""))
            slots_in_day.setdefault(key, []).append(e)

        for (slot_id, start_time, end_time), courses in slots_in_day.items():
            k = len(courses)
            total_students = sum(c.get("students", 0) for c in courses)
            plan = seating_by_slot.get(slot_id) or {}

            # Gather rooms
            if courses[0].get("allocated_rooms"):
                rooms_str = ", ".join(courses[0]["allocated_rooms"])
            elif plan.get("rooms"):
                rooms_str = ", ".join(r["room_name"] for r in plan["rooms"])
            else:
                rooms_str = "—"

            time_str = f"{start_time} - {end_time}"
            slot_start_row = curr_row

            for idx, c_info in enumerate(courses):
                r = curr_row + idx
                ws.row_dimensions[r].height = 22

                # Col 1: Time (only on first row if merged)
                c1 = ws.cell(row=r, column=1, value=time_str if idx == 0 else "")
                c1.font = DATA_BOLD_FONT
                c1.alignment = CENTER_ALIGN
                c1.border = CELL_BORDER

                # Col 2: Course
                course_text = f"{c_info.get('course_code', '')} {c_info.get('course_title', '')}".strip()
                c2 = ws.cell(row=r, column=2, value=course_text)
                c2.font = DATA_BOLD_FONT
                c2.alignment = LEFT_ALIGN
                c2.border = CELL_BORDER

                # Col 3: Instructor
                inst_text = _clean_instructor(c_info.get("instructor", ""))
                c3 = ws.cell(row=r, column=3, value=inst_text)
                c3.font = DATA_FONT
                c3.alignment = LEFT_ALIGN
                c3.border = CELL_BORDER

                # Col 4: Batch(es)
                batches_text = c_info.get("batches", "").replace(", ", " / ")
                c4 = ws.cell(row=r, column=4, value=batches_text)
                c4.font = DATA_FONT
                c4.alignment = CENTER_ALIGN
                c4.border = CELL_BORDER

                # Col 5: Room No.
                c5 = ws.cell(row=r, column=5, value=rooms_str if idx == 0 else "")
                c5.font = DATA_FONT
                c5.alignment = CENTER_ALIGN
                c5.border = CELL_BORDER

                # Col 6: Students Count
                c6 = ws.cell(row=r, column=6, value=c_info.get("students", 0))
                c6.font = DATA_FONT
                c6.alignment = CENTER_ALIGN
                c6.border = CELL_BORDER

                # Col 7: Total Students per Session
                c7 = ws.cell(row=r, column=7, value=total_students if idx == 0 else "")
                c7.font = DATA_BOLD_FONT
                c7.alignment = CENTER_ALIGN
                c7.border = CELL_BORDER

            # Merge columns across session rows if k > 1
            if k > 1:
                ws.merge_cells(start_row=slot_start_row, start_column=1, end_row=slot_start_row + k - 1, end_column=1)
                ws.merge_cells(start_row=slot_start_row, start_column=5, end_row=slot_start_row + k - 1, end_column=5)
                ws.merge_cells(start_row=slot_start_row, start_column=7, end_row=slot_start_row + k - 1, end_column=7)
                _apply_border_range(ws, slot_start_row, 1, slot_start_row + k - 1, 1)
                _apply_border_range(ws, slot_start_row, 5, slot_start_row + k - 1, 5)
                _apply_border_range(ws, slot_start_row, 7, slot_start_row + k - 1, 7)

            curr_row += k

            # Blank separator row between sessions
            ws.row_dimensions[curr_row].height = 10
            curr_row += 1

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ------------------------------------------------------------------ seating
def seating_xlsx(plan):
    """One worksheet per room, official seating-sheet layout."""
    wb = Workbook()
    wb.remove(wb.active)
    for room in plan["rooms"]:
        ws = wb.create_sheet(title=room["room_name"][:31])
        sheet = room["seating_sheet"]
        ncols = room["columns"]
        for i, text in enumerate([
                "INTERNATIONAL ISLAMIC UNIVERSITY",
                "DEPARTMENT OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY",
                "SEATING ARRANGEMENT",
                f"Date: {_fmt_date(plan['date'])}",
                f"Time Slot: {plan['start_time']} - {plan['end_time']}",
                f"Room No.: {room['room_name']}"], start=1):
            ws.merge_cells(start_row=i, start_column=1, end_row=i, end_column=ncols)
            c = ws.cell(row=i, column=1, value=text)
            c.font = TITLE_FONT if i <= 3 else Font(name="Times New Roman", bold=True, size=11)
            c.alignment = CENTER_ALIGN
        # Head row: Column 01, Column 02, ...
        ws.row_dimensions[7].height = 24
        for j, col in enumerate(sheet["columns"], start=1):
            c = ws.cell(row=7, column=j, value=f"Column {col['column_no']:02d}")
            c.font = HEADER_FONT
            c.fill = HEADER_FILL
            c.alignment = CENTER_ALIGN
            c.border = CELL_BORDER
        # Sub-head row: CS 201 - [teachername]
        ws.row_dimensions[8].height = 28
        for j, col in enumerate(sheet["columns"], start=1):
            val = col.get("paper_header") or col.get("paper", "")
            c = ws.cell(row=8, column=j, value=val)
            c.font = Font(name="Times New Roman", bold=True, size=10)
            c.alignment = CENTER_ALIGN
            c.border = CELL_BORDER
        # Roll numbers, Row 1 down each column (keeping full room rows so empty chairs show cleanly).
        max_rows = max([room.get("rows", 0)] + [len(c["roll_nos"]) for c in sheet["columns"]], default=0)
        for r in range(max_rows):
            ws.row_dimensions[9 + r].height = 20
            for j, col in enumerate(sheet["columns"], start=1):
                v = col["roll_nos"][r] if r < len(col["roll_nos"]) else ""
                c = ws.cell(row=9 + r, column=j, value=v)
                c.font = DATA_FONT
                c.alignment = CENTER_ALIGN
                c.border = CELL_BORDER
        for j in range(1, ncols + 1):
            ws.column_dimensions[get_column_letter(j)].width = 20
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ---------------------------------------------------------------- roll slips
NOTES = [
    "i. Bring this slip and your University Identity Card in the Examination Hall",
    "ii. Possession of a Cell Phone/Digital Gadgets in the Examination Hall is an offence as per University code of conduct.",
    "iii. All Roll No. Slips are issued on a provisional basis. Therefore, appearing in the examination does not automatically entitle a student to claim the result of the respective courses until all eligibility requirements, as per university regulations, are duly fulfilled.",
    "iv. Students should not appear in the exams if having short attendance (less than 75%) in any course(s) and result shall be cancelled in case they appear in the examination.",
]


def _slip_pdf(pdf, slip):
    from fpdf import FPDF  # local import so the module loads without fpdf2

    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 7, "INTERNATIONAL ISLAMIC UNIVERSITY, ISLAMABAD", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, "(EXAMINATION BRANCH)", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "ROLL NO SLIP FOR MIDTERM EXAMINATION", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, "(FALL-2026) SEMESTER", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 11)
    fields = [
        ("Roll No. / Reg No#", slip["roll_no"]),
        ("Student Name Mr./Ms:", slip["name"]),
        ("Son/Daughter of:", slip.get("father_name", "")),
        ("Faculty/Institute/School:", slip.get("faculty", "Computing and Information Technology")),
        ("Degree Program:", f"{slip.get('program', '')} {slip['batch']}"),
        ("Examination to be held in:", "Midterm Examination Fall-2026"),
        ("Issue Date:", slip.get("issue_date", "")),
    ]
    for label, value in fields:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(52, 7, label)
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 7, str(value), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "DETAIL OF COURSES, ALLOWED TO BE APPEARED IN EXAM FALL-2026",
            new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    # Table: sample columns first, then Date/Time/Room/Seat, then Remarks.
    widths = [12, 24, 52, 20, 24, 18, 20, 20]  # total 190 (A4 usable width)
    headers = ["S.No", "Course Code", "Course Title", "Date", "Time", "Room", "Seat", "Remarks"]
    pdf.set_font("Helvetica", "B", 9)
    for w, h in zip(widths, headers):
        pdf.cell(w, 8, h, border=1, align="C")
    pdf.ln()
    pdf.set_font("Helvetica", "", 9)
    for i, p in enumerate(slip["papers"], start=1):
        title = p["course_title"]
        if len(title) > 32:
            title = title[:29] + "..."
        vals = [str(i), p["course_code"], title, p["date"],
                f"{p['start_time']}-{p['end_time']}", p.get("room", "—"),
                p.get("seat", "—"), p.get("remarks", p.get("type", "")).title()]
        for w, v in zip(widths, vals):
            pdf.cell(w, 8, str(v), border=1, align="C" if w != 52 else "L")
        pdf.ln()
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Note:", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for note in NOTES:
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 6, note)
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 10)
    generated = datetime.datetime.now().strftime("%b-%d-%Y %H:%M:%S")
    pdf.cell(0, 6, f"Al-Jamia (IT-Center) Auto Generated on {generated}",
            new_x="LMARGIN", new_y="NEXT")


def roll_slip_pdf(slip):
    from fpdf import FPDF
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    _slip_pdf(pdf, slip)
    return io.BytesIO(pdf.output())


def roll_slips_pdf(slips):
    from fpdf import FPDF
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    for slip in slips:
        _slip_pdf(pdf, slip)
    return io.BytesIO(pdf.output())
