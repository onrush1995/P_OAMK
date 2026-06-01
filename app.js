(() => {
  const STORAGE_KEY = "housekeeping_teamlead_v1";
  const THEME_STORAGE_KEY = "housekeeping_theme_v1";
  const STAFF_SEED_VERSION = 1;
  const MAX_ROOMS_PER_PERSON = 14;
  const THEME_MODE_OPTIONS = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
  ];
  const LIGHT_CONTRAST_OPTIONS = [
    {
      value: "default",
      label: "Default",
      description: "Slightly darker sidebar than main panel.",
    },
    {
      value: "low-contrast",
      label: "Low Contrast",
      description: "Sidebar and main panel use the same background.",
    },
    {
      value: "all-white",
      label: "All White",
      description: "White sidebar and white main panel.",
    },
    {
      value: "high-contrast",
      label: "High Contrast",
      description: "Dark sidebar with a light main panel.",
    },
  ];
  const DARK_CONTRAST_OPTIONS = [
    {
      value: "true-black",
      label: "True Black",
      description: "Pure black sidebar and pure black main panel.",
    },
  ];
  const DEFAULT_THEME_SETTINGS = {
    mode: "dark",
    lightContrast: "default",
    darkContrast: "true-black",
  };
  const STATUS_OPTIONS = [
    { value: "dirty", label: "Dirty", className: "status-dirty" },
    { value: "clean", label: "Clean", className: "status-clean" },
  ];
  const DEFAULT_TEAM_SEED = [
    { name: "Alex", role: "Senior Attendant" },
    { name: "Ravi", role: "Housekeeper" },
    { name: "Maya", role: "Housekeeper" },
    { name: "Sara", role: "Housekeeper" },
    { name: "John", role: "Housekeeper" },
    { name: "Lina", role: "Housekeeper" },
    { name: "Omar", role: "Housekeeper" },
    { name: "Priya", role: "Housekeeper" },
    { name: "Daniel", role: "Housekeeper" },
    { name: "Fatima", role: "Housekeeper" },
    { name: "Noah", role: "Housekeeper" },
    { name: "Emma", role: "Housekeeper" },
    { name: "Lucas", role: "Housekeeper" },
  ];
  const FLOOR_PLAN_RANGES = [
    { start: 201, end: 223, floor: "2" },
    { start: 301, end: 324, floor: "3" },
    { start: 401, end: 425, floor: "4" },
    { start: 501, end: 524, floor: "5" },
    { start: 601, end: 625, floor: "6" },
  ];

  const initialState = {
    staff: buildDefaultStaff(),
    rooms: buildRoomsFromRanges(FLOOR_PLAN_RANGES),
    plansByDate: {},
    availabilityByDate: {},
    staffSeedVersion: STAFF_SEED_VERSION,
  };

  const refs = {
    workDate: document.querySelector("#workDate"),
    themeToggleBtn: document.querySelector("#themeToggleBtn"),
    themeContrastSelect: document.querySelector("#themeContrastSelect"),
    themeContrastDescription: document.querySelector("#themeContrastDescription"),
    statsRow: document.querySelector("#statsRow"),
    dirtyStaffStats: document.querySelector("#dirtyStaffStats"),
    statusPieChart: document.querySelector("#statusPieChart"),
    staffList: document.querySelector("#staffList"),
    roomList: document.querySelector("#roomList"),
    assignmentBody: document.querySelector("#assignmentBody"),
    staffTemplate: document.querySelector("#staffItemTemplate"),
    roomTemplate: document.querySelector("#roomItemTemplate"),
    addStaffBtn: document.querySelector("#addStaffBtn"),
    addRoomBtn: document.querySelector("#addRoomBtn"),
    startMorningBtn: document.querySelector("#startMorningBtn"),
    loadFloorPlanBtn: document.querySelector("#loadFloorPlanBtn"),
    autoAssignBtn: document.querySelector("#autoAssignBtn"),
    resetStatusBtn: document.querySelector("#resetStatusBtn"),
    dirtyRoomCountInput: document.querySelector("#dirtyRoomCountInput"),
    copyShareBtn: document.querySelector("#copyShareBtn"),
    printBtn: document.querySelector("#printBtn"),
  };

  let state = loadState();
  let themeSettings = loadThemeSettings();
  let selectedDate = todayISO();
  let roomStatusChart = null;

  init();

  function init() {
    migrateDefaultStaffSeed();
    migrateStarterRoomsToFloorPlan();
    refs.workDate.value = selectedDate;
    ensurePlanForDate(selectedDate);
    applyThemeSettings();
    bindEvents();
    renderThemeControls();
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

    refs.loadFloorPlanBtn.addEventListener("click", () => {
      const shouldReplace = confirm(
        "Load floor plan rooms 201-223, 301-324, 401-425, 501-524, 601-625? This replaces current rooms and daily assignments."
      );
      if (!shouldReplace) {
        return;
      }

      replaceWithConfiguredFloorPlan();
      renderAll();
    });

    refs.autoAssignBtn.addEventListener("click", () => {
      autoAssignRooms();
      renderAll();
    });

    refs.resetStatusBtn.addEventListener("click", () => {
      const plan = getPlan(selectedDate);
      plan.assignments.forEach((assignment) => {
        assignment.status = "dirty";
      });
      saveState();
      renderAll();
    });

    refs.dirtyRoomCountInput.addEventListener("change", (event) => {
      applyDirtyRoomCountForSelectedDate(event.target.value);
      renderAll();
    });

    refs.copyShareBtn.addEventListener("click", async () => {
      await copyHandoffText();
    });

    refs.printBtn.addEventListener("click", () => {
      printSheet();
    });

    if (refs.themeToggleBtn) {
      refs.themeToggleBtn.addEventListener("click", () => {
        toggleThemeMode();
      });
    }

    if (refs.themeContrastSelect) {
      refs.themeContrastSelect.addEventListener("change", (event) => {
        setThemeContrastForActiveMode(event.target.value);
      });
    }

    document.addEventListener("keydown", handleThemeHotkeys);
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
        availabilityByDate:
          parsed.availabilityByDate && typeof parsed.availabilityByDate === "object" ? parsed.availabilityByDate : {},
        staffSeedVersion: Number.isFinite(parsed.staffSeedVersion) ? parsed.staffSeedVersion : 0,
      };
    } catch (error) {
      console.error("Unable to parse stored data. Using defaults.", error);
      return structuredCloneIfPossible(initialState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadThemeSettings() {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) {
      return structuredCloneIfPossible(DEFAULT_THEME_SETTINGS);
    }

    try {
      const parsed = JSON.parse(raw);
      const mode = normalizeThemeMode(parsed.mode);
      return {
        mode,
        lightContrast: normalizeContrastForMode("light", parsed.lightContrast),
        darkContrast: "true-black",
      };
    } catch (error) {
      console.error("Unable to parse theme settings. Using defaults.", error);
      return structuredCloneIfPossible(DEFAULT_THEME_SETTINGS);
    }
  }

  function saveThemeSettings() {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeSettings));
  }

  function renderThemeControls() {
    if (refs.themeToggleBtn) {
      const isDarkMode = themeSettings.mode === "dark";
      refs.themeToggleBtn.textContent = isDarkMode ? "Dark Mode: On (True Black)" : "Dark Mode: Off";
      refs.themeToggleBtn.setAttribute("aria-pressed", isDarkMode ? "true" : "false");
    }
    renderThemeContrastOptions();
  }

  function renderThemeContrastOptions() {
    if (!refs.themeContrastSelect) {
      return;
    }

    refs.themeContrastSelect.innerHTML = LIGHT_CONTRAST_OPTIONS
      .map((option) => `<option value="${option.value}">${option.label}</option>`)
      .join("");
    refs.themeContrastSelect.value = normalizeContrastForMode("light", themeSettings.lightContrast);
    const isDarkMode = themeSettings.mode === "dark";
    refs.themeContrastSelect.disabled = isDarkMode;
    refs.themeContrastSelect.title = isDarkMode ? "Switch dark mode off to change light style." : "";
    renderThemeDescription();
  }

  function renderThemeDescription() {
    if (!refs.themeContrastDescription) {
      return;
    }

    if (themeSettings.mode === "dark") {
      refs.themeContrastDescription.textContent = "Dark: True black is active.";
      return;
    }

    const match = LIGHT_CONTRAST_OPTIONS.find(
      (option) => option.value === normalizeContrastForMode("light", themeSettings.lightContrast)
    );
    refs.themeContrastDescription.textContent = `Light: ${match?.description || ""}`;
  }

  function applyThemeSettings() {
    const mode = normalizeThemeMode(themeSettings.mode);
    const contrast = getActiveContrastForMode(mode);
    document.body.dataset.themeMode = mode;
    document.body.dataset.themeContrast = contrast;
    renderThemeDescription();
  }

  function setThemeMode(modeValue) {
    themeSettings.mode = normalizeThemeMode(modeValue);
    if (themeSettings.mode === "dark") {
      themeSettings.darkContrast = "true-black";
    }
    applyThemeSettings();
    renderThemeControls();
    saveThemeSettings();
  }

  function setThemeContrastForActiveMode(contrastValue) {
    setThemeContrastForMode("light", contrastValue);
    applyThemeSettings();
    renderThemeControls();
    saveThemeSettings();
  }

  function setThemeContrastForMode(mode, contrastValue) {
    if (mode === "light") {
      themeSettings.lightContrast = normalizeContrastForMode("light", contrastValue);
      return;
    }
    themeSettings.darkContrast = "true-black";
  }

  function getActiveContrastForMode(mode) {
    if (mode === "light") {
      return normalizeContrastForMode("light", themeSettings.lightContrast);
    }
    return "true-black";
  }

  function getContrastOptionsForMode(mode) {
    return mode === "light" ? LIGHT_CONTRAST_OPTIONS : DARK_CONTRAST_OPTIONS;
  }

  function normalizeThemeMode(modeValue) {
    return THEME_MODE_OPTIONS.some((option) => option.value === modeValue) ? modeValue : "dark";
  }

  function normalizeContrastForMode(mode, contrastValue) {
    if (mode === "dark") {
      return "true-black";
    }
    const options = getContrastOptionsForMode(mode);
    return options.some((option) => option.value === contrastValue) ? contrastValue : options[0].value;
  }

  function cycleContrastForMode(mode) {
    const options = getContrastOptionsForMode(mode);
    const current = getActiveContrastForMode(mode);
    const currentIndex = Math.max(
      0,
      options.findIndex((option) => option.value === current)
    );
    const next = options[(currentIndex + 1) % options.length];
    setThemeContrastForMode(mode, next.value);
    themeSettings.mode = mode;
    applyThemeSettings();
    renderThemeControls();
    saveThemeSettings();
  }

  function toggleThemeMode() {
    const nextMode = themeSettings.mode === "light" ? "dark" : "light";
    setThemeMode(nextMode);
  }

  function handleThemeHotkeys(event) {
    if (event.defaultPrevented) {
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey || !event.shiftKey) {
      return;
    }

    if (isTypingTarget(event.target)) {
      return;
    }

    const key = String(event.key || "").toLowerCase();
    if (key === "m") {
      event.preventDefault();
      toggleThemeMode();
      return;
    }

    if (key === "l") {
      event.preventDefault();
      cycleContrastForMode("light");
      return;
    }

    if (key === "d") {
      event.preventDefault();
      setThemeMode("dark");
    }
  }

  function migrateDefaultStaffSeed() {
    if (state.staffSeedVersion >= STAFF_SEED_VERSION) {
      return;
    }

    const existingNames = new Set(state.staff.map((staff) => normalizeName(staff.name)));
    DEFAULT_TEAM_SEED.forEach((seedStaff) => {
      if (existingNames.has(normalizeName(seedStaff.name))) {
        return;
      }

      state.staff.push({
        id: makeId(),
        name: seedStaff.name,
        role: seedStaff.role,
      });
    });

    state.staffSeedVersion = STAFF_SEED_VERSION;
    saveState();
  }

  function migrateStarterRoomsToFloorPlan() {
    if (!isLegacyStarterRoomList(state.rooms)) {
      return;
    }

    replaceWithConfiguredFloorPlan();
  }

  function replaceWithConfiguredFloorPlan() {
    state.rooms = buildRoomsFromRanges(FLOOR_PLAN_RANGES);
    state.plansByDate = {};
    ensurePlanForDate(selectedDate);
    saveState();
  }

  function getPlan(dateKey) {
    if (!state.plansByDate[dateKey]) {
      state.plansByDate[dateKey] = { assignments: [] };
    }
    return state.plansByDate[dateKey];
  }

  function ensurePlanForDate(dateKey) {
    const plan = getPlan(dateKey);
    const availableStaffMap = getAvailabilityMap(dateKey);
    const existingByRoomId = new Map(
      (plan.assignments || []).filter(Boolean).map((assignment) => [assignment.roomId, assignment])
    );

    plan.assignments = state.rooms.map((room) => {
      const existing = existingByRoomId.get(room.id);
      if (existing) {
        return {
          ...existing,
          roomId: room.id,
          staffId: staffExists(existing.staffId) && availableStaffMap[existing.staffId] !== false ? existing.staffId : "",
          status: normalizeStatus(existing.status),
          notes: existing.notes || "",
        };
      }

      return {
        id: makeId(),
        roomId: room.id,
        staffId: findPreviousStaffForRoom(room.id, dateKey),
        status: "dirty",
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
      status: "dirty",
      notes: "",
    }));
    saveState();
  }

  function autoAssignRooms() {
    const availableStaff = getAvailableStaffForDate(selectedDate);
    if (!availableStaff.length) {
      alert("Select at least one working team member for this date before auto assignment.");
      return;
    }

    const plan = getPlan(selectedDate);
    const sortedAssignments = getSortedAssignments(plan.assignments);
    const dirtyAssignments = sortedAssignments.filter((assignment) => assignment.status === "dirty");

    // Clean rooms do not need active assignment on the morning sheet.
    sortedAssignments
      .filter((assignment) => assignment.status !== "dirty")
      .forEach((assignment) => {
        assignment.staffId = "";
      });

    if (!dirtyAssignments.length) {
      saveState();
      return;
    }

    const totalCapacity = availableStaff.length * MAX_ROOMS_PER_PERSON;
    const assignableDirtyCount = Math.min(dirtyAssignments.length, totalCapacity);
    const baseQuota = Math.floor(assignableDirtyCount / availableStaff.length);
    const extraQuotaCount = assignableDirtyCount % availableStaff.length;
    const dayOffset = new Date(selectedDate).getDate() % availableStaff.length;
    const rotatedStaff = rotateArray(availableStaff, dayOffset);
    const staffBuckets = availableStaff.map((staff) => ({
      staffId: staff.id,
      roomCount: 0,
      floors: new Set(),
      targetQuota: baseQuota,
    }));
    rotatedStaff.slice(0, extraQuotaCount).forEach((staff) => {
      const bucket = staffBuckets.find((item) => item.staffId === staff.id);
      if (bucket) {
        bucket.targetQuota += 1;
      }
    });
    const groupedDirtyAssignments = getAssignmentsGroupedByFloor(dirtyAssignments).sort(
      (a, b) => b.assignments.length - a.assignments.length
    );

    groupedDirtyAssignments.forEach((group) => {
      const floorQueue = [...group.assignments];

      while (floorQueue.length) {
        const selectedBucket = pickBestStaffBucketForFloor(staffBuckets, group.floor);
        if (!selectedBucket) {
          floorQueue.forEach((remainingAssignment) => {
            remainingAssignment.staffId = "";
          });
          break;
        }

        const remainingQuota = selectedBucket.targetQuota - selectedBucket.roomCount;
        const chunkSize = Math.min(remainingQuota, floorQueue.length);

        for (let index = 0; index < chunkSize; index += 1) {
          const assignment = floorQueue.shift();
          assignment.staffId = selectedBucket.staffId;
          selectedBucket.roomCount += 1;
        }

        selectedBucket.floors.add(group.floor);
      }
    });

    const assignedDirtyCount = dirtyAssignments.filter((assignment) => assignment.staffId).length;
    const unassignedDirtyCount = dirtyAssignments.length - assignedDirtyCount;
    if (unassignedDirtyCount > 0) {
      alert(
        `Smart assign capacity reached. Assigned ${assignedDirtyCount}/${dirtyAssignments.length} dirty rooms. Max ${MAX_ROOMS_PER_PERSON} rooms per person.`
      );
    }

    saveState();
  }

  function onAddStaff() {
    const name = prompt("Staff name:");
    if (!name) {
      return;
    }

    const role = prompt("Role (optional):") || "Housekeeper";
    const newStaff = { id: makeId(), name: name.trim(), role: role.trim() || "Housekeeper" };
    state.staff.push(newStaff);
    getAvailabilityMap(selectedDate)[newStaff.id] = true;

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
    Object.values(state.availabilityByDate || {}).forEach((availabilityMap) => {
      delete availabilityMap[staffId];
    });
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
    renderStatusPieChart();
    renderDirtyStaffStats();
    renderDirtyRoomCountInput();
    renderStaffList();
    renderRoomList();
    renderAssignmentBoard();
  }

  function renderStats() {
    const plan = getPlan(selectedDate);
    const assignments = plan.assignments;

    const totalRooms = assignments.length;
    const cleanRooms = assignments.filter((item) => item.status === "clean").length;
    const dirtyRooms = assignments.filter((item) => item.status === "dirty").length;
    const unassigned = assignments.filter((item) => !item.staffId).length;

    const cards = [
      { label: "Total Rooms", value: totalRooms },
      { label: "Clean", value: cleanRooms },
      { label: "Dirty", value: dirtyRooms },
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

  function renderDirtyRoomCountInput() {
    const plan = getPlan(selectedDate);
    const dirtyCount = countDirtyAssignments(plan.assignments);
    refs.dirtyRoomCountInput.max = String(plan.assignments.length);
    refs.dirtyRoomCountInput.value = String(dirtyCount);
  }

  function renderStatusPieChart() {
    if (!refs.statusPieChart || typeof Highcharts === "undefined") {
      return;
    }

    const plan = getPlan(selectedDate);
    const totalRooms = plan.assignments.length;
    const dirtyRooms = countDirtyAssignments(plan.assignments);
    const cleanRooms = totalRooms - dirtyRooms;
    const chartData = [
      {
        name: "Dirty",
        y: dirtyRooms,
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 1, y2: 1 },
          stops: [
            [0, "#ffd58a"],
            [1, "#b7721c"],
          ],
        },
      },
      {
        name: "Clean",
        y: cleanRooms,
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 1, y2: 1 },
          stops: [
            [0, "#6ee7b7"],
            [1, "#0f9f6e"],
          ],
        },
      },
    ];

    if (!roomStatusChart) {
      roomStatusChart = Highcharts.chart("statusPieChart", {
        chart: {
          type: "pie",
          backgroundColor: "transparent",
          custom: { totalValue: totalRooms },
          events: {
            render() {
              const chart = this;
              const series = chart.series[0];
              if (!series || !series.center) {
                return;
              }
              let customLabel = chart.options.chart.custom.label;

              if (!customLabel) {
                customLabel = chart.options.chart.custom.label = chart.renderer
                  .label("")
                  .css({
                    color: "var(--highcharts-neutral-color-100, #eaf4ff)",
                    textAnchor: "middle",
                  })
                  .add();
              }

              const totalValue = chart.options.chart.custom.totalValue || 0;
              customLabel.attr({
                text: `Total<br/><strong>${formatWholeNumber(totalValue)}</strong>`,
              });

              const x = series.center[0] + chart.plotLeft;
              const labelHeight = customLabel.attr("height") || 0;
              const y = series.center[1] + chart.plotTop - labelHeight / 2;

              customLabel.attr({ x, y });
              customLabel.css({
                fontSize: `${series.center[2] / 12}px`,
              });
            },
          },
        },
        accessibility: {
          point: {
            valueSuffix: "%",
          },
        },
        title: { text: null },
        subtitle: { text: null },
        tooltip: {
          backgroundColor: "rgba(11, 22, 38, 0.96)",
          borderColor: "#2f4969",
          borderRadius: 10,
          pointFormat: "{series.name}: <b>{point.percentage:.0f}%</b>",
          style: {
            color: "#f0f7ff",
          },
        },
        legend: { enabled: false },
        plotOptions: {
          series: {
            allowPointSelect: true,
            cursor: "pointer",
            borderRadius: 8,
            dataLabels: [
              {
                enabled: true,
                distance: 20,
                format: "{point.name}",
                style: {
                  color: "#eff6ff",
                  fontSize: "0.84em",
                  textOutline: "none",
                },
              },
              {
                enabled: true,
                distance: -15,
                format: "{point.percentage:.0f}%",
                style: {
                  color: "#f8fcff",
                  fontSize: "0.9em",
                  textOutline: "none",
                },
              },
            ],
            showInLegend: true,
            states: {
              hover: {
                enabled: true,
                halo: {
                  size: 7,
                  opacity: 0.28,
                },
              },
            },
          },
        },
        series: [
          {
            name: "Room Status",
            colorByPoint: true,
            innerSize: "75%",
            data: chartData,
          },
        ],
      });
      return;
    }

    roomStatusChart.update(
      {
        chart: {
          custom: {
            ...roomStatusChart.options.chart.custom,
            totalValue: totalRooms,
          },
        },
      },
      false
    );
    roomStatusChart.series[0].setData(chartData, true);
  }

  function renderDirtyStaffStats() {
    if (!refs.dirtyStaffStats) {
      return;
    }

    if (!state.staff.length) {
      refs.dirtyStaffStats.innerHTML = "";
      return;
    }

    const plan = getPlan(selectedDate);
    const availabilityMap = getAvailabilityMap(selectedDate);
    const dirtyByStaffId = new Map(state.staff.map((staff) => [staff.id, 0]));
    const totalByStaffId = new Map(state.staff.map((staff) => [staff.id, 0]));

    plan.assignments.forEach((assignment) => {
      if (!assignment.staffId || !dirtyByStaffId.has(assignment.staffId)) {
        return;
      }

      totalByStaffId.set(assignment.staffId, (totalByStaffId.get(assignment.staffId) || 0) + 1);
      if (assignment.status === "dirty") {
        dirtyByStaffId.set(assignment.staffId, (dirtyByStaffId.get(assignment.staffId) || 0) + 1);
      }
    });

    const rows = state.staff
      .map((staff) => ({
        staff,
        dirty: dirtyByStaffId.get(staff.id) || 0,
        total: totalByStaffId.get(staff.id) || 0,
        isWorking: availabilityMap[staff.id] !== false,
      }))
      .sort((a, b) => {
        if (b.dirty !== a.dirty) {
          return b.dirty - a.dirty;
        }
        if (b.total !== a.total) {
          return b.total - a.total;
        }
        return a.staff.name.localeCompare(b.staff.name, undefined, { sensitivity: "base" });
      });

    refs.dirtyStaffStats.innerHTML = rows
      .map(
        (entry) => `
        <article class="dirty-person-card${entry.isWorking ? "" : " off-shift"}">
          <p class="dirty-person-name">${escapeHtml(entry.staff.name)}</p>
          <p class="dirty-person-value">${entry.dirty} dirty</p>
          <p class="dirty-person-meta">${entry.total} total | ${entry.isWorking ? "Working" : "Off"}</p>
        </article>
      `
      )
      .join("");
  }

  function renderStaffList() {
    refs.staffList.innerHTML = "";
    const todayPlan = getPlan(selectedDate);
    const availabilityMap = getAvailabilityMap(selectedDate);

    if (!state.staff.length) {
      refs.staffList.innerHTML = '<p class="empty">No staff yet. Add your team members.</p>';
      return;
    }

    state.staff.forEach((staff) => {
      const node = refs.staffTemplate.content.cloneNode(true);
      const workload = todayPlan.assignments.filter((assignment) => assignment.staffId === staff.id).length;
      const dirtyWorkload = todayPlan.assignments.filter(
        (assignment) => assignment.staffId === staff.id && assignment.status === "dirty"
      ).length;
      const isWorkingToday = availabilityMap[staff.id] !== false;

      node.querySelector(".item-title").textContent = staff.name;
      node.querySelector(".item-sub").textContent = `${staff.role || "Housekeeper"} | Dirty ${dirtyWorkload} | Total ${workload}`;

      const availabilityToggle = node.querySelector(".availability-toggle");
      const availabilityText = node.querySelector(".availability-text");
      availabilityToggle.checked = isWorkingToday;
      availabilityText.textContent = isWorkingToday ? "Working" : "Off";
      availabilityToggle.addEventListener("change", (event) => {
        setStaffAvailabilityForSelectedDate(staff.id, event.target.checked);
        renderAll();
      });

      node.querySelector(".delete-btn").addEventListener("click", () => removeStaff(staff.id));

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

    const groupedRooms = getRoomsGroupedByFloor(state.rooms);

    groupedRooms.forEach((group) => {
      const floorLabel = document.createElement("div");
      floorLabel.className = "list-group-title";
      floorLabel.textContent = `Floor ${group.floor}`;
      refs.roomList.appendChild(floorLabel);

      group.rooms.forEach((room) => {
        const node = refs.roomTemplate.content.cloneNode(true);
        const assignment = todayPlan.assignments.find((item) => item.roomId === room.id);
        const assignedName = assignment ? getStaffName(assignment.staffId) : "Unassigned";

        node.querySelector(".item-title").textContent = `Room ${room.name}`;
        node.querySelector(".item-sub").textContent = `${room.type || "Standard"} | ${assignedName}`;
        node.querySelector("button").addEventListener("click", () => removeRoom(room.id));

        refs.roomList.appendChild(node);
      });
    });
  }

  function renderAssignmentBoard() {
    const plan = getPlan(selectedDate);
    refs.assignmentBody.innerHTML = "";

    if (!plan.assignments.length) {
      refs.assignmentBody.innerHTML = '<tr><td colspan="4" class="empty">No rooms in this plan yet.</td></tr>';
      return;
    }

    const groupedAssignments = getAssignmentsGroupedByFloor(plan.assignments);

    groupedAssignments.forEach((group) => {
      const floorRow = document.createElement("tr");
      floorRow.className = "floor-divider";
      floorRow.innerHTML = `<td colspan="4">Floor ${escapeHtml(group.floor)}</td>`;
      refs.assignmentBody.appendChild(floorRow);

      group.assignments.forEach((assignment) => {
        const room = getRoom(assignment.roomId);
        const row = document.createElement("tr");

        const roomCell = document.createElement("td");
        const roomLabel = document.createElement("strong");
        roomLabel.textContent = room ? `Room ${room.name}` : "Unknown room";

        const roomMeta = document.createElement("p");
        roomMeta.className = "item-sub";
        roomMeta.textContent = [room?.type || "Standard", room?.notes || ""].filter(Boolean).join(" | ");

        roomCell.append(roomLabel, roomMeta);

        const staffCell = document.createElement("td");
        const staffSelect = document.createElement("select");
        const availableStaff = getAvailableStaffForDate(selectedDate);
        staffSelect.innerHTML = `<option value="">Unassigned</option>${availableStaff
          .map((staff) => `<option value="${staff.id}">${escapeHtml(staff.name)}</option>`)
          .join("")}`;
        staffSelect.value = assignment.staffId || "";
        staffSelect.addEventListener("change", (event) => {
          assignment.staffId = event.target.value;
          saveState();
          renderStats();
          renderStatusPieChart();
          renderDirtyStaffStats();
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
          renderStatusPieChart();
          renderDirtyStaffStats();
          renderDirtyRoomCountInput();
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
    });
  }

  async function copyHandoffText() {
    const plan = getPlan(selectedDate);
    const assignments = getSortedAssignments(plan.assignments);
    const groupedAssignments = getAssignmentsGroupedByFloor(assignments);

    const clean = assignments.filter((item) => item.status === "clean").length;
    const dirty = countDirtyAssignments(assignments);

    const lines = [
      `Housekeeping Morning Sheet - ${selectedDate}`,
      `Total Rooms: ${assignments.length} | Dirty: ${dirty} | Clean: ${clean}`,
      "",
    ];

    groupedAssignments.forEach((group) => {
      lines.push(`Floor ${group.floor}`);
      group.assignments.forEach((assignment) => {
        const roomName = getRoom(assignment.roomId)?.name || "Unknown";
        const staffName = getStaffName(assignment.staffId);
        const notes = assignment.notes ? ` | Notes: ${assignment.notes}` : "";
        lines.push(`Room ${roomName} | ${staffName} | ${statusLabel(assignment.status)}${notes}`);
      });
      lines.push("");
    });

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

  function printSheet() {
    const plan = getPlan(selectedDate);
    const assignments = getSortedAssignments(plan.assignments);
    const groupedAssignments = getAssignmentsGroupedByFloor(assignments);
    const cleanCount = assignments.filter((item) => item.status === "clean").length;
    const dirtyCount = countDirtyAssignments(assignments);

    const floorTables = groupedAssignments
      .map((group) => {
        const rows = group.assignments
          .map((assignment) => {
            const room = getRoom(assignment.roomId);
            const roomLabel = room ? `Room ${room.name}` : "Unknown room";
            const roomMeta = [room?.type || "Standard", room?.notes || ""].filter(Boolean).join(" | ");
            const assignee = getStaffName(assignment.staffId);
            const status = statusLabel(assignment.status);
            const notes = assignment.notes || "-";

            return `<tr>
              <td>
                <strong>${escapeHtml(roomLabel)}</strong>
                <div class="sub">${escapeHtml(roomMeta || "-")}</div>
              </td>
              <td>${escapeHtml(assignee)}</td>
              <td>${escapeHtml(status)}</td>
              <td>${escapeHtml(notes)}</td>
            </tr>`;
          })
          .join("");

        return `<section class="floor-block">
          <h2>Floor ${escapeHtml(group.floor)}</h2>
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Assigned To</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
      })
      .join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      // Fallback for browsers that block popups from embedded views.
      window.print();
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Housekeeping Sheet ${escapeHtml(selectedDate)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #142433; margin: 24px; }
      h1 { margin: 0 0 6px; font-size: 24px; }
      h2 { margin: 0 0 8px; font-size: 17px; color: #2e4b63; }
      .meta { margin: 0 0 16px; color: #36536d; font-size: 14px; }
      .summary { margin: 0 0 16px; font-size: 14px; }
      .floor-block { margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #cbd6e2; padding: 8px; text-align: left; vertical-align: top; font-size: 13px; }
      th { background: #eef4fb; }
      .sub { color: #4f6579; font-size: 12px; margin-top: 4px; }
      @media print { body { margin: 10mm; } .floor-block { break-inside: avoid; } }
    </style>
  </head>
  <body>
    <h1>Morning Housekeeping Sheet</h1>
    <p class="meta">Date: ${escapeHtml(selectedDate)}</p>
    <p class="summary">Total Rooms: ${assignments.length} | Dirty: ${dirtyCount} | Clean: ${cleanCount}</p>
    ${floorTables}
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 200);
    };
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

  function getAvailabilityMap(dateKey) {
    if (!state.availabilityByDate || typeof state.availabilityByDate !== "object") {
      state.availabilityByDate = {};
    }

    if (!state.availabilityByDate[dateKey] || typeof state.availabilityByDate[dateKey] !== "object") {
      state.availabilityByDate[dateKey] = {};
    }

    const availabilityMap = state.availabilityByDate[dateKey];
    state.staff.forEach((staff) => {
      if (typeof availabilityMap[staff.id] !== "boolean") {
        availabilityMap[staff.id] = true;
      }
    });

    return availabilityMap;
  }

  function getAvailableStaffForDate(dateKey) {
    const availabilityMap = getAvailabilityMap(dateKey);
    return state.staff.filter((staff) => availabilityMap[staff.id] !== false);
  }

  function setStaffAvailabilityForSelectedDate(staffId, isAvailable) {
    const availabilityMap = getAvailabilityMap(selectedDate);
    availabilityMap[staffId] = Boolean(isAvailable);

    if (!isAvailable) {
      const plan = getPlan(selectedDate);
      plan.assignments.forEach((assignment) => {
        if (assignment.staffId === staffId) {
          assignment.staffId = "";
        }
      });
    }

    saveState();
  }

  function applyDirtyRoomCountForSelectedDate(rawCount) {
    const plan = getPlan(selectedDate);
    const maxRooms = plan.assignments.length;
    const parsedCount = Number.parseInt(String(rawCount), 10);
    const dirtyRoomCount = clampNumber(Number.isFinite(parsedCount) ? parsedCount : 0, 0, maxRooms);

    const sortedAssignments = getSortedAssignments(plan.assignments);
    sortedAssignments.forEach((assignment, index) => {
      assignment.status = index < dirtyRoomCount ? "dirty" : "clean";
    });

    saveState();
  }

  function pickBestStaffBucketForFloor(staffBuckets, floorLabel) {
    const candidates = staffBuckets.filter((bucket) => bucket.roomCount < bucket.targetQuota);
    if (!candidates.length) {
      return null;
    }

    candidates.sort((bucketA, bucketB) => {
      const floorPenaltyA = floorPenaltyForBucket(bucketA, floorLabel);
      const floorPenaltyB = floorPenaltyForBucket(bucketB, floorLabel);
      if (floorPenaltyA !== floorPenaltyB) {
        return floorPenaltyA - floorPenaltyB;
      }

      const remainingA = bucketA.targetQuota - bucketA.roomCount;
      const remainingB = bucketB.targetQuota - bucketB.roomCount;
      if (remainingA !== remainingB) {
        return remainingB - remainingA;
      }

      if (bucketA.floors.size !== bucketB.floors.size) {
        return bucketA.floors.size - bucketB.floors.size;
      }

      return bucketA.staffId.localeCompare(bucketB.staffId);
    });

    return candidates[0];
  }

  function floorPenaltyForBucket(staffBucket, floorLabel) {
    if (staffBucket.floors.has(floorLabel)) {
      return 0;
    }

    if (staffBucket.floors.size === 0) {
      return 1;
    }

    return 5 + staffBucket.floors.size;
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
    return STATUS_OPTIONS.some((item) => item.value === statusValue) ? statusValue : "dirty";
  }

  function statusLabel(statusValue) {
    return STATUS_OPTIONS.find((item) => item.value === statusValue)?.label || "Dirty";
  }

  function statusClass(statusValue) {
    return STATUS_OPTIONS.find((item) => item.value === statusValue)?.className || "status-dirty";
  }

  function countDirtyAssignments(assignments) {
    return assignments.filter((assignment) => assignment.status === "dirty").length;
  }

  function getSortedAssignments(assignments) {
    return [...assignments].sort((a, b) => {
      const roomA = getRoom(a.roomId);
      const roomB = getRoom(b.roomId);
      return compareRooms(roomA, roomB);
    });
  }

  function getRoomsGroupedByFloor(rooms) {
    const map = new Map();
    const sortedRooms = [...rooms].sort((a, b) => compareRooms(a, b));

    sortedRooms.forEach((room) => {
      const floor = getFloorLabel(room);
      if (!map.has(floor)) {
        map.set(floor, []);
      }
      map.get(floor).push(room);
    });

    return [...map.entries()].map(([floor, groupedRooms]) => ({ floor, rooms: groupedRooms }));
  }

  function getAssignmentsGroupedByFloor(assignments) {
    const map = new Map();
    const sortedAssignments = getSortedAssignments(assignments);

    sortedAssignments.forEach((assignment) => {
      const floor = getFloorLabel(getRoom(assignment.roomId));
      if (!map.has(floor)) {
        map.set(floor, []);
      }
      map.get(floor).push(assignment);
    });

    return [...map.entries()].map(([floor, groupedAssignments]) => ({
      floor,
      assignments: groupedAssignments,
    }));
  }

  function compareRooms(roomA, roomB) {
    const floorComparison = compareFloorLabels(getFloorLabel(roomA), getFloorLabel(roomB));
    if (floorComparison !== 0) {
      return floorComparison;
    }

    const roomNameA = roomA?.name || "";
    const roomNameB = roomB?.name || "";
    return roomNameA.localeCompare(roomNameB, undefined, { numeric: true, sensitivity: "base" });
  }

  function compareFloorLabels(floorA, floorB) {
    const numA = Number(floorA);
    const numB = Number(floorB);
    const isNumA = Number.isFinite(numA);
    const isNumB = Number.isFinite(numB);

    if (isNumA && isNumB && numA !== numB) {
      return numA - numB;
    }

    if (isNumA && !isNumB) {
      return -1;
    }

    if (!isNumA && isNumB) {
      return 1;
    }

    return floorA.localeCompare(floorB, undefined, { numeric: true, sensitivity: "base" });
  }

  function getFloorLabel(room) {
    const directFloor = room?.floor ? String(room.floor).trim() : "";
    if (directFloor) {
      return directFloor;
    }

    const roomName = room?.name ? String(room.name).trim() : "";
    const floorFromName = roomName.match(/^(\d)/)?.[1];
    if (floorFromName) {
      return floorFromName;
    }

    return "Unknown";
  }

  function buildRoomsFromRanges(ranges) {
    const rooms = [];

    ranges.forEach((range) => {
      for (let roomNo = range.start; roomNo <= range.end; roomNo += 1) {
        rooms.push({
          id: makeId(),
          name: String(roomNo),
          floor: range.floor,
          type: "Standard",
          notes: "",
        });
      }
    });

    return rooms;
  }

  function isLegacyStarterRoomList(rooms) {
    if (!Array.isArray(rooms) || rooms.length !== 4) {
      return false;
    }

    const roomNames = rooms.map((room) => room.name).sort().join(",");
    return roomNames === "101,102,201,202";
  }

  function buildDefaultStaff() {
    return DEFAULT_TEAM_SEED.map((member) => ({
      id: makeId(),
      name: member.name,
      role: member.role,
    }));
  }

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function rotateArray(items, offset) {
    if (!items.length) {
      return [];
    }

    const shift = ((offset % items.length) + items.length) % items.length;
    return [...items.slice(shift), ...items.slice(0, shift)];
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || tagName === "select";
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

  function formatWholeNumber(value) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
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
