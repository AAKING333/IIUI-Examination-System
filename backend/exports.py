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
from collections import defaultdict

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


def _format_time_12(t_str):
    """Converts '08:45' or '14:30' into 12-hour format '08:45 AM' or '02:30 PM'."""
    if not t_str:
        return ""
    raw = str(t_str).strip()
    if "am" in raw.lower() or "pm" in raw.lower():
        return raw
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            dt = datetime.datetime.strptime(raw, fmt)
            return dt.strftime("%I:%M %p")
        except ValueError:
            pass
    return raw


def _format_time_range_12(start_str, end_str=None, sep=" - "):
    """Formats start and end time into 12-hour AM/PM range (e.g. '08:45 AM - 10:15 AM')."""
    if end_str is None:
        raw = str(start_str).strip()
        for delimiter in (" \u2013 ", " - ", "-", "\u2013"):
            if delimiter in raw:
                parts = raw.split(delimiter, 1)
                return f"{_format_time_12(parts[0])}{sep}{_format_time_12(parts[1])}"
        return _format_time_12(raw)
    s = _format_time_12(start_str)
    e = _format_time_12(end_str)
    if s and e:
        return f"{s}{sep}{e}"
    return s or e or ""


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


def _format_course_code(code):
    """'CS212' -> 'CS 212', 'GEC102' -> 'GEC 102', 'CS344L' -> 'CS 344L'"""
    if not code:
        return ""
    return re.sub(r"([A-Za-z]+)(\d+)", r"\1 \2", code)


TOTAL_COHORT_SECTIONS = {
    "BSCS F23": ["A", "B", "C"],
    "BSCS F24": ["A", "B"],
    "BSCS F25": ["A", "B"],
    "BSCS F26": ["A", "B"],
    "BSIT F23": ["A", "B"],
    "BSIT F24": ["A", "B"],
    "BSIT F25": ["A", "B"],
    "BSIT F26": ["A", "B"],
}


def _format_course_cohorts(centries):
    if not centries:
        return "—"
    cohort_map = defaultdict(set)
    for e in centries:
        prog = (e.get("program") or "").strip()
        batch = (e.get("batch") or "").strip()
        if not prog or not batch:
            m = re.match(r"(BSCS|BSIT|BSSE|BSDS|MSCS|MSDS|PhD CS)\s+([F|S]\d+)", e.get("batches") or "", re.I)
            if m:
                prog = m.group(1).upper()
                batch = m.group(2).upper()
        key = f"{prog} {batch}".strip()
        if not key:
            continue
        secs = cohort_map[key]
        if e.get("sections"):
            for s in e["sections"]:
                if s:
                    secs.add(str(s).strip().upper())
        elif e.get("section"):
            for s in re.split(r"[,+/]", str(e["section"])):
                if s:
                    secs.add(s.strip().upper())
        elif e.get("batches"):
            sec_match = re.search(r"Section\s+([A-Za-z0-9+,\s]+)", e["batches"], re.I)
            if sec_match:
                for s in re.split(r"[+,\s]+", sec_match.group(1)):
                    if s:
                        secs.add(s.strip().upper())

    if not cohort_map:
        return centries[0].get("batches") or "—"

    labels = []
    for key, present_secs in cohort_map.items():
        known_all = TOTAL_COHORT_SECTIONS.get(key, ["A", "B"])
        is_all = len(present_secs) >= len(known_all) and all(s in present_secs for s in known_all)
        sorted_secs = sorted(present_secs)
        if sorted_secs and not is_all:
            labels.append(f"{key} (Sec {', '.join(sorted_secs)})")
        else:
            labels.append(key)

    return " / ".join(labels) or "—"


def _get_entry_cohort(e):
    p = (e.get("program") or "").strip()
    b = (e.get("batch") or "").strip()
    if p and b:
        return f"{p} {b}".strip()
    batches = e.get("batches") or ""
    m = re.match(r"(BSCS|BSIT|BSSE|BSDS|MSCS|MSDS|PhD CS)\s+([F|S]\d+)", batches, re.I)
    if m:
        return f"{m.group(1).upper()} {m.group(2).upper()}"
    cleaned = re.sub(r"\s*Section\s+[A-Za-z0-9]+", "", batches, flags=re.I).strip()
    return cleaned or batches


