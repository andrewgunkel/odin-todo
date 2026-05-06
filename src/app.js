import { Project } from "./projects.js";
import { Todo } from "./todo.js";
import { createTodoForm } from "./todo-form.js";

const todoContainer = document.querySelector("#app");
const formContainer = document.querySelector("#form-container");
const addTodoBtn = document.querySelector("#add-todo-btn");
const sidebar = document.querySelector("#sidebar");
const projectTitle = document.querySelector("#project-title");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");
const sortBarContainer = document.querySelector("#sort-bar-container");
const sidebarToggleBtn = document.querySelector("#sidebar-toggle-btn");
const sidebarBackdrop = document.querySelector("#sidebar-backdrop");
const selectionBarContainer = document.querySelector("#selection-bar-container");
const projectTabsContainer = document.querySelector("#project-tabs-container");

sidebarToggleBtn.addEventListener("click", () => {
	sidebar.classList.toggle("open");
	sidebarBackdrop.classList.toggle("visible");
});

sidebarBackdrop.addEventListener("click", () => {
	sidebar.classList.remove("open");
	sidebarBackdrop.classList.remove("visible");
});

/* ======================
   STATE
====================== */

const projects = [];
let currentProjectId = null;
let currentView = "project"; // "project" | "inbox"
let currentProjectTab = "board"; // "board" | "resources"
let inbox = [];

window.projects = projects;

let sortBy = "default"; // default | priority | createdAt | updatedAt | dueDate
let sortDir = "asc"; // asc | desc

let selectedTodos = new Set(); // set of todo IDs currently selected
let dragState = null; // { todoIds, source: "project"|"inbox", projectId }

let undoTimer = null;
let undoToastEl = null;
let selectionOverlay = null;

function showColumnDeleteModal(col) {
	const others = columns.filter(c => c.id !== col.id);

	const overlay = document.createElement("div");
	overlay.classList.add("modal-overlay");

	const modal = document.createElement("div");
	modal.classList.add("modal-card");

	const closeBtn = document.createElement("button");
	closeBtn.classList.add("modal-close-btn");
	closeBtn.title = "Cancel";
	closeBtn.addEventListener("click", () => overlay.remove());

	const title = document.createElement("h2");
	title.classList.add("modal-title");
	title.textContent = `You are deleting "${col.label}"`;

	const body = document.createElement("p");
	body.classList.add("modal-body");
	body.textContent = "Do you want to move related todos to another column?";

	const select = document.createElement("select");
	select.classList.add("modal-select");
	others.forEach(c => {
		const opt = document.createElement("option");
		opt.value = c.id;
		opt.textContent = c.label;
		select.appendChild(opt);
	});

	const moveBtn = document.createElement("button");
	moveBtn.classList.add("modal-btn-primary");
	moveBtn.textContent = "Move todos and delete column";
	moveBtn.addEventListener("click", () => {
		const targetId = select.value;
		const target = columns.find(c => c.id === targetId);
		const colIndex = columns.findIndex(c => c.id === col.id);
		const affected = [];
		projects.forEach(p => p.todos.forEach(t => {
			if (t.status === col.label) affected.push({ todo: t, project: p });
		}));
		projects.forEach(p => p.todos.forEach(t => {
			if (t.status === col.label) t.status = target.label;
		}));
		columns = columns.filter(c => c.id !== col.id);
		saveColumns();
		saveProjects();
		renderTodos();
		overlay.remove();
		showUndoToast("Column deleted", () => {
			columns.splice(colIndex, 0, col);
			affected.forEach(({ todo }) => { todo.status = col.label; });
			saveColumns();
			saveProjects();
			renderTodos();
		});
	});

	const deleteAllBtn = document.createElement("button");
	deleteAllBtn.classList.add("modal-btn-secondary");
	deleteAllBtn.textContent = `Delete "${col.label}" and cards`;
	deleteAllBtn.addEventListener("click", () => {
		const colIndex = columns.findIndex(c => c.id === col.id);
		const removed = [];
		projects.forEach(p => {
			const before = [...p.todos];
			p.todos = p.todos.filter(t => t.status !== col.label);
			before.forEach((t, i) => {
				if (t.status === col.label) removed.push({ todo: t, project: p, index: i });
			});
		});
		columns = columns.filter(c => c.id !== col.id);
		saveColumns();
		saveProjects();
		renderTodos();
		overlay.remove();
		showUndoToast("Column deleted", () => {
			columns.splice(colIndex, 0, col);
			removed.forEach(({ todo, project, index }) => project.todos.splice(index, 0, todo));
			saveColumns();
			saveProjects();
			renderTodos();
		});
	});

	const btnRow = document.createElement("div");
	btnRow.classList.add("modal-btn-row");
	btnRow.appendChild(moveBtn);
	btnRow.appendChild(deleteAllBtn);

	modal.appendChild(closeBtn);
	modal.appendChild(title);
	modal.appendChild(body);
	modal.appendChild(select);
	modal.appendChild(btnRow);
	overlay.appendChild(modal);
	document.body.appendChild(overlay);
}

function showUndoToast(titleText, onUndo) {
	if (undoTimer) clearTimeout(undoTimer);
	if (undoToastEl) undoToastEl.remove();

	const toast = document.createElement("div");
	toast.classList.add("undo-toast");
	undoToastEl = toast;

	const closeBtn = document.createElement("button");
	closeBtn.classList.add("undo-toast-close");
	closeBtn.title = "Dismiss";

	const title = document.createElement("h2");
	title.classList.add("undo-toast-title");
	title.textContent = titleText;

	const undoBtn = document.createElement("button");
	undoBtn.classList.add("undo-toast-btn");
	undoBtn.textContent = "Undo";

	function dismiss() {
		clearTimeout(undoTimer);
		toast.classList.remove("visible");
		toast.addEventListener("transitionend", () => toast.remove(), { once: true });
		undoToastEl = null;
	}

	closeBtn.addEventListener("click", dismiss);

	undoBtn.addEventListener("click", () => {
		onUndo();
		dismiss();
	});

	toast.appendChild(closeBtn);
	toast.appendChild(title);
	toast.appendChild(undoBtn);
	document.body.appendChild(toast);

	requestAnimationFrame(() => {
		requestAnimationFrame(() => toast.classList.add("visible"));
	});

	undoTimer = setTimeout(dismiss, 10000);
}

let columns = [
	{ id: "col-1", label: "Not Started", isCompleted: false, color: "#6b7280" },
	{ id: "col-2", label: "In Progress", isCompleted: false, color: "#1a73e8" },
	{ id: "col-3", label: "Completed",   isCompleted: true,  color: "#188038" },
];

/* ======================
   STORAGE
====================== */

function saveProjects() {
	localStorage.setItem("projects", JSON.stringify(projects));
}

function saveColumns() {
	localStorage.setItem("columns", JSON.stringify(columns));
}

function loadColumns() {
	const stored = localStorage.getItem("columns");
	if (stored) columns = JSON.parse(stored);
}

function saveInbox() {
	localStorage.setItem("inbox", JSON.stringify(inbox));
}

function loadInbox() {
	const stored = localStorage.getItem("inbox");
	if (!stored) return;
	const parsed = JSON.parse(stored);
	parsed.forEach(todo => {
		if (typeof todo.checklist === "string") {
			todo.checklist = todo.checklist.split(",").map(item => ({ text: item.trim(), completed: false }));
		}
		if (!Array.isArray(todo.checklist)) todo.checklist = [];
		if (!('epicId' in todo)) todo.epicId = null;
	});
	inbox.push(...parsed);
}

