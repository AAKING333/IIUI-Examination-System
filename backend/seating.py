"""Seating-plan generation.

STRICT 2-PAPER COLUMN ALTERNATION RULES:
  * In any room, at most 2 examination papers are seated together (e.g. PF and OS).
  * Adjacent columns strictly alternate between the two papers:
      Column 01: Paper 0
      Column 02: Paper 1
      Column 03: Paper 0
      Column 04: Paper 1 ...
    This prevents teacher/invigilator overload ("khap") by giving each hall
    only 2 distinct papers to distribute and collect.
  * If only 1 paper is in a hall:
      Columns alternate between the paper and a vacant column:
      Column 01: Paper 0
      Column 02: — (Vacant)
      Column 03: Paper 0
      Column 04: — (Vacant) ...
  * Adjacent seats NEVER share the same course code.
  * Roll numbers read down each column from front to back.
  * Students of a course sharing the same teacher (across sections/programs)
    are seated together as one contiguous block, never sharing a column with
    another teacher of the same course, and at least 5 empty buffer chairs
    are left at the end of each (course, teacher) block.
"""
import itertools
import re
from typing import List, Dict, Any, Optional, Tuple
from data import store

EXTRA_EMPTY_CHAIRS = 5
_PLACEHOLDER_TEACHERS = {"unassigned", "none", "tbd", "n/a", ""}


def column_papers(room: Dict[str, Any], papers: List[Dict[str, Any]]) -> List[Optional[str]]:
    """Assigns paper code to each column of a room.

    Strict rule: At most 2 papers per room in alternating columns.
    - len(papers) == 0: all columns None.
    - len(papers) == 1: odd columns (0, 2, 4...) get the paper; even columns (1, 3, 5...) are vacant (None).
    - len(papers) >= 2: column 0 gets Paper 0, column 1 gets Paper 1, column 2 gets Paper 0, etc.
    """
    cols = room["columns"]
    if not papers:
        return [None] * cols

    if len(papers) == 1:
        c0 = papers[0]["code"]
        return [c0 if c % 2 == 0 else None for c in range(cols)]
    else:
        # Strictly pair the first two papers in this room: P0, P1, P0, P1...
        p0 = papers[0]["code"]
        p1 = papers[1]["code"]
        return [p0 if c % 2 == 0 else p1 for c in range(cols)]


def paper_column_capacity(room: Dict[str, Any], papers: List[Dict[str, Any]]) -> Dict[str, int]:
    """Max seats available per paper in this room under 2-paper alternation."""
    target_papers = papers[:2] if len(papers) >= 2 else papers
    cap = {p["code"]: 0 for p in target_papers}
    for code in column_papers(room, target_papers):
        if code and code in cap:
            cap[code] += room["rows"]
    return cap


def clean_teacher_name(inst: str) -> str:
    """Extracts a clean, compact instructor name (e.g. 'Dr. Adeel', 'Dr. Sajid Ali Khan')."""
    if not inst:
        return ""
    # If separated by pipe, take first section's teacher
    first = inst.split("|")[0].strip()
    # Strip parenthetical comments like (All Batches: ...) or (Sec A & B) first
    without_parens = re.sub(r"\(.*?\)", "", first).strip()
    # If there is a section/batch prefix like 'BSCS Sec A: Dr. Sajid', take what's after the colon
    if ":" in without_parens:
        return without_parens.split(":", 1)[1].strip()
    return without_parens.strip()


def _normalize_teacher(raw: str) -> str:
    cleaned = clean_teacher_name(raw)
    if cleaned.strip().lower() in _PLACEHOLDER_TEACHERS:
        return ""
    return cleaned.strip()


def _resolve_student_teacher(
    student: Optional[Dict[str, Any]],
    course: Dict[str, Any],
) -> str:
    """Resolves the assigned teacher for a student's enrolment in a course."""
    if student:
        t = _normalize_teacher(store.get_instructor_for_student_course(student, course["code"]))
        if t:
            return t
    return _normalize_teacher(course.get("instructor", ""))