def _get_course_rooms(centries, slot_id, seating_by_slot):
    is_lab_course = any(bool(e.get("is_lab")) for e in centries)
    rooms = []
    for e in centries:
        for r in e.get("allocated_rooms", []):
            is_lab_r = "lab" in str(r).lower()
            if is_lab_course == is_lab_r and r and r not in rooms:
                rooms.append(r)
    if rooms:
        return rooms

    plan = seating_by_slot.get(slot_id) or {}
    raw_ccode = re.sub(r"[^a-zA-Z0-9]", "", centries[0].get("course_code", "")).lower()
    for rm in plan.get("rooms", []):
        rname = rm.get("room_name", "")
        is_lab_rm = rm.get("room_type") == "lab" or "lab" in rname.lower()
        if is_lab_course != is_lab_rm:
            continue
        sheet = rm.get("seating_sheet", {})
        for col in sheet.get("columns", []):
            p = col.get("paper", "") or col.get("paper_header", "")
            norm_p = re.sub(r"[^a-zA-Z0-9]", "", p).lower()
            if raw_ccode and raw_ccode in norm_p:
                if rname not in rooms:
                    rooms.append(rname)
                break
    if not rooms and plan.get("rooms"):
        rooms = [
            rm["room_name"] for rm in plan["rooms"]
            if (rm.get("room_type") == "lab" or "lab" in rm.get("room_name", "").lower()) == is_lab_course
        ]
    return rooms


def _clean_pdf_text(text):
    if text is None:
        return "-"
    return str(text).replace("\u2014", "-").replace("\u2013", "-").replace("\u2018", "'").replace("\u2019", "'")