function loadProjects() {
	const stored = localStorage.getItem("projects");
	if (!stored) return;

	const parsed = JSON.parse(stored);

	parsed.forEach(project => {
		Object.setPrototypeOf(project, Project.prototype);
		if (!project.epics) project.epics = [];
		if (!project.resources) project.resources = { notes: "" };

		project.todos.forEach(todo => {
			if (typeof todo.checklist === "string") {
				todo.checklist = todo.checklist
					.split(",")
					.map(item => ({ text: item.trim(), completed: false }));
			}
			if (!Array.isArray(todo.checklist)) todo.checklist = [];
			if (!('epicId' in todo)) todo.epicId = null;
		});
	});

	projects.push(...parsed);
	currentProjectId = projects[0]?.id;
}

/* ======================
   INIT
====================== */

loadProjects();
loadColumns();
loadInbox();

if (projects.length === 0) {
	const defaultProject = new Project("Default", "Default project");
	defaultProject.epics = [];
	defaultProject.resources = { notes: "" };
	projects.push(defaultProject);
	currentProjectId = defaultProject.id;
	saveProjects();
}

renderProjects();
renderTodos();

/* ======================
   HELPERS
====================== */

function getCurrentProject() {
	return projects.find(p => p.id === currentProjectId);
}

function getColumnLabels() {
	return columns.map(c => c.label);
}

function formatDate(dateStr) {
	if (!dateStr) return "Set due date";
	const [y, m, d] = dateStr.split("-");
	const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
	return `${months[+m - 1]} ${+d}, ${y}`;
}

/* ======================
   EDITABLE FIELDS
====================== */

function makeEditable(element, todo, field, type = "text", options = null, onSave = null) {

	function activateEdit() {
		let input;

		if (type === "select" && options) {
			input = document.createElement("select");
			options.forEach(opt => {
				const option = document.createElement("option");
				option.value = opt;
				option.textContent = opt;
				if (todo[field] === opt) option.selected = true;
				input.appendChild(option);
			});
		} else {
			input = document.createElement("input");
			input.type = type;
			input.value = todo[field] ?? "";
		}

		element.replaceWith(input);
		input.focus();

		function saveEdit() {
			if (onSave) {
				todo[field] = input.value;
				todo.updatedAt = Date.now();
				onSave();
			} else {
				getCurrentProject().editTodo(todo.id, { [field]: input.value });
				saveProjects();
				renderTodos();
			}
		}

		input.addEventListener("blur", saveEdit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") input.blur();
		});
		if (type === "select") {
			input.addEventListener("change", saveEdit);
		}
	}

	// Double-click always edits; single-click edits when card is already selected
	element.addEventListener("click", (e) => {
		const isDoubleClick = e.detail >= 2;
		if (!isDoubleClick && !selectedTodos.has(todo.id)) return;
		e.stopPropagation();
		activateEdit();
	});
}

/* ======================
   PROJECT MANAGEMENT
====================== */

function addProject(title) {
	const project = new Project(title.trim(), "");
	project.epics = [];
	project.resources = { notes: "" };
	projects.push(project);
	currentProjectId = project.id;
	currentProjectTab = "board";
	saveProjects();
	renderProjects();
	renderTodos();
}

function deleteProject(id) {
	if (projects.length === 1) return;
	const index = projects.findIndex(p => p.id === id);
	const [removed] = projects.splice(index, 1);
	const prevCurrentId = currentProjectId;
	if (currentProjectId === id) {
		currentProjectId = projects[0].id;
		currentProjectTab = "board";
	}
	saveProjects();
	renderProjects();
	renderTodos();
	showUndoToast("Project deleted", () => {
		projects.splice(index, 0, removed);
		currentProjectId = prevCurrentId;
		currentProjectTab = "board";
		saveProjects();
		renderProjects();
		renderTodos();
	});
}

/* ======================
   SHARED HELPERS
====================== */

function makeField(labelText, inputEl) {
	const group = document.createElement("div");
	group.classList.add("modal-form-group");
	const lbl = document.createElement("label");
	lbl.textContent = labelText;
	lbl.classList.add("modal-form-label");
	group.appendChild(lbl);
	group.appendChild(inputEl);
	return group;
}

/* ======================
   CARD BUILDER
====================== */

