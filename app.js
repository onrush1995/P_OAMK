(() => {
  const STORAGE_KEY = "housekeeping_teamlead_v1";
  const STATUS_OPTIONS = [
    { value: "pending", label: "Pending", className: "status-pending" },
    { value: "in_progress", label: "In Progress", className: "status-progress" },
    { value: "done", label: "Done", className: "status-done" },
    { value: "inspected", label: "Inspected", className: "status-inspected" },
  ];

  const initialState = {
    staff: [
      { id: makeId(), name: "Alex", role: "Senior Attendant" },
      { id: makeId(), name: "Ravi", role: "Housekeeper" },
      { id: makeId(), name: "Maya", role: "Housekeeper" },
    ],
    rooms: [
      { id: makeId(), name: "101", floor: "1", type: "Deluxe", notes: "VIP check" },
      { id: makeId(), name: "102", floor: "1", type: "Standard", notes: "" },
      { id: makeId(), name: "201", floor: "2", type: "Suite", notes: "Late checkout" },
      { id: makeId(), name: "202", floor: "2", type: "Standard", notes: "" },
    ],
    plansByDate: {},
  };

  const refs = {
    workDate: document.querySelector("#workDate"),
    statsRow: document.querySelector("#statsRow"),
    staffList: document.querySelector("#staffList"),
    roomList: document.querySelector("#roomList"),
    assignmentBody: document.querySelector("#assignmentBody"),
    staffTemplate: document.querySelector("#staffItemTemplate"),
    roomTemplate: document.querySelector("#roomItemTemplate"),
    addStaffBtn: document.querySelector("#addStaffBtn"),
    addRoomBtn: document.querySelector("#addRoomBtn"),
    startMorningBtn: document.querySelector("#startMorningBtn"),
    autoAssignBtn: document.querySelector("#autoAssignBtn"),
    resetStatusBtn: document.querySelector("#resetStatusBtn"),
    copyShareBtn: document.querySelector("#copyShareBtn"),
    printBtn: document.querySelector("#printBtn"),
  };

  let state = loadState();
  let selectedDate = todayISO();

  init();

  function init() {
    refs.workDate.value = selectedDate;
    ensurePlanForDate(selectedDate);
    bindEvents();
    renderAll();
  }

  function bindEvents() {
    refs.workDate.addEventListener("change", (event) => {
      selectedDate = event.target.value || todayISO();
      ensurePlanForDate(selectedDate);
      saveState();
      renderAll();
    });

    refs.addStaffBtn.addEventListener("click", onAddStaff);
    refs.addRoomBtn.addEventListener("click", onAddRoom);

    refs.startMorningBtn.addEventListener("click", () => {
      startNewMorning();
      renderAll();
    });

    refs.autoAssignBtn.addEventListener("click", () => {
      autoAssignRooms();
      renderAll();
    });

    refs.resetStatusBtn.addEventListener("click", () => {
      const plan = getPlan(selectedDate);
      plan.assignments.forEach((assignment) => {
        assignment.status = "pending";
      });
      saveState();
      renderAll();
    });

    refs.copyShareBtn.addEventListener("click", async () => {
      await copyHandoffText();
    });

    refs.printBtn.addEventListener("click", () => {
      window.print();
    });
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredCloneIfPossible(initialState);
    }

    try {
      const parsed = JSON.parse(raw);
      return {
        staff: Array.isArray(parsed.staff) ? parsed.staff : [],
        rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
        plansByDate: parsed.plansByDate && typeof parsed.plansByDate === "object" ? parsed.plansByDate : {},
      };
    } catch (error) {
      console.error("Unable to parse stored data. Using defaults.", error);
      return structuredCloneIfPossible(initialState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getPlan(dateKey) {
    if (!state.plansByDate[dateKey]) {
      state.plansByDate[dateKey] = { assignments: [] };
    }
    return state.plansByDate[dateKey];
  }

  function ensurePlanForDate(dateKey) {
    const plan = getPlan(dateKey);
    const existingByRoomId = new Map(
      (plan.assignments || []).filter(Boolean).map((assignment) => [assignment.roomId, assignment])
    );

    plan.assignments = state.rooms.map((room) => {
      const existing = existingByRoomId.get(room.id);
      if (existing) {
        return {
          ...existing,
          roomId: room.id,
          staffId: staffExists(existing.staffId) ? existing.staffId : "",
          status: normalizeStatus(existing.status),
          notes: existing.notes || "",
        };
      }

      return {
        id: makeId(),
        roomId: room.id,
        staffId: findPreviousStaffForRoom(room.id, dateKey),
        status: "pending",
        notes: "",
      };
    });
  }

  function startNewMorning() {
    const plan = getPlan(selectedDate);
    plan.assignments = state.rooms.map((room) => ({
      id: makeId(),
      roomId: room.id,
      staffId: findPreviousStaffForRoom(room.id, selectedDate),
      status: "pending",
      notes: "",
    }));
    saveState();
  }

  function autoAssignRooms() {
    if (!state.staff.length) {
      alert("Add team members before auto assignment.");
      return;
    }

    const plan = getPlan(selectedDate);
    const sortedAssignments = [...plan.assignments].sort((a, b) => {
      const roomA = getRoom(a.roomId)?.name || "";
      const roomB = getRoom(b.roomId)?.name || "";
      return roomA.localeCompare(roomB, undefined, { numeric: true, sensitivity: "base" });
    });

    const offset = new Date(selectedDate).getDate() % state.staff.length;
    sortedAssignments.forEach((assignment, index) => {
      assignment.staffId = state.staff[(index + offset) % state.staff.length].id;
    });

    saveState();
  }

  function onAddStaff() {
    const name = prompt("Staff name:");
    if (!name) {
      return;
    }

    const role = prompt("Role (optional):") || "Housekeeper";
    state.staff.push({ id: makeId(), name: name.trim(), role: role.trim() || "Housekeeper" });

    ensurePlanForDate(selectedDate);
    saveState();
    renderAll();
  }

  function onAddRoom() {
    const roomName = prompt("Room number/name:");
    if (!roomName) {
      return;
    }

    const floor = prompt("Floor (optional):") || "";
    const type = prompt("Room type (optional):") || "Standard";
    const notes = prompt("Room notes (optional):") || "";

    state.rooms.push({
      id: makeId(),
      name: roomName.trim(),
      floor: floor.trim(),
      type: type.trim(),
      notes: notes.trim(),
    });

    Object.keys(state.plansByDate).forEach((dateKey) => ensurePlanForDate(dateKey));
    saveState();
    renderAll();
  }

  function removeStaff(staffId) {
    const staff = state.staff.find((item) => item.id === staffId);
    if (!staff) {
      return;
    }

    const confirmed = confirm(`Remove ${staff.name} from team?`);
    if (!confirmed) {
      return;
    }

    state.staff = state.staff.filter((item) => item.id !== staffId);
    Object.values(state.plansByDate).forEach((plan) => {
      plan.assignments.forEach((assignment) => {
        if (assignment.staffId === staffId) {
          assignment.staffId = "";
        }
      });
    });

    saveState();
    renderAll();
  }

  function removeRoom(roomId) {
    const room = state.rooms.find((item) => item.id === roomId);
    if (!room) {
      return;
    }

    const confirmed = confirm(`Remove room ${room.name}?`);
    if (!confirmed) {
      return;
    }

    state.rooms = state.rooms.filter((item) => item.id !== roomId);
    Object.values(state.plansByDate).forEach((plan) => {
      plan.assignments = plan.assignments.filter((assignment) => assignment.roomId !== roomId);
    });

    saveState();
    renderAll();
  }

  function renderAll() {
    ensurePlanForDate(selectedDate);
    renderStats();
    renderStaffList();
    renderRoomList();
    renderAssignmentBoard();
  }

  function renderStats() {
    const plan = getPlan(selectedDate);
    const assignments = plan.assignments;

    const totalRooms = assignments.length;
    const doneRooms = assignments.filter((item) => item.status === "done" || item.status === "inspected").length;
    const inProgress = assignments.filter((item) => item.status === "in_progress").length;
    const unassigned = assignments.filter((item) => !item.staffId).length;

    const cards = [
      { label: "Total Rooms", value: totalRooms },
      { label: "Done / Inspected", value: doneRooms },
      { label: "In Progress", value: inProgress },
      { label: "Unassigned", value: unassigned },
    ];

    refs.statsRow.innerHTML = cards
      .map(
        (card) => `
        <article class="stat-card">
          <p class="stat-label">${escapeHtml(card.label)}</p>
          <p class="stat-value">${escapeHtml(String(card.value))}</p>
        </article>
      `
      )
      .join("");
  }

  function renderStaffList() {
    refs.staffList.innerHTML = "";
    const todayPlan = getPlan(selectedDate);

    if (!state.staff.length) {
      refs.staffList.innerHTML = '<p class="empty">No staff yet. Add your team members.</p>';
      return;
    }

    state.staff.forEach((staff) => {
      const node = refs.staffTemplate.content.cloneNode(true);
      const workload = todayPlan.assignments.filter((assignment) => assignment.staffId === staff.id).length;

      node.querySelector(".item-title").textContent = staff.name;
      node.querySelector(".item-sub").textContent = `${staff.role || "Housekeeper"} | ${workload} room(s)`;
      node.querySelector("button").addEventListener("click", () => removeStaff(staff.id));

      refs.staffList.appendChild(node);
    });
  }

  function renderRoomList() {
    refs.roomList.innerHTML = "";
    const todayPlan = getPlan(selectedDate);

    if (!state.rooms.length) {
      refs.roomList.innerHTML = '<p class="empty">No rooms yet. Add room numbers to begin planning.</p>';
      return;
    }

    const sortedRooms = [...state.rooms].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );

    sortedRooms.forEach((room) => {
      const node = refs.roomTemplate.content.cloneNode(true);
      const assignment = todayPlan.assignments.find((item) => item.roomId === room.id);
      const assignedName = assignment ? getStaffName(assignment.staffId) : "Unassigned";

      node.querySelector(".item-title").textContent = `Room ${room.name}`;
      node.querySelector(".item-sub").textContent = `${room.type || "Standard"} | Floor ${room.floor || "-"} | ${assignedName}`;
      node.querySelector("button").addEventListener("click", () => removeRoom(room.id));

      refs.roomList.appendChild(node);
    });
  }

  function renderAssignmentBoard() {
    const plan = getPlan(selectedDate);
    refs.assignmentBody.innerHTML = "";

    if (!plan.assignments.length) {
      refs.assignmentBody.innerHTML = '<tr><td colspan="4" class="empty">No rooms in this plan yet.</td></tr>';
      return;
    }

    const sortedAssignments = [...plan.assignments].sort((a, b) => {
      const roomA = getRoom(a.roomId)?.name || "";
      const roomB = getRoom(b.roomId)?.name || "";
      return roomA.localeCompare(roomB, undefined, { numeric: true, sensitivity: "base" });
    });

    sortedAssignments.forEach((assignment) => {
      const room = getRoom(assignment.roomId);
      const row = document.createElement("tr");

      const roomCell = document.createElement("td");
      const roomLabel = document.createElement("strong");
      roomLabel.textContent = room ? `Room ${room.name}` : "Unknown room";

      const roomMeta = document.createElement("p");
      roomMeta.className = "item-sub";
      roomMeta.textContent = [room?.type || "Standard", room?.floor ? `Floor ${room.floor}` : "", room?.notes || ""]
        .filter(Boolean)
        .join(" | ");

      roomCell.append(roomLabel, roomMeta);

      const staffCell = document.createElement("td");
      const staffSelect = document.createElement("select");
      staffSelect.innerHTML = `<option value="">Unassigned</option>${state.staff
        .map((staff) => `<option value="${staff.id}">${escapeHtml(staff.name)}</option>`)
        .join("")}`;
      staffSelect.value = assignment.staffId || "";
      staffSelect.addEventListener("change", (event) => {
        assignment.staffId = event.target.value;
        saveState();
        renderStats();
        renderStaffList();
        renderRoomList();
      });
      staffCell.appendChild(staffSelect);

      const statusCell = document.createElement("td");
      const statusSelect = document.createElement("select");
      statusSelect.innerHTML = STATUS_OPTIONS.map(
        (item) => `<option value="${item.value}">${item.label}</option>`
      ).join("");
      statusSelect.value = normalizeStatus(assignment.status);

      const statusBadge = document.createElement("span");
      statusBadge.className = `status-pill ${statusClass(statusSelect.value)}`;
      statusBadge.textContent = statusLabel(statusSelect.value);

      statusSelect.addEventListener("change", (event) => {
        assignment.status = normalizeStatus(event.target.value);
        statusBadge.className = `status-pill ${statusClass(assignment.status)}`;
        statusBadge.textContent = statusLabel(assignment.status);
        saveState();
        renderStats();
      });

      statusCell.append(statusSelect, document.createElement("br"), statusBadge);

      const notesCell = document.createElement("td");
      const notesInput = document.createElement("textarea");
      notesInput.placeholder = "Add a quick note";
      notesInput.value = assignment.notes || "";
      notesInput.addEventListener("change", (event) => {
        assignment.notes = event.target.value.trim();
        saveState();
      });
      notesCell.appendChild(notesInput);

      row.append(roomCell, staffCell, statusCell, notesCell);
      refs.assignmentBody.appendChild(row);
    });
  }

  async function copyHandoffText() {
    const plan = getPlan(selectedDate);
    const assignments = [...plan.assignments].sort((a, b) => {
      const roomA = getRoom(a.roomId)?.name || "";
      const roomB = getRoom(b.roomId)?.name || "";
      return roomA.localeCompare(roomB, undefined, { numeric: true, sensitivity: "base" });
    });

    const done = assignments.filter((item) => item.status === "done" || item.status === "inspected").length;

    const lines = [
      `Housekeeping Morning Sheet - ${selectedDate}`,
      `Total Rooms: ${assignments.length} | Done/Inspected: ${done}`,
      "",
      ...assignments.map((assignment) => {
        const roomName = getRoom(assignment.roomId)?.name || "Unknown";
        const staffName = getStaffName(assignment.staffId);
        const notes = assignment.notes ? ` | Notes: ${assignment.notes}` : "";
        return `Room ${roomName} | ${staffName} | ${statusLabel(assignment.status)}${notes}`;
      }),
    ];

    const handoffText = lines.join("\n");

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(handoffText);
      alert("Handoff text copied to clipboard.");
      return;
    }

    const textArea = document.createElement("textarea");
    textArea.value = handoffText;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    alert("Handoff text copied.");
  }

  function getStaffName(staffId) {
    if (!staffId) {
      return "Unassigned";
    }

    const staff = state.staff.find((item) => item.id === staffId);
    return staff ? staff.name : "Unassigned";
  }

  function getRoom(roomId) {
    return state.rooms.find((room) => room.id === roomId);
  }

  function findPreviousStaffForRoom(roomId, dateKey) {
    const dates = Object.keys(state.plansByDate)
      .filter((key) => key < dateKey)
      .sort()
      .reverse();

    for (const date of dates) {
      const plan = state.plansByDate[date];
      if (!plan || !Array.isArray(plan.assignments)) {
        continue;
      }

      const match = plan.assignments.find(
        (assignment) => assignment.roomId === roomId && assignment.staffId && staffExists(assignment.staffId)
      );

      if (match) {
        return match.staffId;
      }
    }

    return "";
  }

  function staffExists(staffId) {
    return !!state.staff.find((staff) => staff.id === staffId);
  }

  function normalizeStatus(statusValue) {
    return STATUS_OPTIONS.some((item) => item.value === statusValue) ? statusValue : "pending";
  }

  function statusLabel(statusValue) {
    return STATUS_OPTIONS.find((item) => item.value === statusValue)?.label || "Pending";
  }

  function statusClass(statusValue) {
    return STATUS_OPTIONS.find((item) => item.value === statusValue)?.className || "status-pending";
  }

  function todayISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function structuredCloneIfPossible(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function makeId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