# ---------------------------------------------------------------- datesheet
def datesheet_xlsx(datesheet_entries, seating_by_slot, version="1.2"):
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
        (f"Version {version}", VERSION_FONT, 18),
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
    widths = [24, 42, 38, 24, 22, 16, 26]
    for j, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(j)].width = w

    # Row 6: Blank row before data
    ws.row_dimensions[6].height = 10

    # 3. Group entries by date, then by slot, then by course_code
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

        for (slot_id, start_time, end_time), slot_entries in slots_in_day.items():
            time_str = _format_time_range_12(start_time, end_time)
            total_students_session = sum(e.get("students", 0) for e in slot_entries)

            # Group courses in this session by unique course_code
            course_map = {}
            for e in slot_entries:
                course_map.setdefault(e.get("course_code", ""), []).append(e)

            slot_courses = []
            for ccode, centries in course_map.items():
                ctitle = centries[0].get("course_title", "").strip()
                fmt_code = _format_course_code(ccode)
                course_name = f"{fmt_code} {ctitle}".strip()

                insts = []
                for e in centries:
                    ci = _clean_instructor(e.get("instructor", ""))
                    for part in [p.strip() for p in ci.split(",")]:
                        if part and part != "—" and part not in insts:
                            insts.append(part)
                inst_str = ", ".join(insts) if insts else "—"

                batch_str = _format_course_cohorts(centries)

                rooms = _get_course_rooms(centries, slot_id, seating_by_slot)
                room_str = ", ".join(rooms) if rooms else "—"
                c_students = sum(e.get("students", 0) for e in centries)

                slot_courses.append({
                    "course_code": ccode,
                    "course_name": course_name,
                    "instructor": inst_str,
                    "batches": batch_str,
                    "rooms": room_str,
                    "students": c_students,
                })

            k = len(slot_courses)
            slot_start_row = curr_row
            all_same_rooms = len(set(sc["rooms"] for sc in slot_courses)) == 1

            for idx, sc in enumerate(slot_courses):
                r = curr_row + idx
                ws.row_dimensions[r].height = 24

                # Col 1: Time (merged across session)
                c1 = ws.cell(row=r, column=1, value=time_str if idx == 0 else "")
                c1.font = DATA_BOLD_FONT
                c1.alignment = CENTER_ALIGN
                c1.border = CELL_BORDER

                # Col 2: Course
                c2 = ws.cell(row=r, column=2, value=sc["course_name"])
                c2.font = DATA_BOLD_FONT
                c2.alignment = LEFT_ALIGN
                c2.border = CELL_BORDER

                # Col 3: Instructor
                c3 = ws.cell(row=r, column=3, value=sc["instructor"])
                c3.font = DATA_FONT
                c3.alignment = LEFT_ALIGN
                c3.border = CELL_BORDER

                # Col 4: Batch(es)
                c4 = ws.cell(row=r, column=4, value=sc["batches"])
                c4.font = DATA_FONT
                c4.alignment = CENTER_ALIGN
                c4.border = CELL_BORDER

                # Col 5: Room No.
                if all_same_rooms:
                    c5 = ws.cell(row=r, column=5, value=sc["rooms"] if idx == 0 else "")
                else:
                    c5 = ws.cell(row=r, column=5, value=sc["rooms"])
                c5.font = DATA_FONT
                c5.alignment = CENTER_ALIGN
                c5.border = CELL_BORDER

                # Col 6: Students Count
                c6 = ws.cell(row=r, column=6, value=sc["students"])
                c6.font = DATA_FONT
                c6.alignment = CENTER_ALIGN
                c6.border = CELL_BORDER

                # Col 7: Total Students per Session
                c7 = ws.cell(row=r, column=7, value=total_students_session if idx == 0 else "")
                c7.font = DATA_BOLD_FONT
                c7.alignment = CENTER_ALIGN
                c7.border = CELL_BORDER

            # Merge columns across session rows if k > 1
            if k > 1:
                ws.merge_cells(start_row=slot_start_row, start_column=1, end_row=slot_start_row + k - 1, end_column=1)
                _apply_border_range(ws, slot_start_row, 1, slot_start_row + k - 1, 1)

                if all_same_rooms:
                    ws.merge_cells(start_row=slot_start_row, start_column=5, end_row=slot_start_row + k - 1, end_column=5)
                    _apply_border_range(ws, slot_start_row, 5, slot_start_row + k - 1, 5)

                ws.merge_cells(start_row=slot_start_row, start_column=7, end_row=slot_start_row + k - 1, end_column=7)
                _apply_border_range(ws, slot_start_row, 7, slot_start_row + k - 1, 7)

            curr_row += k

            # Blank separator row between sessions (height 9.6 matching reference)
            ws.row_dimensions[curr_row].height = 9.6
            curr_row += 1

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def datesheet_pdf(datesheet_entries, seating_by_slot, version="1.2"):
    """Landscape A4 PDF export matching the official IIUI reference datesheet."""
    from fpdf import FPDF
    from fpdf.fonts import FontFace

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.set_font("Helvetica", "", 8)
    pdf.add_page()

    # Title Header Block
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 6, "INTERNATIONAL ISLAMIC UNIVERSITY, ISLAMABAD", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 5, "DEPARTMENT OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 5, "MIDTERM EXAMS DATESHEET (MALE) - FALL 2026", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 5, f"Version {version}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 8)
    headings_style = FontFace(emphasis="BOLD", color=255, fill_color=(11, 59, 44))
    banner_style = FontFace(emphasis="BOLD", color=(11, 59, 44), fill_color=(235, 243, 238))

    col_widths = (32, 60, 63, 38, 38, 20, 26)
    headers = [
        "Date  (Day)",
        "Course",
        "Instructor",
        "Batch(es)",
        "Room No.",
        "Students Count",
        "Total Students per Session",
    ]

    entries_by_date = {}
    for e in sorted(datesheet_entries, key=lambda x: (x.get("date", ""), x.get("start_time", ""))):
        d = e.get("date", "")
        entries_by_date.setdefault(d, []).append(e)

    with pdf.table(col_widths=col_widths, headings_style=headings_style, text_align=("C", "L", "L", "C", "C", "C", "C"), line_height=4.5) as table:
        hrow = table.row()
        for h in headers:
            hrow.cell(h)

        for date_str, day_entries in entries_by_date.items():
            brow = table.row(style=banner_style)
            brow.cell(_clean_pdf_text(_fmt_date(date_str)), colspan=7)

            slots_in_day = {}
            for e in day_entries:
                key = (e.get("slot_id", ""), e.get("start_time", ""), e.get("end_time", ""))
                slots_in_day.setdefault(key, []).append(e)

            for (slot_id, start_time, end_time), slot_entries in slots_in_day.items():
                time_str = _clean_pdf_text(_format_time_range_12(start_time, end_time))
                total_students_session = sum(e.get("students", 0) for e in slot_entries)

                course_map = {}
                for e in slot_entries:
                    course_map.setdefault(e.get("course_code", ""), []).append(e)

                slot_courses = []
                for ccode, centries in course_map.items():
                    ctitle = centries[0].get("course_title", "").strip()
                    fmt_code = _format_course_code(ccode)
                    course_name = _clean_pdf_text(f"{fmt_code} {ctitle}".strip())

                    insts = []
                    for e in centries:
                        ci = _clean_instructor(e.get("instructor", ""))
                        for part in [p.strip() for p in ci.split(",")]:
                            if part and part != "—" and part not in insts:
                                insts.append(part)
                    inst_str = _clean_pdf_text(", ".join(insts) if insts else "-")

                    batch_str = _clean_pdf_text(_format_course_cohorts(centries))

                    rooms = _get_course_rooms(centries, slot_id, seating_by_slot)
                    room_str = _clean_pdf_text(", ".join(rooms) if rooms else "-")
                    c_students = sum(e.get("students", 0) for e in centries)

                    slot_courses.append({
                        "name": course_name,
                        "inst": inst_str,
                        "batch": batch_str,
                        "rooms": room_str,
                        "students": c_students,
                    })

                k = len(slot_courses)
                all_same_rooms = len(set(sc["rooms"] for sc in slot_courses)) == 1

                for idx, sc in enumerate(slot_courses):
                    r = table.row()
                    if idx == 0:
                        r.cell(time_str, rowspan=k)
                    r.cell(sc["name"])
                    r.cell(sc["inst"])
                    r.cell(sc["batch"])
                    if all_same_rooms:
                        if idx == 0:
                            r.cell(sc["rooms"], rowspan=k)
                    else:
                        r.cell(sc["rooms"])
                    r.cell(str(sc["students"]))
                    if idx == 0:
                        r.cell(str(total_students_session), rowspan=k)

    buf = io.BytesIO(pdf.output())
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
                f"Time Slot: {_format_time_range_12(plan.get('start_time', ''), plan.get('end_time', ''))}",
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
                c.alignment = CENTER_ALIGN
                c.border = CELL_BORDER
                if str(v).strip().lower() == "buffer":
                    c.value = "Buffer"
                    c.font = Font(name="Times New Roman", bold=True, size=10, color="92400E")
                    c.fill = PatternFill("solid", fgColor="FEF3C7")
                else:
                    c.font = DATA_FONT
        for j in range(1, ncols + 1):
            ws.column_dimensions[get_column_letter(j)].width = 20
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ---------------------------------------------------------------- roll slips
NOTES = [
    "i. Candidates must bring this printed Roll No. Slip and their original University Student ID Card.",
    "ii. Cell phones, digital gadgets, smartwatches, and programmable electronic devices are strictly prohibited.",
    "iii. Candidates must be seated at their assigned hall and desk at least 15 minutes before the examination starts.",
    "iv. Candidates may not leave the examination hall during the examination session.",
    "v. Borrowing or sharing stationery, calculators, or instruments is prohibited.",
    "vi. Slips are provisional. Candidates with less than 75% attendance in any course are ineligible; any exam taken despite short attendance will be cancelled.",
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
        ("Datesheet Version:", f"Version {slip.get('datesheet_version', '—')}"),
        ("Slip Status:", slip.get("datesheet_status", "PUBLISHED")),
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
    widths = [10, 22, 46, 22, 38, 16, 18, 18]  # total 190 (A4 usable width)
    headers = ["S.No", "Course Code", "Course Title", "Date", "Time", "Room", "Seat", "Remarks"]
    pdf.set_font("Helvetica", "B", 9)
    for w, h in zip(widths, headers):
        pdf.cell(w, 8, h, border=1, align="C")
    pdf.ln()
    pdf.set_font("Helvetica", "", 9)
    for i, p in enumerate(slip["papers"], start=1):
        title = p["course_title"]
        if len(title) > 30:
            title = title[:27] + "..."
        formatted_time = _clean_pdf_text(_format_time_range_12(p.get("start_time", ""), p.get("end_time", "")))
        vals = [str(i), p["course_code"], title, p["date"],
                formatted_time, p.get("room", "—"),
                p.get("seat", "—"), p.get("remarks", p.get("type", "")).title()]
        for w, v in zip(widths, vals):
            pdf.cell(w, 8, str(v), border=1, align="C" if w != 46 else "L")
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
    generated = datetime.datetime.now().strftime("%b-%d-%Y %I:%M:%S %p")
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


def umc_report_pdf(report):
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(0, 9, "IIUI UNFAIR MEANS CASE (UMC) REPORT", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 7, "Department of Computer Science & Information Technology", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f"Case #{report['id']}  |  Status: {report['status'].replace('_', ' ').upper()}",
             align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    reported_val = str(report.get("created_at", ""))
    try:
        dt = datetime.datetime.fromisoformat(reported_val.replace("Z", "+00:00"))
        reported_val = dt.strftime("%b %d, %Y %I:%M %p")
    except Exception:
        pass

    fields = [
        ("Student Roll No.", report["roll_no"]),
        ("Course", report["course_code"]),
        ("Slot ID", report["slot_id"]),
        ("Room ID", report["room_id"]),
        ("Reporting Invigilator", report["invigilator"]),
        ("Reported", reported_val),
    ]
    for label, value in fields:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 7, label, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(pdf.epw, 7, str(value))

    sections = [
        ("Incident Details", report["details"]),
        ("Student Statement", report.get("student_statement") or "Not recorded"),
        ("Invigilator Remarks", report.get("invigilator_remarks") or "Not recorded"),
        ("Instructor Review", report.get("instructor_comments") or "Not reviewed"),
    ]
    for label, value in sections:
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 11)
        pdf.multi_cell(pdf.epw, 7, label)
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(pdf.epw, 6, str(value))

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 7, "Evidence references", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    for item in report.get("evidence", []):
        value = "Captured evidence image (attached to digital case)" if str(item).startswith("data:image/") else str(item)
        pdf.multi_cell(pdf.epw, 5, value)
    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 6, "Digital signature captured with the incident report.",
             new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Generated {datetime.datetime.now().strftime('%b-%d-%Y %I:%M:%S %p')}",
             new_x="LMARGIN", new_y="NEXT")
    return io.BytesIO(pdf.output())