function buildTodoCard(todo, ctx) {
	// ctx: { save(), delete(), isInbox }

	const todoCard = document.createElement("div");
	todoCard.classList.add("todo-card");
	todoCard.dataset.priority = (todo.priority || "").toLowerCase();
	todoCard.dataset.status = (todo.status || "").toLowerCase().replace(/ /g, "-");

	const todoTitle       = document.createElement("h1"); todoTitle.classList.add("todo-title");
	const todoDescription = document.createElement("p");  todoDescription.classList.add("todo-description");
	const todoDueDate     = document.createElement("span"); todoDueDate.classList.add("todo-due-date");
	const todoPriority    = document.createElement("span"); todoPriority.classList.add("todo-priority");
	const todoNotes       = document.createElement("p");  todoNotes.classList.add("todo-notes");
	const todoChecklist   = document.createElement("ul"); todoChecklist.classList.add("todo-checklist");
	const todoLink        = document.createElement("p");  todoLink.classList.add("todo-link");
	const todoStatus      = document.createElement("span"); todoStatus.classList.add("todo-status");

	todoTitle.textContent       = todo.title || "Untitled";
	todoDescription.textContent = todo.description;
	todoDueDate.textContent     = formatDate(todo.dueDate);
	todoPriority.textContent    = todo.priority || "Priority";
	todoNotes.textContent       = todo.notes;
	todoLink.textContent        = todo.referenceLink;
	todoStatus.textContent      = todo.status || "Status";

	makeEditable(todoTitle,       todo, "title",          "text",   null,                     ctx.save);
	makeEditable(todoDescription, todo, "description",    "text",   null,                     ctx.save);
	makeEditable(todoNotes,       todo, "notes",          "text",   null,                     ctx.save);
	makeEditable(todoPriority,    todo, "priority",       "select", ["Low", "Medium", "High"], ctx.save);
	makeEditable(todoDueDate,     todo, "dueDate",        "date",   null,                     ctx.save);
	makeEditable(todoLink,        todo, "referenceLink",  "text",   null,                     ctx.save);
	makeEditable(todoStatus,      todo, "status",         "select", getColumnLabels(),         ctx.save);

	// CHECKLIST
	if (!Array.isArray(todo.checklist)) todo.checklist = [];

	todo.checklist.forEach((item, index) => {
		const li = document.createElement("li");

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = item.completed;

		const label = document.createElement("span");
		label.textContent = item.text;

		checkbox.addEventListener("change", () => {
			item.completed = checkbox.checked;
			ctx.save();
		});

		label.addEventListener("click", () => {
			const input = document.createElement("input");
			input.value = item.text;
			label.replaceWith(input);
			input.focus();
			function saveChecklistEdit() { item.text = input.value; ctx.save(); }
			input.addEventListener("blur", saveChecklistEdit);
			input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
		});

		const deleteItemBtn = document.createElement("button");
		deleteItemBtn.textContent = "✕";
		deleteItemBtn.classList.add("checklist-delete");
		deleteItemBtn.addEventListener("click", () => {
			todo.checklist.splice(index, 1);
			ctx.save();
		});

		li.appendChild(checkbox);
		li.appendChild(label);
		li.appendChild(deleteItemBtn);
		todoChecklist.appendChild(li);
	});

	const addChecklistInput = document.createElement("input");
	addChecklistInput.placeholder = "+ add checklist item";
	addChecklistInput.addEventListener("keydown", (e) => {
		if (e.key !== "Enter" || !addChecklistInput.value.trim()) return;
		e.preventDefault();
		todo.checklist.push({ text: addChecklistInput.value.trim(), completed: false });
		ctx.save();
	});
	todoChecklist.appendChild(addChecklistInput);

	// DELETE BUTTON
	const btnDelete = document.createElement("button");
	btnDelete.classList.add("delete-btn");
	btnDelete.textContent = "✕";
	btnDelete.title = "Delete todo";
	btnDelete.addEventListener("click", ctx.delete);

	// MOVE TO PROJECT
	const moveBtn = document.createElement("button");
	moveBtn.classList.add("move-project-btn");
	moveBtn.title = "Move to project";

	moveBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		const select = document.createElement("select");
		select.classList.add("move-project-select");
		projects.forEach(p => {
			const opt = document.createElement("option");
			opt.value = p.id;
			opt.textContent = p.title;
			if (!ctx.isInbox && p.id === currentProjectId) opt.selected = true;
			select.appendChild(opt);
		});
		moveBtn.replaceWith(select);
		select.focus();

		function commitMove() {
			const targetProjectId = select.value;
			const targetProject = projects.find(p => p.id === targetProjectId);
			const validStatuses = getColumnLabels();
			if (!validStatuses.includes(todo.status)) {
				todo.status = validStatuses.find(l => l.toLowerCase().includes("progress")) || validStatuses[0];
			}
			todo.epicId = null; // reset epic when moving projects
			if (ctx.isInbox) {
				const idx = inbox.indexOf(todo);
				if (idx !== -1) inbox.splice(idx, 1);
				targetProject.addTodo(todo);
				saveInbox();
				saveProjects();
				renderInbox();
			} else {
				if (targetProjectId !== currentProjectId) {
					getCurrentProject().removeTodo(todo.id);
					targetProject.addTodo(todo);
					saveProjects();
					renderTodos();
				} else {
					select.replaceWith(moveBtn);
				}
			}
		}

		select.addEventListener("change", commitMove);
		select.addEventListener("blur", () => select.replaceWith(moveBtn));
	});

	// SELECTION — single click on card body
	todoCard.addEventListener("click", (e) => {
		if (e.target.closest("button, input, select, a")) return;
		e.stopPropagation();
		if (selectedTodos.has(todo.id)) {
			selectedTodos.delete(todo.id);
			todoCard.classList.remove("selected");
		} else {
			selectedTodos.add(todo.id);
			todoCard.classList.add("selected");
		}
		renderSelectionBar();
	});

	// DRAG
	todoCard.draggable = true;

	todoCard.addEventListener("dragstart", (e) => {
		if (!selectedTodos.has(todo.id)) {
			selectedTodos.clear();
			document.querySelectorAll(".todo-card.selected").forEach(c => c.classList.remove("selected"));
			selectedTodos.add(todo.id);
			todoCard.classList.add("selected");
		}
		dragState = {
			todoIds: [...selectedTodos],
			source: ctx.isInbox ? "inbox" : "project",
			projectId: ctx.isInbox ? null : currentProjectId,
		};
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", "card");
		requestAnimationFrame(() => todoCard.classList.add("dragging"));
	});

	todoCard.addEventListener("dragend", () => {
		todoCard.classList.remove("dragging");
		if (dragState) dragState = null;
	});

	// ASSEMBLE
	const todoHeader = document.createElement("div");
	todoHeader.classList.add("todo-header");
	todoHeader.appendChild(todoTitle);
	todoHeader.appendChild(moveBtn);
	todoHeader.appendChild(btnDelete);

	const todoMeta = document.createElement("div");
	todoMeta.classList.add("todo-meta");
	todoMeta.appendChild(todoDueDate);
	todoMeta.appendChild(todoPriority);
	todoMeta.appendChild(todoStatus);

	todoCard.appendChild(todoHeader);
	todoCard.appendChild(todoDescription);
	todoCard.appendChild(todoMeta);
	todoCard.appendChild(todoNotes);
	todoCard.appendChild(todoChecklist);
	todoCard.appendChild(todoLink);

	return todoCard;
}

/* ======================
   INBOX ADD FORM
====================== */

function showInboxAddForm() {
	const overlay = document.createElement("div");
	overlay.classList.add("modal-overlay");
	overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

	const modal = document.createElement("div");
	modal.classList.add("modal-card");

	const closeBtn = document.createElement("button");
	closeBtn.classList.add("modal-close-btn");
	closeBtn.addEventListener("click", () => overlay.remove());

	const heading = document.createElement("h2");
	heading.classList.add("modal-title");
	heading.textContent = "Add to Inbox";

	const titleInput = document.createElement("input");
	titleInput.type = "text";
	titleInput.placeholder = "Title";
	titleInput.classList.add("modal-form-input");

	const descInput = document.createElement("textarea");
	descInput.placeholder = "Description (optional)";
	descInput.classList.add("modal-form-input");
	descInput.rows = 2;

	const prioritySelect = document.createElement("select");
	prioritySelect.classList.add("modal-form-input");
	["Low", "Medium", "High"].forEach(p => {
		const opt = document.createElement("option");
		opt.value = p; opt.textContent = p;
		prioritySelect.appendChild(opt);
	});

	const dueDateInput = document.createElement("input");
	dueDateInput.type = "date";
	dueDateInput.classList.add("modal-form-input");

	const addBtn = document.createElement("button");
	addBtn.classList.add("modal-btn-primary");
	addBtn.textContent = "Add to Inbox";

	addBtn.addEventListener("click", () => {
		const title = titleInput.value.trim();
		if (!title) { titleInput.focus(); return; }
		const todo = new Todo(
			title,
			descInput.value,
			dueDateInput.value,
			prioritySelect.value,
			"", [], "", getColumnLabels()[0] || ""
		);
		todo.epicId = null;
		inbox.push(todo);
		saveInbox();
		if (currentView === "inbox") renderInbox();
		overlay.remove();
	});

	modal.appendChild(closeBtn);
	modal.appendChild(heading);
	modal.appendChild(makeField("Title", titleInput));
	modal.appendChild(makeField("Description", descInput));
	modal.appendChild(makeField("Priority", prioritySelect));
	modal.appendChild(makeField("Due Date", dueDateInput));
	modal.appendChild(addBtn);
	overlay.appendChild(modal);
	document.body.appendChild(overlay);

	requestAnimationFrame(() => titleInput.focus());
}

/* ======================
   EPIC ADD FORM
====================== */