def _course_teacher_groups(
    course: Dict[str, Any],
    student_by_roll: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Groups a course's enrolled students by teacher so same-teacher sections stay together."""
    rolls = list(course.get("student_roll_numbers", []))
    by_teacher: Dict[str, List[str]] = {}
    for roll in rolls:
        teacher = _resolve_student_teacher(student_by_roll.get(roll), course)
        by_teacher.setdefault(teacher, []).append(roll)

    groups = [{"teacher": t, "rolls": rs} for t, rs in by_teacher.items() if rs]
    groups.sort(key=lambda g: (-len(g["rolls"]), g["rolls"][0], g["teacher"]))
    return groups


def _ensure_paper_groups(
    papers: List[Dict[str, Any]],
    student_by_roll: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Ensures every paper dict carries its (course, teacher) student groups."""
    enriched = []
    for p in papers:
        if "groups" in p:
            enriched.append(p)
        else:
            course_stub = {
                "code": p["code"],
                "title": p.get("title", ""),
                "instructor": p.get("instructor", ""),
                "student_roll_numbers": p.get("rolls", []),
            }
            groups = _course_teacher_groups(course_stub, student_by_roll)
            enriched.append({**p, "groups": groups})
    return enriched


def _allocate_paper_columns(
    groups: List[Dict[str, Any]],
    cols_meta: List[Tuple[int, int, int]],
    extra_empty: int = EXTRA_EMPTY_CHAIRS,
    allow_mix_teachers: bool = False,
) -> Optional[List[Dict[str, Any]]]:
    """Packs (course, teacher) groups into a paper's alternating columns.

    Each group starts at the top of a clean column (unless allow_mix_teachers=True)
    and reserves at least `extra_empty` empty chairs after its final seated student.
    Returns a list of column allocations or None if cols_meta is insufficient.
    """
    if not groups:
        return []

    if allow_mix_teachers:
        # Emergency overcapacity fallback: pack all rolls sequentially without column boundaries
        all_rolls = [(g["teacher"], r) for g in groups for r in g["rolls"]]
        total_seats = sum(h for _, _, h in cols_meta)
        if len(all_rolls) > total_seats:
            return None
        allocs = []
        idx = 0
        for r_idx, c_idx, h in cols_meta:
            if idx >= len(all_rolls):
                break
            chunk = all_rolls[idx:idx + h]
            teachers = list(dict.fromkeys(t for t, _ in chunk if t))
            allocs.append({
                "room_idx": r_idx,
                "col_idx": c_idx,
                "teacher": " / ".join(teachers),
                "rolls": [r for _, r in chunk],
            })
            idx += len(chunk)
        return allocs

    ptr = 0
    total_cols = len(cols_meta)
    allocs: List[Dict[str, Any]] = []

    for g in groups:
        rolls = g["rolls"]
        teacher = g["teacher"]
        n = len(rolls)
        if n == 0:
            continue

        idx = 0
        rem_in_last = 0
        while idx < n:
            if ptr >= total_cols:
                return None
            r_idx, c_idx, h = cols_meta[ptr]
            take = min(h, n - idx)
            allocs.append({
                "room_idx": r_idx,
                "col_idx": c_idx,
                "teacher": teacher,
                "rolls": rolls[idx:idx + take],
            })
            rem_in_last = h - take
            idx += take
            ptr += 1

        still_needed = max(0, extra_empty - rem_in_last)
        while still_needed > 0:
            if ptr >= total_cols:
                return None
            r_idx, c_idx, h = cols_meta[ptr]
            allocs.append({
                "room_idx": r_idx,
                "col_idx": c_idx,
                "teacher": teacher,
                "rolls": [],
            })
            still_needed -= h
            ptr += 1

    return allocs


def _pack_pair_into_rooms(
    pair: List[Dict[str, Any]],
    combo: List[Dict[str, Any]],
    student_by_roll: Dict[str, Dict[str, Any]],
    extra_empty: int = EXTRA_EMPTY_CHAIRS,
    allow_mix_teachers: bool = False,
) -> Optional[Dict[str, List[Dict[str, Any]]]]:
    """Attempts to pack a 1- or 2-paper pair into the given room list."""
    target = pair[:2] if len(pair) >= 2 else pair
    target = _ensure_paper_groups(target, student_by_roll)
    packed: Dict[str, List[Dict[str, Any]]] = {}

    for p in target:
        code = p["code"]
        cols_meta: List[Tuple[int, int, int]] = []
        for r_idx, room in enumerate(combo):
            cp = column_papers(room, target)
            for c_idx, c_code in enumerate(cp):
                if c_code == code:
                    cols_meta.append((r_idx, c_idx, room["rows"]))

        allocs = _allocate_paper_columns(
            p["groups"],
            cols_meta,
            extra_empty=extra_empty,
            allow_mix_teachers=allow_mix_teachers,
        )
        if allocs is None:
            return None
        packed[code] = allocs

    return packed


def _search_best_combo(
    target_papers: List[Dict[str, Any]],
    total: int,
    active_rooms: List[Dict[str, Any]],
    student_by_roll: Dict[str, Dict[str, Any]],
    extra_empty: int,
    allow_mix_teachers: bool = False,
) -> Optional[List[Dict[str, Any]]]:
    """Finds the smallest-waste subset of active_rooms that satisfies packing constraints."""
    if not active_rooms:
        return None

    # Guard combinatorial explosion if many rooms exist
    if len(active_rooms) > 12:
        if _pack_pair_into_rooms(
            target_papers, active_rooms, student_by_roll,
            extra_empty=extra_empty, allow_mix_teachers=allow_mix_teachers,
        ) is None:
            return None
        sorted_rooms = sorted(active_rooms, key=lambda r: r["capacity"], reverse=True)
        chosen: List[Dict[str, Any]] = []
        for r in sorted_rooms:
            chosen.append(r)
            if _pack_pair_into_rooms(
                target_papers, chosen, student_by_roll,
                extra_empty=extra_empty, allow_mix_teachers=allow_mix_teachers,
            ) is not None:
                return chosen
        return list(active_rooms)

    best = None
    for n in range(1, len(active_rooms) + 1):
        for combo in itertools.combinations(active_rooms, n):
            combo_list = list(combo)
            if _pack_pair_into_rooms(
                target_papers, combo_list, student_by_roll,
                extra_empty=extra_empty, allow_mix_teachers=allow_mix_teachers,
            ) is None:
                continue
            total_usable = sum(sum(paper_column_capacity(r, target_papers).values()) for r in combo_list)
            waste = total_usable - total
            key = (waste, n)
            if best is None or key < best[0]:
                best = (key, combo_list)
        if best is not None:
            break
    return best[1] if best else None


def best_fit_rooms(
    papers: List[Dict[str, Any]],
    total: int,
    rooms: Optional[List[Dict[str, Any]]] = None,
    student_by_roll: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Smallest-waste room combination that fits students, clean teacher columns, and 5 empty buffer chairs."""
    active_rooms = rooms if rooms is not None else store.get_rooms()
    active_sbr = student_by_roll if student_by_roll is not None else store.student_by_roll
    target_papers = _ensure_paper_groups(papers[:2] if len(papers) >= 2 else papers, active_sbr)

    # 1. Preferred: clean teacher columns + >=5 empty chairs at end of each (course, teacher)
    chosen = _search_best_combo(
        target_papers, total, active_rooms, active_sbr,
        extra_empty=EXTRA_EMPTY_CHAIRS, allow_mix_teachers=False,
    )
    if chosen is not None:
        return chosen

    # 2. Fallback: clean teacher columns without full 5-chair buffer
    chosen = _search_best_combo(
        target_papers, total, active_rooms, active_sbr,
        extra_empty=0, allow_mix_teachers=False,
    )
    if chosen is not None:
        return chosen

    # 3. Last-resort fallback: fit all students sequentially across alternating columns
    chosen = _search_best_combo(
        target_papers, total, active_rooms, active_sbr,
        extra_empty=0, allow_mix_teachers=True,
    )
    return chosen if chosen is not None else list(active_rooms)


def check_adjacent_columns(grid: List[List[Any]], rows: int, cols: int) -> bool:
    """True if no two side-by-side occupied seats share a course code."""
    for r in range(rows):
        for c in range(cols - 1):
            a, b = grid[r][c], grid[r][c + 1]
            if a and b and a.get("course_code") == b.get("course_code"):
                return False
    return True


def _partition_course_pairs(
    slot_courses: List[Dict[str, Any]],
    student_by_roll: Dict[str, Dict[str, Any]],
) -> List[List[Dict[str, Any]]]:
    """Builds enriched paper objects and partitions them into <=2-paper pairs by demand."""
    papers = []
    for course in slot_courses:
        groups = _course_teacher_groups(course, student_by_roll)
        rolls = [r for g in groups for r in g["rolls"]]
        demand = len(rolls) + EXTRA_EMPTY_CHAIRS * len(groups)
        papers.append({
            "code": course["code"],
            "title": course["title"],
            "instructor": course.get("instructor", ""),
            "rolls": rolls,
            "groups": groups,
            "demand": demand,
        })
    sorted_papers = sorted(papers, key=lambda p: (p["demand"], len(p["rolls"])), reverse=True)
    return [sorted_papers[i:i + 2] for i in range(0, len(sorted_papers), 2)]


def courses_fit_in_rooms(
    slot_courses: List[Dict[str, Any]],
    rooms: Optional[List[Dict[str, Any]]] = None,
    student_by_roll: Optional[Dict[str, Dict[str, Any]]] = None,
    require_empty_buffer: bool = True,
) -> bool:
    """Returns True if all slot_courses can be seated into rooms under all rules."""
    active_sbr = student_by_roll if student_by_roll is not None else store.student_by_roll
    active_rooms = list(rooms if rooms is not None else store.get_rooms())
    pairs = _partition_course_pairs([c for c in slot_courses if c.get("student_roll_numbers")], active_sbr)
    if not pairs:
        return True
    if not active_rooms:
        return False

    extra_empty = EXTRA_EMPTY_CHAIRS if require_empty_buffer else 0
    remaining = list(active_rooms)
    for pair in pairs:
        pair_total = sum(len(p["rolls"]) for p in pair)
        chosen = _search_best_combo(
            pair, pair_total, remaining, active_sbr,
            extra_empty=extra_empty, allow_mix_teachers=False,
        )
        if chosen is None:
            return False
        for r in chosen:
            if r in remaining:
                remaining.remove(r)
    return True


def build_seating_sheet(
    room_out: Dict[str, Any],
    instructor_map: Optional[Dict[str, str]] = None,
    student_by_roll: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Official DCS arrangement sheet layout for a room."""
    inst_map = instructor_map or {}
    active_sbr = student_by_roll if student_by_roll is not None else store.student_by_roll
    cols_out = []
    rotation = room_out.get("column_papers") or []
    col_teachers_meta = room_out.get("column_teachers") or []

    for c in range(room_out["columns"]):
        paper = rotation[c] if c < len(rotation) else None
        raw_rolls = []
        for r in range(room_out["rows"]):
            cell = room_out["grid"][r][c]
            if cell:
                paper = cell["course_code"]
                raw_rolls.append(cell["roll_no"])
            else:
                raw_rolls.append("")

        is_vacant = not paper or paper == "—" or "Vacant" in paper
        # Keep full room row height for active/buffer columns so empty chairs appear cleanly
        roll_nos = [] if is_vacant else raw_rolls

        # Look up instructor specifically from students actually seated in this column
        col_teachers = []
        if active_sbr and paper and not is_vacant:
            for roll in roll_nos:
                if roll:
                    st = active_sbr.get(roll)
                    if st:
                        t = _resolve_student_teacher(st, {"code": paper, "instructor": inst_map.get(paper, "")})
                        if t and t not in col_teachers:
                            col_teachers.append(t)

        if col_teachers:
            short_inst = " / ".join(col_teachers)
        elif not is_vacant and c < len(col_teachers_meta) and col_teachers_meta[c] is not None:
            short_inst = col_teachers_meta[c]
        elif paper and not is_vacant:
            course_all_insts = store.get_instructors_for_course(paper)
            if course_all_insts:
                short_inst = " / ".join(list(dict.fromkeys(_normalize_teacher(i) for i in course_all_insts if _normalize_teacher(i))))
            else:
                short_inst = _normalize_teacher(inst_map.get(paper, ""))
        else:
            short_inst = ""

        if is_vacant:
            paper_header = "— (Vacant)"
        else:
            # Format code as "CS 201" from "CS201"
            code_spaced = re.sub(r"^([A-Za-z]+)(\d+)", r"\1 \2", paper)
            paper_header = f"{code_spaced} - {short_inst}" if short_inst else code_spaced

        cols_out.append({
            "column_no": c + 1,
            "paper": paper if not is_vacant else "— (Vacant)",
            "course_code": paper if paper and not is_vacant else "",
            "instructor": short_inst,
            "paper_header": paper_header,
            "roll_nos": roll_nos,
        })
    return {"columns": cols_out}


def _verify_empty_chairs_rule(
    rooms_out: List[Dict[str, Any]],
    expected_groups: Dict[Tuple[str, str], int],
    min_empty: int = EXTRA_EMPTY_CHAIRS,
) -> bool:
    """Verifies each (course_code, teacher) group ends with >= min_empty empty chairs."""
    if not expected_groups:
        return True

    # Collect per-(course_code, teacher) sequence of column heights and occupied counts in seat order
    seq: Dict[Tuple[str, str], List[Tuple[int, int]]] = {}
    for room in rooms_out:
        rows = room["rows"]
        col_papers = room.get("column_papers") or []
        col_teachers = room.get("column_teachers") or []
        for c in range(room["columns"]):
            code = col_papers[c] if c < len(col_papers) else None
            if not code:
                continue
            teacher = col_teachers[c] if c < len(col_teachers) and col_teachers[c] is not None else ""
            occupied = sum(1 for r in range(rows) if room["grid"][r][c] is not None)
            seq.setdefault((code, teacher), []).append((rows, occupied))

    for key, student_count in expected_groups.items():
        if student_count <= 0:
            continue
        cols_list = seq.get(key)
        if not cols_list:
            return False
        trailing_empty = 0
        for h, occ in reversed(cols_list):
            if occ == 0:
                trailing_empty += h
            else:
                trailing_empty += (h - occ)
                break
        if trailing_empty < min_empty:
            return False
    return True


def build_seating_plan(
    slot_courses: List[Dict[str, Any]],
    rooms: Optional[List[Dict[str, Any]]] = None,
    student_by_roll: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Generates an intelligent, efficient seating plan where each room has at most 2 papers alternating."""
    active_sbr = student_by_roll if student_by_roll is not None else store.student_by_roll
    all_rooms = list(rooms if rooms is not None else store.get_rooms())
    course_instructor_map = {c["code"]: c.get("instructor", "") for c in slot_courses}

    non_empty_courses = [c for c in slot_courses if c.get("student_roll_numbers")]
    total = sum(len(c.get("student_roll_numbers", [])) for c in non_empty_courses)
    if total == 0 or not all_rooms:
        return {
            "rooms": [],
            "total_students": 0,
            "total_capacity": 0,
            "physical_capacity": 0,
            "utilisation_pct": 0.0,
            "adjacent_rule_pass": True,
            "extra_empty_chairs": EXTRA_EMPTY_CHAIRS,
            "empty_chairs_rule_pass": True,
        }

    pairs = _partition_course_pairs(non_empty_courses, active_sbr)
    expected_groups: Dict[Tuple[str, str], int] = {}
    for pair in pairs:
        for p in pair:
            for g in p["groups"]:
                expected_groups[(p["code"], g["teacher"])] = len(g["rolls"])

    remaining_rooms = list(all_rooms)
    rooms_out = []

    for pair in pairs:
        pair_total = sum(len(p["rolls"]) for p in pair)
        chosen = best_fit_rooms(pair, pair_total, rooms=remaining_rooms, student_by_roll=active_sbr)
        for r in chosen:
            if r in remaining_rooms:
                remaining_rooms.remove(r)

        packed = (
            _pack_pair_into_rooms(pair, chosen, active_sbr, extra_empty=EXTRA_EMPTY_CHAIRS, allow_mix_teachers=False)
            or _pack_pair_into_rooms(pair, chosen, active_sbr, extra_empty=0, allow_mix_teachers=False)
            or _pack_pair_into_rooms(pair, chosen, active_sbr, extra_empty=0, allow_mix_teachers=True)
            or {}
        )

        # Build per-room allocation lookup: (r_idx, c_idx) -> (code, teacher, rolls)
        cell_alloc: Dict[Tuple[int, int], Tuple[str, str, List[str]]] = {}
        for code, allocs in packed.items():
            for alloc in allocs:
                cell_alloc[(alloc["room_idx"], alloc["col_idx"])] = (
                    code,
                    alloc["teacher"],
                    alloc["rolls"],
                )

        for r_idx, room in enumerate(chosen):
            rows, cols = room["rows"], room["columns"]
            grid = [[None] * cols for _ in range(rows)]
            col_paper: List[Optional[str]] = [None] * cols
            col_teacher: List[Optional[str]] = [None] * cols
            r_usable = sum(paper_column_capacity(room, pair).values())
            seated = 0

            for c in range(cols):
                alloc_entry = cell_alloc.get((r_idx, c))
                if not alloc_entry:
                    continue
                code, teacher, rolls_slice = alloc_entry
                col_paper[c] = code
                col_teacher[c] = teacher
                for r, roll in enumerate(rolls_slice):
                    student = active_sbr.get(roll, {"name": roll})
                    grid[r][c] = {
                        "roll_no": roll,
                        "name": student.get("name", roll),
                        "course_code": code,
                        "seat": f"Row {r + 1}, Col {c + 1}",
                    }
                    seated += 1

            util = (seated / r_usable * 100) if r_usable else 0
            room_out = {
                "room_id": room["id"],
                "room_name": room["name"],
                "rows": rows,
                "columns": cols,
                "capacity": room["capacity"],
                "usable_capacity": r_usable,
                "seated": seated,
                "utilisation_pct": round(util, 1),
                "utilisation_flag": "LOW" if util < 70 else ("OK" if util >= 85 else "FAIR"),
                "grid": grid,
                "column_papers": col_paper,
                "column_teachers": col_teacher,
                "adjacent_rule_pass": check_adjacent_columns(grid, rows, cols),
                "single_paper": len(pair) < 2,
            }
            room_out["seating_sheet"] = build_seating_sheet(room_out, course_instructor_map, student_by_roll=active_sbr)
            rooms_out.append(room_out)

    overall_seated = sum(r["seated"] for r in rooms_out)
    total_usable_cap = sum(r["usable_capacity"] for r in rooms_out)
    overall_util = (overall_seated / total_usable_cap * 100) if total_usable_cap else 0
    all_pass = all(r["adjacent_rule_pass"] for r in rooms_out)
    empty_pass = _verify_empty_chairs_rule(rooms_out, expected_groups, EXTRA_EMPTY_CHAIRS)

    return {
        "rooms": rooms_out,
        "total_students": overall_seated,
        "total_capacity": total_usable_cap,
        "physical_capacity": sum(r["capacity"] for r in rooms_out),
        "utilisation_pct": round(overall_util, 1),
        "adjacent_rule_pass": all_pass,
        "extra_empty_chairs": EXTRA_EMPTY_CHAIRS,
        "empty_chairs_rule_pass": empty_pass,
    }