function showEpicAddForm(epicId) {
	const overlay = document.createElement("div");
	overlay.classList.add("modal-overlay");
	overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

	const modal = document.createElement("div");
	modal.classList.add("modal-card");

	const closeBtn = document.createElement("button");
	closeBtn.classList.add("modal-close-btn");
	closeBtn.addEventListener("click", () => overlay.remove());

	const heading = document.createElement("h2");
	heading.classList.add("modal-title");
	const project = getCurrentProject();
	const epicName = epicId === null ? "No Epic" : project?.epics.find(e => e.id === epicId)?.title || "Epic";
	heading.textContent = `Add card to ${epicName}`;

	const titleInput = document.createElement("input");
	titleInput.type = "text";
	titleInput.placeholder = "Card title";
	titleInput.classList.add("modal-form-input");

	const statusSelect = document.createElement("select");
	statusSelect.classList.add("modal-form-input");
	getColumnLabels().forEach(l => {
		const opt = document.createElement("option");
		opt.value = l; opt.textContent = l;
		statusSelect.appendChild(opt);
	});

	const addBtn = document.createElement("button");
	addBtn.classList.add("modal-btn-primary");
	addBtn.textContent = "Add card";

	addBtn.addEventListener("click", () => {
		const title = titleInput.value.trim();
		if (!title) { titleInput.focus(); return; }
		const proj = getCurrentProject();
		const todo = new Todo(title, "", "", "Low", "", [], "", statusSelect.value);
		todo.epicId = epicId;
		proj.addTodo(todo);
		saveProjects();
		overlay.remove();
		renderTodos();
	});

	modal.appendChild(closeBtn);
	modal.appendChild(heading);
	modal.appendChild(makeField("Title", titleInput));
	modal.appendChild(makeField("Status", statusSelect));
	modal.appendChild(addBtn);
	overlay.appendChild(modal);
	document.body.appendChild(overlay);

	requestAnimationFrame(() => titleInput.focus());
}

/* ======================
   PROJECT TABS
====================== */

function buildProjectTabBar() {
	const bar = document.createElement("div");
	bar.classList.add("project-tab-bar");

	[{ id: "board", label: "Board" }, { id: "resources", label: "Resources" }].forEach(tab => {
		const btn = document.createElement("button");
		btn.classList.add("project-tab");
		btn.textContent = tab.label;
		if (currentProjectTab === tab.id) btn.classList.add("active");
		btn.addEventListener("click", () => {
			currentProjectTab = tab.id;
			renderTodos();
		});
		bar.appendChild(btn);
	});

	return bar;
}

function renderResourcesPanel(project) {
	if (!project.resources) project.resources = { notes: "" };

	const panel = document.createElement("div");
	panel.classList.add("resources-panel");

	const notesLabel = document.createElement("label");
	notesLabel.classList.add("resources-label");
	notesLabel.textContent = "Notes";

	const notesArea = document.createElement("textarea");
	notesArea.classList.add("resources-notes");
	notesArea.placeholder = "Add notes for this project…";
	notesArea.value = project.resources.notes || "";

	notesArea.addEventListener("input", () => {
		project.resources.notes = notesArea.value;
		saveProjects();
	});

	panel.appendChild(notesLabel);
	panel.appendChild(notesArea);
	todoContainer.appendChild(panel);
}

/* ======================
   SORT
====================== */

function buildSortBar(sourceArray, renderFn) {
	const sortBar = document.createElement("div");
	sortBar.classList.add("sort-bar");

	const sortLabel = document.createElement("span");
	sortLabel.classList.add("sort-label");
	sortLabel.textContent = "Sort:";

	const sortOptions = [
		{ value: "default",   label: "Default" },
		{ value: "priority",  label: "Priority" },
		{ value: "createdAt", label: "Date Added" },
		{ value: "updatedAt", label: "Date Updated" },
		{ value: "dueDate",   label: "Due Date" },
	];

	sortBar.appendChild(sortLabel);
	sortOptions.forEach(opt => {
		const btn = document.createElement("button");
		btn.classList.add("sort-btn");
		if (sortBy === opt.value) btn.classList.add("active");
		btn.textContent = opt.label;
		btn.addEventListener("click", () => { sortBy = opt.value; renderFn(); });
		sortBar.appendChild(btn);
	});

	const dirBtn = document.createElement("button");
	dirBtn.classList.add("sort-dir-btn");
	dirBtn.title = sortDir === "asc" ? "Sort ascending" : "Sort descending";
	dirBtn.textContent = sortDir === "asc" ? "↑" : "↓";
	dirBtn.addEventListener("click", () => { sortDir = sortDir === "asc" ? "desc" : "asc"; renderFn(); });
	sortBar.appendChild(dirBtn);

	return sortBar;
}

function sortedArray(arr) {
	const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
	return [...arr].sort((a, b) => {
		let result = 0;
		if (sortBy === "priority") {
			result = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
		} else if (sortBy === "createdAt") {
			result = (a.createdAt ?? 0) - (b.createdAt ?? 0);
		} else if (sortBy === "updatedAt") {
			result = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
		} else if (sortBy === "dueDate") {
			const da = a.dueDate ? new Date(a.dueDate) : new Date("9999-12-31");
			const db = b.dueDate ? new Date(b.dueDate) : new Date("9999-12-31");
			result = da - db;
		}
		return sortDir === "desc" ? -result : result;
	});
}

/* ======================
   SELECTION BAR
====================== */

function renderSelectionBar() {
	if (!selectionBarContainer) return;
	selectionBarContainer.innerHTML = "";
	if (selectedTodos.size === 0) return;

	const bar = document.createElement("div");
	bar.classList.add("selection-bar");

	const count = document.createElement("span");
	count.classList.add("selection-count");
	count.textContent = `${selectedTodos.size} selected`;

	const clearBtn = document.createElement("button");
	clearBtn.classList.add("selection-btn");
	clearBtn.textContent = "✕ Clear";
	clearBtn.addEventListener("click", () => {
		selectedTodos.clear();
		document.querySelectorAll(".todo-card.selected").forEach(c => c.classList.remove("selected"));
		renderSelectionBar();
	});

	const deleteAllBtn = document.createElement("button");
	deleteAllBtn.classList.add("selection-btn", "selection-btn-danger");
	deleteAllBtn.textContent = `Delete ${selectedTodos.size}`;
	deleteAllBtn.addEventListener("click", () => {
		const ids = [...selectedTodos];
		if (currentView === "inbox") {
			const removed = ids.map(id => {
				const i = inbox.findIndex(t => t.id === id);
				return i >= 0 ? { todo: inbox[i], index: i } : null;
			}).filter(Boolean).sort((a, b) => b.index - a.index);
			removed.forEach(({ todo }) => inbox.splice(inbox.indexOf(todo), 1));
			selectedTodos.clear();
			saveInbox();
			renderInbox();
			showUndoToast(`${removed.length} cards deleted`, () => {
				removed.sort((a, b) => a.index - b.index).forEach(({ todo, index }) => inbox.splice(index, 0, todo));
				saveInbox();
				renderInbox();
			});
		} else {
			const proj = getCurrentProject();
			const removed = ids.map(id => {
				const i = proj.todos.findIndex(t => t.id === id);
				return i >= 0 ? { todo: proj.todos[i], index: i } : null;
			}).filter(Boolean).sort((a, b) => b.index - a.index);
			removed.forEach(({ todo }) => proj.removeTodo(todo.id));
			selectedTodos.clear();
			saveProjects();
			renderTodos();
			showUndoToast(`${removed.length} cards deleted`, () => {
				removed.sort((a, b) => a.index - b.index).forEach(({ todo, index }) => proj.todos.splice(index, 0, todo));
				saveProjects();
				renderTodos();
			});
		}
	});

	// Move to project
	const moveSelect = document.createElement("select");
	moveSelect.classList.add("selection-select");
	const moveDefault = document.createElement("option");
	moveDefault.value = "";
	moveDefault.textContent = "Move to…";
	moveSelect.appendChild(moveDefault);
	projects.forEach(p => {
		if (currentView === "project" && p.id === currentProjectId) return;
		const opt = document.createElement("option");
		opt.value = p.id;
		opt.textContent = p.title;
		moveSelect.appendChild(opt);
	});
	moveSelect.addEventListener("change", () => {
		if (!moveSelect.value) return;
		const target = projects.find(p => p.id === moveSelect.value);
		const ids = [...selectedTodos];
		ids.forEach(id => {
			let todo;
			if (currentView === "inbox") {
				todo = inbox.find(t => t.id === id);
				if (todo) inbox.splice(inbox.indexOf(todo), 1);
			} else {
				todo = getCurrentProject()?.todos.find(t => t.id === id);
				if (todo) getCurrentProject().removeTodo(id);
			}
			if (todo) {
				const valid = getColumnLabels();
				if (!valid.includes(todo.status)) {
					todo.status = valid.find(l => l.toLowerCase().includes("progress")) || valid[0];
				}
				todo.epicId = null;
				target.addTodo(todo);
			}
		});
		selectedTodos.clear();
		saveInbox();
		saveProjects();
		renderProjects();
		if (currentView === "inbox") renderInbox(); else renderTodos();
	});

	// Batch priority
	const prioritySelect = document.createElement("select");
	prioritySelect.classList.add("selection-select");
	const priDefault = document.createElement("option");
	priDefault.value = "";
	priDefault.textContent = "Priority…";
	prioritySelect.appendChild(priDefault);
	["Low", "Medium", "High"].forEach(p => {
		const opt = document.createElement("option");
		opt.value = p; opt.textContent = p;
		prioritySelect.appendChild(opt);
	});
	prioritySelect.addEventListener("change", () => {
		if (!prioritySelect.value) return;
		batchUpdate("priority", prioritySelect.value);
	});

	// Batch status
	const statusSelect = document.createElement("select");
	statusSelect.classList.add("selection-select");
	const statDefault = document.createElement("option");
	statDefault.value = "";
	statDefault.textContent = "Status…";
	statusSelect.appendChild(statDefault);
	getColumnLabels().forEach(l => {
		const opt = document.createElement("option");
		opt.value = l; opt.textContent = l;
		statusSelect.appendChild(opt);
	});
	statusSelect.addEventListener("change", () => {
		if (!statusSelect.value) return;
		batchUpdate("status", statusSelect.value);
	});

	bar.appendChild(count);
	bar.appendChild(clearBtn);
	bar.appendChild(deleteAllBtn);
	bar.appendChild(moveSelect);
	bar.appendChild(prioritySelect);
	bar.appendChild(statusSelect);
	selectionBarContainer.appendChild(bar);
}

function batchUpdate(field, value) {
	const ids = [...selectedTodos];
	if (currentView === "inbox") {
		ids.forEach(id => {
			const todo = inbox.find(t => t.id === id);
			if (todo) { todo[field] = value; todo.updatedAt = Date.now(); }
		});
		saveInbox();
		renderInbox();
	} else {
		const proj = getCurrentProject();
		ids.forEach(id => {
			const todo = proj?.todos.find(t => t.id === id);
			if (todo) { todo[field] = value; todo.updatedAt = Date.now(); }
		});
		saveProjects();
		renderTodos();
	}
}

/* ======================
   KANBAN COLUMN BUILDER (shared)
====================== */

function buildKanbanColumn(col, project, epicId, filterByEpic) {
	const accent = col.isCompleted ? "#9e9e9e" : col.color;

	const column = document.createElement("div");
	column.classList.add("kanban-column");
	if (col.isCompleted) column.classList.add("is-completed");
	column.style.setProperty("--col-color", accent);
	column.dataset.colId = col.id;

	const colHeader = document.createElement("div");
	colHeader.classList.add("kanban-header");

	const colLabel = document.createElement("span");
	colLabel.classList.add("kanban-label");
	colLabel.textContent = col.label;

	const colCount = document.createElement("span");
	colCount.classList.add("kanban-count");

	colHeader.appendChild(colLabel);
	colHeader.appendChild(colCount);

	const cardArea = document.createElement("div");
	cardArea.classList.add("kanban-cards");

	cardArea.addEventListener("dragover", (e) => {
		if (!dragState?.todoIds) return;
		e.preventDefault();
		e.stopPropagation();
		cardArea.classList.add("drag-over");
	});
	cardArea.addEventListener("dragleave", () => cardArea.classList.remove("drag-over"));
	cardArea.addEventListener("drop", (e) => {
		e.preventDefault();
		e.stopPropagation();
		cardArea.classList.remove("drag-over");
		if (!dragState?.todoIds) return;
		dragState.todoIds.forEach(todoId => {
			let todo;
			if (dragState.source === "inbox") {
				todo = inbox.find(t => t.id === todoId);
				if (todo) inbox.splice(inbox.indexOf(todo), 1);
			} else {
				const src = projects.find(p => p.id === dragState.projectId);
				todo = src?.todos.find(t => t.id === todoId);
				if (todo) src.removeTodo(todoId);
			}
			if (todo) {
				todo.status = col.label;
				if (filterByEpic) todo.epicId = epicId;
				getCurrentProject().addTodo(todo);
			}
		});
		selectedTodos.clear();
		dragState = null;
		saveInbox();
		saveProjects();
		renderProjects();
		renderTodos();
	});

	const todos = filterByEpic
		? sortedArray(project.todos.filter(t => {
			if (epicId === null) return !t.epicId || !project.epics.some(e => e.id === t.epicId);
			return t.epicId === epicId;
		}).filter(t => t.status === col.label))
		: [];

	todos.forEach(todo => {
		const card = buildTodoCard(todo, {
			save: () => { saveProjects(); renderTodos(); },
			delete: () => {
				const index = project.todos.findIndex(t => t.id === todo.id);
				project.removeTodo(todo.id);
				saveProjects();
				renderTodos();
				showUndoToast("Card deleted", () => {
					project.todos.splice(index, 0, todo);
					saveProjects();
					renderTodos();
				});
			},
			isInbox: false,
		});
		cardArea.appendChild(card);
	});

	colCount.textContent = cardArea.children.length;

	column.appendChild(colHeader);
	column.appendChild(cardArea);
	return { column, cardArea, colCount };
}

/* ======================
   SWIMLANES
====================== */

function renderSwimlaneTodos(project) {
	todoContainer.classList.add("swimlane-mode");

	const renderSwimlane = (epicId, epicTitle, isNoEpic, collapsed) => {
		const swimlane = document.createElement("div");
		swimlane.classList.add("swimlane");
		if (isNoEpic) swimlane.classList.add("swimlane-no-epic");
		if (collapsed) swimlane.classList.add("collapsed");

		// Header
		const header = document.createElement("div");
		header.classList.add("swimlane-header");

		if (!isNoEpic) {
			const collapseBtn = document.createElement("button");
			collapseBtn.classList.add("swimlane-collapse-btn");
			collapseBtn.textContent = collapsed ? "▶" : "▼";
			collapseBtn.addEventListener("click", () => {
				const epic = project.epics.find(e => e.id === epicId);
				if (epic) {
					epic.collapsed = !epic.collapsed;
					saveProjects();
					renderTodos();
				}
			});
			header.appendChild(collapseBtn);
		} else {
			const spacer = document.createElement("span");
			spacer.style.width = "18px";
			spacer.style.flexShrink = "0";
			header.appendChild(spacer);
		}

		const titleEl = document.createElement("span");
		titleEl.classList.add("swimlane-title");
		titleEl.textContent = epicTitle;

		if (!isNoEpic) {
			titleEl.title = "Double-click to rename";
			titleEl.addEventListener("dblclick", () => {
				const input = document.createElement("input");
				input.classList.add("swimlane-title-input");
				input.value = epicTitle;
				titleEl.replaceWith(input);
				input.focus();
				input.select();
				function save() {
					const epic = project.epics.find(e => e.id === epicId);
					if (epic) { epic.title = input.value.trim() || epic.title; saveProjects(); }
					renderTodos();
				}
				input.addEventListener("blur", save);
				input.addEventListener("keydown", e => {
					if (e.key === "Enter") input.blur();
					if (e.key === "Escape") renderTodos();
				});
			});
		}

		// Count todos for this epic
		const epicTodos = isNoEpic
			? project.todos.filter(t => !t.epicId || !project.epics.some(e => e.id === t.epicId))
			: project.todos.filter(t => t.epicId === epicId);

		const countEl = document.createElement("span");
		countEl.classList.add("swimlane-count");
		countEl.textContent = epicTodos.length;

		const addCardBtn = document.createElement("button");
		addCardBtn.classList.add("swimlane-add-btn");
		addCardBtn.textContent = "+ Add card";
		addCardBtn.addEventListener("click", () => showEpicAddForm(isNoEpic ? null : epicId));

		header.appendChild(titleEl);
		header.appendChild(countEl);
		header.appendChild(addCardBtn);

		if (!isNoEpic) {
			const deleteBtn = document.createElement("button");
			deleteBtn.classList.add("swimlane-delete-btn");
			deleteBtn.textContent = "✕";
			deleteBtn.title = "Delete epic (cards move to No Epic)";
			deleteBtn.addEventListener("click", () => {
				project.todos.forEach(t => { if (t.epicId === epicId) t.epicId = null; });
				project.epics = project.epics.filter(e => e.id !== epicId);
				saveProjects();
				renderTodos();
			});
			header.appendChild(deleteBtn);
		}

		swimlane.appendChild(header);

		if (!collapsed) {
			const board = document.createElement("div");
			board.classList.add("swimlane-board");

			columns.forEach(col => {
				const { column } = buildKanbanColumn(col, project, isNoEpic ? null : epicId, true);
				board.appendChild(column);
			});

			swimlane.appendChild(board);
		}

		todoContainer.appendChild(swimlane);
	};

	// "No Epic" swimlane first
	renderSwimlane(null, "No Epic", true, false);

	// Each defined epic
	project.epics.forEach(epic => {
		renderSwimlane(epic.id, epic.title, false, epic.collapsed || false);
	});

	// Add Epic button
	const addEpicBtn = document.createElement("button");
	addEpicBtn.classList.add("add-epic-btn");
	addEpicBtn.textContent = "+ Add Epic";
	addEpicBtn.addEventListener("click", () => {
		const newEpic = { id: self.crypto.randomUUID(), title: "New Epic", collapsed: false };
		project.epics.push(newEpic);
		saveProjects();
		renderTodos();
	});
	todoContainer.appendChild(addEpicBtn);
}

/* ======================
   FLAT KANBAN
====================== */

function renderFlatKanban(project) {
	const COL_PALETTE = ["#6b7280","#1a73e8","#188038","#f59e0b","#9c27b0","#e91e63","#00bcd4","#ff5722"];

	const columnCards = {};

	columns.forEach((col) => {
		const accent = col.isCompleted ? "#9e9e9e" : col.color;

		const column = document.createElement("div");
		column.classList.add("kanban-column");
		if (col.isCompleted) column.classList.add("is-completed");
		column.style.setProperty("--col-color", accent);
		column.dataset.colId = col.id;

		column.addEventListener("dragover", (e) => {
			if (!e.dataTransfer.types.includes("text/col-id")) return;
			e.preventDefault();
			column.classList.add("drag-over");
		});
		column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
		column.addEventListener("drop", (e) => {
			e.preventDefault();
			column.classList.remove("drag-over");
			const draggedId = e.dataTransfer.getData("text/col-id");
			if (!draggedId || draggedId === col.id) return;
			const fromIndex = columns.findIndex(c => c.id === draggedId);
			const toIndex = columns.findIndex(c => c.id === col.id);
			const [moved] = columns.splice(fromIndex, 1);
			columns.splice(toIndex, 0, moved);
			saveColumns();
			renderTodos();
		});

		// ── Column header ──
		const colHeader = document.createElement("div");
		colHeader.classList.add("kanban-header");

		const colLabel = document.createElement("span");
		colLabel.classList.add("kanban-label");
		colLabel.textContent = col.label;
		colLabel.title = "Click to rename";

		colLabel.addEventListener("click", () => {
			const input = document.createElement("input");
			input.classList.add("kanban-label-input");
			input.value = col.label;
			colLabel.replaceWith(input);
			input.focus();
			input.select();

			function commitRename() {
				const newLabel = input.value.trim() || col.label;
				if (newLabel !== col.label) {
					projects.forEach(p => p.todos.forEach(t => {
						if (t.status === col.label) t.status = newLabel;
					}));
					col.label = newLabel;
					saveColumns();
					saveProjects();
				}
				renderTodos();
			}

			input.addEventListener("blur", commitRename);
			input.addEventListener("keydown", e => {
				if (e.key === "Enter") input.blur();
				if (e.key === "Escape") renderTodos();
			});
		});

		const colCount = document.createElement("span");
		colCount.classList.add("kanban-count");

		const colControls = document.createElement("div");
		colControls.classList.add("kanban-controls");

		const completedToggle = document.createElement("button");
		completedToggle.classList.add("kanban-completed-toggle");
		if (col.isCompleted) completedToggle.classList.add("active");
		completedToggle.title = col.isCompleted ? "Unmark as completed column" : "Mark as completed column";

		completedToggle.addEventListener("click", () => {
			col.isCompleted = !col.isCompleted;
			saveColumns();
			renderTodos();
		});

		colControls.appendChild(completedToggle);

		if (columns.length > 1) {
			const deleteColBtn = document.createElement("button");
			deleteColBtn.classList.add("kanban-delete-col");
			deleteColBtn.title = "Delete column";
			deleteColBtn.addEventListener("click", () => showColumnDeleteModal(col));
			colControls.appendChild(deleteColBtn);
		}

		const dragHandle = document.createElement("span");
		dragHandle.classList.add("kanban-drag-handle");
		dragHandle.title = "Drag to reorder";
		dragHandle.draggable = true;
		dragHandle.addEventListener("dragstart", (e) => {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/col-id", col.id);
			column.classList.add("dragging");
		});
		dragHandle.addEventListener("dragend", () => column.classList.remove("dragging"));

		colHeader.appendChild(dragHandle);
		colHeader.appendChild(colLabel);
		colHeader.appendChild(colCount);
		colHeader.appendChild(colControls);

		const cardArea = document.createElement("div");
		cardArea.classList.add("kanban-cards");

		cardArea.addEventListener("dragover", (e) => {
			if (!dragState?.todoIds) return;
			e.preventDefault();
			e.stopPropagation();
			cardArea.classList.add("drag-over");
		});
		cardArea.addEventListener("dragleave", () => cardArea.classList.remove("drag-over"));
		cardArea.addEventListener("drop", (e) => {
			e.preventDefault();
			e.stopPropagation();
			cardArea.classList.remove("drag-over");
			if (!dragState?.todoIds) return;
			dragState.todoIds.forEach(todoId => {
				let todo;
				if (dragState.source === "inbox") {
					todo = inbox.find(t => t.id === todoId);
					if (todo) { inbox.splice(inbox.indexOf(todo), 1); }
				} else {
					const src = projects.find(p => p.id === dragState.projectId);
					todo = src?.todos.find(t => t.id === todoId);
					if (todo) src.removeTodo(todoId);
				}
				if (todo) {
					todo.status = col.label;
					getCurrentProject().addTodo(todo);
				}
			});
			selectedTodos.clear();
			dragState = null;
			saveInbox();
			saveProjects();
			renderProjects();
			renderTodos();
		});

		column.appendChild(colHeader);
		column.appendChild(cardArea);
		todoContainer.appendChild(column);

		columnCards[col.id] = { cardArea, colCount };
	});

	// Add-column button
	const addColBtn = document.createElement("button");
	addColBtn.classList.add("kanban-add-col");
	addColBtn.textContent = "+ Add column";

	addColBtn.addEventListener("click", () => {
		const used = columns.map(c => c.color);
		const nextColor = COL_PALETTE.find(c => !used.includes(c)) || COL_PALETTE[columns.length % COL_PALETTE.length];
		const newCol = { id: self.crypto.randomUUID(), label: "New Column", isCompleted: false, color: nextColor };
		columns.push(newCol);
		saveColumns();
		renderTodos();
	});

	todoContainer.appendChild(addColBtn);

	sortedArray(project.todos).forEach((todo) => {
		const proj = getCurrentProject();
		const card = buildTodoCard(todo, {
			save: () => { saveProjects(); renderTodos(); },
			delete: () => {
				const index = proj.todos.findIndex(t => t.id === todo.id);
				proj.removeTodo(todo.id);
				saveProjects();
				renderTodos();
				showUndoToast("Card deleted", () => {
					proj.todos.splice(index, 0, todo);
					saveProjects();
					renderTodos();
				});
			},
			isInbox: false,
		});

		const matchedCol = columns.find(c => c.label === todo.status);
		const targetCol = matchedCol ? columnCards[matchedCol.id] : Object.values(columnCards)[0];
		targetCol.cardArea.appendChild(card);
	});

	Object.values(columnCards).forEach(({ cardArea, colCount }) => {
		colCount.textContent = cardArea.children.length;
	});
}

/* ======================
   RENDER
====================== */

function renderInbox() {
	currentView = "inbox";
	addTodoBtn.style.display = "none";
	todoContainer.innerHTML = "";
	todoContainer.classList.remove("swimlane-mode");
	projectTitle.textContent = "Inbox";

	projectTabsContainer.innerHTML = "";

	sortBarContainer.innerHTML = "";
	sortBarContainer.appendChild(buildSortBar(inbox, renderInbox));

	const grid = document.createElement("div");
	grid.classList.add("inbox-grid");

	const COL_WIDTH = 300;
	const COL_GAP = 16;
	const available = todoContainer.offsetWidth - 48;
	const NUM_COLS = Math.max(1, Math.floor((available + COL_GAP) / (COL_WIDTH + COL_GAP)));
	const cols = Array.from({ length: NUM_COLS }, () => {
		const col = document.createElement("div");
		col.classList.add("inbox-col");

		col.addEventListener("dragover", (e) => {
			if (!dragState?.todoIds) return;
			e.preventDefault();
			col.classList.add("drag-over");
		});
		col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
		col.addEventListener("drop", (e) => {
			e.preventDefault();
			col.classList.remove("drag-over");
			if (!dragState?.todoIds) return;
			dragState.todoIds.forEach(todoId => {
				if (dragState.source === "inbox") return;
				const src = projects.find(p => p.id === dragState.projectId);
				const todo = src?.todos.find(t => t.id === todoId);
				if (todo) { src.removeTodo(todoId); inbox.push(todo); }
			});
			selectedTodos.clear();
			dragState = null;
			saveInbox();
			saveProjects();
			renderProjects();
			renderInbox();
		});

		grid.appendChild(col);
		return col;
	});

	const inboxSorted = sortBy === "default" ? [...inbox].reverse() : sortedArray(inbox);

	inboxSorted.forEach((todo, i) => {
		const card = buildTodoCard(todo, {
			save: () => { saveInbox(); renderInbox(); },
			delete: () => {
				const index = inbox.indexOf(todo);
				inbox.splice(index, 1);
				saveInbox();
				renderInbox();
				showUndoToast("Card deleted", () => {
					inbox.splice(index, 0, todo);
					saveInbox();
					renderInbox();
				});
			},
			isInbox: true,
		});
		cols[i % NUM_COLS].appendChild(card);
	});

	todoContainer.appendChild(grid);
	renderSelectionBar();
}

function renderTodos() {
	if (currentView === "inbox") { renderInbox(); return; }

	const project = getCurrentProject();
	if (!project) return;

	if (!project.resources) project.resources = { notes: "" };
	if (!project.epics) project.epics = [];

	addTodoBtn.style.display = "";
	todoContainer.innerHTML = "";
	todoContainer.classList.remove("swimlane-mode");
	projectTitle.textContent = project.title;

	projectTabsContainer.innerHTML = "";
	projectTabsContainer.appendChild(buildProjectTabBar());

	if (currentProjectTab === "resources") {
		sortBarContainer.innerHTML = "";
		renderResourcesPanel(project);
		renderSelectionBar();
		return;
	}

	sortBarContainer.innerHTML = "";
	sortBarContainer.appendChild(buildSortBar(project.todos, renderTodos));

	if (project.epics.length > 0) {
		renderSwimlaneTodos(project);
	} else {
		renderFlatKanban(project);
	}

	renderSelectionBar();
}

/* ======================
   PROJECTS SIDEBAR
====================== */

function renderProjects() {
	sidebar.innerHTML = "";

	const sidebarHeader = document.createElement("div");
	sidebarHeader.classList.add("sidebar-header");

	const icon = document.createElement("div");
	icon.classList.add("sidebar-app-icon");
	icon.textContent = "✓";

	const appName = document.createElement("span");
	appName.classList.add("sidebar-app-name");
	appName.textContent = "Todoroki";

	const sidebarCloseBtn = document.createElement("button");
	sidebarCloseBtn.classList.add("sidebar-close-btn");
	sidebarCloseBtn.title = "Close menu";
	sidebarCloseBtn.setAttribute("aria-label", "Close sidebar");
	sidebarCloseBtn.addEventListener("click", () => {
		sidebar.classList.remove("open");
		sidebarBackdrop.classList.remove("visible");
	});

	sidebarHeader.appendChild(icon);
	sidebarHeader.appendChild(appName);
	sidebarHeader.appendChild(sidebarCloseBtn);
	sidebar.appendChild(sidebarHeader);

	// Inbox item
	const inboxItem = document.createElement("div");
	inboxItem.classList.add("inbox-sidebar-item");
	if (currentView === "inbox") inboxItem.classList.add("active");

	const inboxIcon = document.createElement("span");
	inboxIcon.classList.add("inbox-sidebar-icon");
	inboxIcon.textContent = "✉";

	const inboxLabel = document.createElement("span");
	inboxLabel.textContent = "Inbox";

	const inboxCount = document.createElement("span");
	inboxCount.classList.add("inbox-sidebar-count");
	inboxCount.textContent = inbox.length || "";

	inboxItem.appendChild(inboxIcon);
	inboxItem.appendChild(inboxLabel);
	inboxItem.appendChild(inboxCount);

	inboxItem.addEventListener("click", () => {
		currentView = "inbox";
		currentProjectTab = "board";
		selectedTodos.clear();
		sidebar.classList.remove("open");
		sidebarBackdrop.classList.remove("visible");
		renderProjects();
		renderInbox();
	});

	inboxItem.addEventListener("dragover", (e) => {
		if (!dragState?.todoIds || dragState.source === "inbox") return;
		e.preventDefault();
		inboxItem.classList.add("drag-over");
	});
	inboxItem.addEventListener("dragleave", () => inboxItem.classList.remove("drag-over"));
	inboxItem.addEventListener("drop", (e) => {
		e.preventDefault();
		inboxItem.classList.remove("drag-over");
		if (!dragState?.todoIds) return;
		dragState.todoIds.forEach(todoId => {
			if (dragState.source === "inbox") return;
			const src = projects.find(p => p.id === dragState.projectId);
			const todo = src?.todos.find(t => t.id === todoId);
			if (todo) { src.removeTodo(todoId); inbox.push(todo); }
		});
		selectedTodos.clear();
		dragState = null;
		saveInbox();
		saveProjects();
		renderProjects();
		if (currentView === "inbox") renderInbox(); else renderTodos();
	});

	sidebar.appendChild(inboxItem);

	const sectionLabel = document.createElement("div");
	sectionLabel.classList.add("sidebar-section-label");
	sectionLabel.textContent = "Projects";
	sidebar.appendChild(sectionLabel);

	projects.forEach(project => {

		const item = document.createElement("div");
		item.classList.add("project-item");
		item.draggable = true;
		item.dataset.projectId = project.id;

		if (project.id === currentProjectId && currentView === "project") {
			item.classList.add("active");
		}

		item.addEventListener("dragstart", (e) => {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/project-id", project.id);
			item.classList.add("dragging");
		});

		item.addEventListener("dragend", () => item.classList.remove("dragging"));

		// Unified dragover: handles both project reorder and card-drop hover
		item.addEventListener("dragover", (e) => {
			const isProjectDrag = e.dataTransfer.types.includes("text/project-id");
			const isCardDrag = !!dragState?.todoIds;
			if (!isProjectDrag && !isCardDrag) return;
			e.preventDefault();
			if (isProjectDrag) e.dataTransfer.dropEffect = "move";
			item.classList.add("drag-over");
		});

		item.addEventListener("dragleave", () => item.classList.remove("drag-over"));

		// Unified drop: handles both project reorder and card-drop
		item.addEventListener("drop", (e) => {
			e.preventDefault();
			item.classList.remove("drag-over");

			const draggedId = e.dataTransfer.getData("text/project-id");
			if (draggedId && draggedId !== project.id && !dragState?.todoIds) {
				// Project reorder
				const fromIndex = projects.findIndex(p => p.id === draggedId);
				const toIndex = projects.findIndex(p => p.id === project.id);
				if (fromIndex === -1) return;
				const [moved] = projects.splice(fromIndex, 1);
				projects.splice(toIndex, 0, moved);
				saveProjects();
				renderProjects();
				return;
			}

			if (dragState?.todoIds) {
				// Card drop onto project
				dragState.todoIds.forEach(todoId => {
					let todo;
					if (dragState.source === "inbox") {
						todo = inbox.find(t => t.id === todoId);
						if (todo) inbox.splice(inbox.indexOf(todo), 1);
					} else {
						if (dragState.projectId === project.id) return;
						const src = projects.find(p => p.id === dragState.projectId);
						todo = src?.todos.find(t => t.id === todoId);
						if (todo) src.removeTodo(todoId);
					}
					if (todo) {
						const validStatuses = getColumnLabels();
						if (!validStatuses.includes(todo.status)) {
							todo.status = validStatuses.find(l => l.toLowerCase().includes("progress")) || validStatuses[0];
						}
						todo.epicId = null;
						project.addTodo(todo);
					}
				});
				selectedTodos.clear();
				dragState = null;
				saveInbox();
				saveProjects();
				renderProjects();
				renderTodos();
			}
		});

		const name = document.createElement("span");
		name.textContent = project.title;
		name.classList.add("project-name");

		name.addEventListener("click", () => {
			currentProjectId = project.id;
			currentView = "project";
			currentProjectTab = "board";
			selectedTodos.clear();
			renderTodos();
			renderProjects();
			saveProjects();
		});

		const deleteBtn = document.createElement("button");
		deleteBtn.textContent = "✕";
		deleteBtn.classList.add("project-delete-btn");
		deleteBtn.title = "Delete project";

		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			deleteProject(project.id);
		});

		item.appendChild(name);
		if (projects.length > 1) item.appendChild(deleteBtn);

		sidebar.appendChild(item);
	});

	const addRow = document.createElement("div");
	addRow.classList.add("project-add-row");

	const addInput = document.createElement("input");
	addInput.placeholder = "+ new project";
	addInput.classList.add("project-add-input");

	addInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && addInput.value.trim()) {
			addProject(addInput.value);
		}
	});

	addRow.appendChild(addInput);
	sidebar.appendChild(addRow);
}

/* ======================
   EVENTS
====================== */

/* ======================
   DARK MODE
====================== */

function applyTheme(theme) {
	if (theme === "dark") {
		document.documentElement.dataset.theme = "dark";
		themeToggleBtn.title = "Switch to light mode";
	} else {
		delete document.documentElement.dataset.theme;
		themeToggleBtn.title = "Switch to dark mode";
	}
}

applyTheme(localStorage.getItem("theme") || "light");

themeToggleBtn.addEventListener("click", () => {
	const isDark = document.documentElement.dataset.theme === "dark";
	const next = isDark ? "light" : "dark";
	localStorage.setItem("theme", next);
	applyTheme(next);
});

addTodoBtn.addEventListener("click", () => {
	createTodoForm(
		formContainer,
		addTodoBtn,
		getCurrentProject(),
		saveProjects,
		renderTodos,
		getColumnLabels()
	);
});

document.querySelector("#fab-btn").addEventListener("click", () => showInboxAddForm());

document.addEventListener("click", (e) => {
	if (!e.target.closest(".todo-card")) {
		selectedTodos.clear();
		document.querySelectorAll(".todo-card.selected").forEach(c => c.classList.remove("selected"));
		renderSelectionBar();
	}
});

window.addEventListener("resize", () => {
	if (currentView === "inbox") renderInbox();
});
