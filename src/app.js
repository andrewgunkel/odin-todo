import { Project } from "./projects.js";
import { Todo } from "./todo.js";
import { createTodoForm } from "./todo-form.js";
import { supabase, signOut } from "./auth.js";

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

let currentUser = null;

let selectedTodos = new Set(); // set of todo IDs currently selected
let dragState = null; // { todoIds, source: "project"|"inbox", projectId }
let touchDrag = null;

let undoTimer = null;
let undoToastEl = null;
let selectionOverlay = null;

let epicFilterIds = new Set(); // empty = show all
let lastEpicFilterProjectId = null;
let dragHoverTimer = null;

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

function showEpicDeleteModal(epicId, project) {
	const epic = project.epics.find(e => e.id === epicId);
	if (!epic) return;
	const otherEpics = project.epics.filter(e => e.id !== epicId);
	const epicCards = project.todos.filter(t => t.epicId === epicId);

	const overlay = document.createElement("div");
	overlay.classList.add("modal-overlay");

	const modal = document.createElement("div");
	modal.classList.add("modal-card");

	const closeBtn = document.createElement("button");
	closeBtn.classList.add("modal-close-btn");
	closeBtn.addEventListener("click", () => overlay.remove());

	const title = document.createElement("h2");
	title.classList.add("modal-title");
	title.textContent = `You are deleting "${epic.title}"`;

	const body = document.createElement("p");
	body.classList.add("modal-body");
	body.textContent = epicCards.length
		? "What should happen to the cards in this epic?"
		: "This epic has no cards.";

	// Destination select (only shown if there are cards)
	const select = document.createElement("select");
	select.classList.add("modal-select");

	const noEpicOpt = document.createElement("option");
	noEpicOpt.value = "";
	noEpicOpt.textContent = "No Epic";
	select.appendChild(noEpicOpt);

	otherEpics.forEach(e => {
		const opt = document.createElement("option");
		opt.value = e.id;
		opt.textContent = e.title;
		select.appendChild(opt);
	});

	// Move + delete
	const moveBtn = document.createElement("button");
	moveBtn.classList.add("modal-btn-primary");
	moveBtn.textContent = epicCards.length ? "Move cards and delete epic" : "Delete epic";
	moveBtn.addEventListener("click", () => {
		const targetEpicId = select.value || null;
		const epicIndex = project.epics.findIndex(e => e.id === epicId);
		const savedCards = epicCards.map(t => ({ todo: t, prev: t.epicId }));

		epicCards.forEach(t => { t.epicId = targetEpicId; });
		project.epics = project.epics.filter(e => e.id !== epicId);
		saveProjects();
		renderTodos();
		overlay.remove();

		showUndoToast("Epic deleted", () => {
			savedCards.forEach(({ todo, prev }) => { todo.epicId = prev; });
			project.epics.splice(epicIndex, 0, epic);
			saveProjects();
			renderTodos();
		});
	});

	// Delete all cards + epic
	const deleteAllBtn = document.createElement("button");
	deleteAllBtn.classList.add("modal-btn-secondary");
	deleteAllBtn.textContent = `Delete epic and its ${epicCards.length} card${epicCards.length !== 1 ? "s" : ""}`;
	deleteAllBtn.addEventListener("click", () => {
		const epicIndex = project.epics.findIndex(e => e.id === epicId);
		const removedCards = epicCards.map(t => ({ todo: t, index: project.todos.indexOf(t) }));

		project.todos = project.todos.filter(t => t.epicId !== epicId);
		project.epics = project.epics.filter(e => e.id !== epicId);
		saveProjects();
		renderTodos();
		overlay.remove();

		showUndoToast("Epic and cards deleted", () => {
			removedCards.sort((a, b) => a.index - b.index)
				.forEach(({ todo, index }) => project.todos.splice(index, 0, todo));
			project.epics.splice(epicIndex, 0, epic);
			saveProjects();
			renderTodos();
		});
	});

	const btnRow = document.createElement("div");
	btnRow.classList.add("modal-btn-row");
	btnRow.appendChild(moveBtn);
	if (epicCards.length > 0) btnRow.appendChild(deleteAllBtn);

	modal.appendChild(closeBtn);
	modal.appendChild(title);
	modal.appendChild(body);
	if (epicCards.length > 0) modal.appendChild(select);
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
		project.epics.forEach(epic => { if (!epic.extraColumns) epic.extraColumns = []; });
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

// getSession reads from localStorage — no network, no flash
supabase.auth.getSession().then(({ data: { session } }) => {
	currentUser = session?.user ?? null;
	renderProjects();
	renderTodos();
});

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
	showProjectDeleteModal(id);
}

function showProjectDeleteModal(id) {
	const project = projects.find(p => p.id === id);
	if (!project) return;
	const others = projects.filter(p => p.id !== id);

	const overlay = document.createElement("div");
	overlay.classList.add("modal-overlay");

	const modal = document.createElement("div");
	modal.classList.add("modal-card");

	const closeBtn = document.createElement("button");
	closeBtn.classList.add("modal-close-btn");
	closeBtn.addEventListener("click", () => overlay.remove());

	const title = document.createElement("h2");
	title.classList.add("modal-title");
	title.textContent = `You are deleting "${project.title}"`;

	const body = document.createElement("p");
	body.classList.add("modal-body");
	body.textContent = project.todos.length
		? "What should happen to the cards in this project?"
		: "This project has no cards.";

	const select = document.createElement("select");
	select.classList.add("modal-select");
	others.forEach(p => {
		const opt = document.createElement("option");
		opt.value = p.id;
		opt.textContent = p.title;
		select.appendChild(opt);
	});

	// Move cards + delete project
	const moveBtn = document.createElement("button");
	moveBtn.classList.add("modal-btn-primary");
	moveBtn.textContent = project.todos.length ? "Move cards and delete project" : "Delete project";
	moveBtn.addEventListener("click", () => {
		const targetId = select.value;
		const target = projects.find(p => p.id === targetId);
		const index = projects.findIndex(p => p.id === id);
		const prevCurrentId = currentProjectId;
		const movedTodos = [...project.todos];

		if (target) {
			movedTodos.forEach(t => {
				t.epicId = null;
				target.addTodo(t);
			});
		}
		projects.splice(index, 1);
		if (currentProjectId === id) {
			currentProjectId = projects[0].id;
			currentProjectTab = "board";
		}
		saveProjects();
		renderProjects();
		renderTodos();
		overlay.remove();

		showUndoToast("Project deleted", () => {
			if (target) movedTodos.forEach(t => target.removeTodo(t.id));
			project.todos = movedTodos;
			projects.splice(index, 0, project);
			currentProjectId = prevCurrentId;
			currentProjectTab = "board";
			saveProjects();
			renderProjects();
			renderTodos();
		});
	});

	// Delete project and all cards
	const deleteAllBtn = document.createElement("button");
	deleteAllBtn.classList.add("modal-btn-secondary");
	deleteAllBtn.textContent = `Delete project and its ${project.todos.length} card${project.todos.length !== 1 ? "s" : ""}`;
	deleteAllBtn.addEventListener("click", () => {
		const index = projects.findIndex(p => p.id === id);
		const prevCurrentId = currentProjectId;
		projects.splice(index, 1);
		if (currentProjectId === id) {
			currentProjectId = projects[0].id;
			currentProjectTab = "board";
		}
		saveProjects();
		renderProjects();
		renderTodos();
		overlay.remove();

		showUndoToast("Project deleted", () => {
			projects.splice(index, 0, project);
			currentProjectId = prevCurrentId;
			currentProjectTab = "board";
			saveProjects();
			renderProjects();
			renderTodos();
		});
	});

	const btnRow = document.createElement("div");
	btnRow.classList.add("modal-btn-row");
	btnRow.appendChild(moveBtn);
	if (project.todos.length > 0) btnRow.appendChild(deleteAllBtn);

	modal.appendChild(closeBtn);
	modal.appendChild(title);
	modal.appendChild(body);
	if (project.todos.length > 0 && others.length > 0) modal.appendChild(select);
	modal.appendChild(btnRow);
	overlay.appendChild(modal);
	document.body.appendChild(overlay);
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
	if (selectedTodos.has(todo.id)) todoCard.classList.add("selected");

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

	// MOVE TO EPIC
	const epicBtn = document.createElement("button");
	epicBtn.classList.add("move-epic-btn");
	epicBtn.title = "Assign to epic";

	if (!ctx.isInbox) {
		const proj = getCurrentProject();
		if (proj && proj.epics && proj.epics.length > 0) {
			epicBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				const select = document.createElement("select");
				select.classList.add("move-epic-select");

				const noEpicOpt = document.createElement("option");
				noEpicOpt.value = "";
				noEpicOpt.textContent = "No Epic";
				if (!todo.epicId) noEpicOpt.selected = true;
				select.appendChild(noEpicOpt);

				proj.epics.forEach(epic => {
					const opt = document.createElement("option");
					opt.value = epic.id;
					opt.textContent = epic.title;
					if (todo.epicId === epic.id) opt.selected = true;
					select.appendChild(opt);
				});

				epicBtn.replaceWith(select);
				select.focus();

				function commitEpicMove() {
					todo.epicId = select.value || null;
					ctx.save();
				}

				select.addEventListener("change", commitEpicMove);
				select.addEventListener("blur", () => {
					select.replaceWith(epicBtn);
				});
			});
		}
	}

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
		// Dim all selected cards so the user sees all of them moving
		requestAnimationFrame(() => {
			document.querySelectorAll(".todo-card.selected").forEach(c => c.classList.add("dragging"));
		});
	});

	todoCard.addEventListener("dragend", () => {
		document.querySelectorAll(".todo-card.dragging").forEach(c => c.classList.remove("dragging"));
		if (dragState) dragState = null;
		if (dragHoverTimer) { clearTimeout(dragHoverTimer); dragHoverTimer = null; }
	});

	// ASSEMBLE
	const todoHeader = document.createElement("div");
	todoHeader.classList.add("todo-header");
	todoHeader.appendChild(todoTitle);
	if (!ctx.isInbox) {
		const proj = getCurrentProject();
		if (proj && proj.epics && proj.epics.length > 0) todoHeader.appendChild(epicBtn);
	}
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

	addCardTouchDrag(todoCard, todo, ctx);

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
	if (!project.resources) project.resources = { notes: "", html: "" };

	const panel = document.createElement("div");
	panel.classList.add("resources-panel");

	const wrap = document.createElement("div");
	wrap.classList.add("resources-editor-wrap");

	// Header row: label + format toggle
	const header = document.createElement("div");
	header.classList.add("resources-editor-header");

	const lbl = document.createElement("span");
	lbl.classList.add("resources-label");
	lbl.textContent = "Notes";

	const formatToggle = document.createElement("button");
	formatToggle.classList.add("resources-format-toggle");
	formatToggle.title = "Formatting options";
	formatToggle.innerHTML = "<strong>A</strong>";

	header.appendChild(lbl);
	header.appendChild(formatToggle);

	// Toolbar (hidden by default)
	const toolbar = document.createElement("div");
	toolbar.classList.add("resources-toolbar");
	toolbar.style.display = "none";

	const fmtDefs = [
		{ cmd: "bold",                label: "<strong>B</strong>", title: "Bold" },
		{ cmd: "italic",              label: "<em>I</em>",          title: "Italic" },
		{ cmd: "bulletList",          label: "• List",              title: "Bullet list" },
		{ cmd: "heading",             label: "H",                   title: "Heading" },
		{ cmd: "blockquote",          label: "❝",                  title: "Blockquote" },
		{ cmd: "link",                label: "🔗",                 title: "Insert link" },
	];

	const content = document.createElement("div");
	content.classList.add("resources-content");
	content.contentEditable = "true";
	content.dataset.placeholder = "Add notes for this project…";

	// Load content
	if (project.resources.html) {
		content.innerHTML = project.resources.html;
	} else if (project.resources.notes) {
		content.textContent = project.resources.notes;
		project.resources.html = content.innerHTML;
	}

	function save() {
		project.resources.html = content.innerHTML;
		saveProjects();
	}

	fmtDefs.forEach(({ cmd, label, title }) => {
		const btn = document.createElement("button");
		btn.classList.add("res-fmt-btn");
		btn.innerHTML = label;
		btn.title = title;
		btn.addEventListener("mousedown", (e) => e.preventDefault());
		btn.addEventListener("click", () => {
			content.focus();
			if (cmd === "bold") document.execCommand("bold");
			else if (cmd === "italic") document.execCommand("italic");
			else if (cmd === "bulletList") document.execCommand("insertUnorderedList");
			else if (cmd === "heading") document.execCommand("formatBlock", false, "h3");
			else if (cmd === "blockquote") document.execCommand("formatBlock", false, "blockquote");
			else if (cmd === "link") {
				const url = prompt("Enter URL:", "https://");
				if (url) document.execCommand("createLink", false, url);
			}
			save();
		});
		toolbar.appendChild(btn);
	});

	formatToggle.addEventListener("click", () => {
		const open = toolbar.style.display !== "none";
		toolbar.style.display = open ? "none" : "flex";
		formatToggle.classList.toggle("active", !open);
	});

	content.addEventListener("input", save);
	content.addEventListener("click", (e) => { if (e.target.tagName === "A") e.preventDefault(); });

	wrap.appendChild(header);
	wrap.appendChild(toolbar);
	wrap.appendChild(content);
	panel.appendChild(wrap);
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

function sizeSelectToContent(el) {
	const text = el.options[el.selectedIndex]?.text ?? "";
	const probe = document.createElement("span");
	probe.style.cssText = "position:fixed;visibility:hidden;white-space:nowrap;font-size:0.75rem;font-family:inherit;padding:0 28px 0 12px;";
	probe.textContent = text;
	document.body.appendChild(probe);
	el.style.width = Math.ceil(probe.getBoundingClientRect().width) + 4 + "px"; // +4 for borders + subpixel
	probe.remove();
}

function renderSelectionBar() {
	if (selectedTodos.size === 0) {
		// Animate out and remove
		if (selectionOverlay) {
			selectionOverlay.classList.remove("visible");
			selectionOverlay.addEventListener("transitionend", () => {
				if (selectionOverlay) { selectionOverlay.remove(); selectionOverlay = null; }
			}, { once: true });
		}
		return;
	}

	const isNew = !selectionOverlay;

	if (!selectionOverlay) {
		selectionOverlay = document.createElement("div");
		selectionOverlay.classList.add("selection-bar-overlay");
		document.body.appendChild(selectionOverlay);
		// Animate in on next frame
		requestAnimationFrame(() => {
			requestAnimationFrame(() => selectionOverlay && selectionOverlay.classList.add("visible"));
		});
	}

	// Clear and rebuild contents
	selectionOverlay.innerHTML = "";

	const count = document.createElement("span");
	count.classList.add("selection-count");
	count.textContent = `${selectedTodos.size} selected`;
	count.addEventListener("click", (e) => e.stopPropagation());

	const divider = document.createElement("span");
	divider.classList.add("selection-bar-divider");

	const deleteAllBtn = document.createElement("button");
	deleteAllBtn.classList.add("selection-btn", "selection-btn-danger");
	deleteAllBtn.textContent = `Delete ${selectedTodos.size}`;
	deleteAllBtn.addEventListener("click", (e) => {
		e.stopPropagation();
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
	moveDefault.textContent = "Move to";
	moveSelect.appendChild(moveDefault);
	projects.forEach(p => {
		if (currentView === "project" && p.id === currentProjectId) return;
		const opt = document.createElement("option");
		opt.value = p.id;
		opt.textContent = p.title;
		moveSelect.appendChild(opt);
	});
	sizeSelectToContent(moveSelect);
	moveSelect.addEventListener("click", (e) => e.stopPropagation());
	moveSelect.addEventListener("change", (e) => {
		e.stopPropagation();
		sizeSelectToContent(moveSelect);
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
	priDefault.textContent = "Priority";
	prioritySelect.appendChild(priDefault);
	["Low", "Medium", "High"].forEach(p => {
		const opt = document.createElement("option");
		opt.value = p; opt.textContent = p;
		prioritySelect.appendChild(opt);
	});
	sizeSelectToContent(prioritySelect);
	prioritySelect.addEventListener("click", (e) => e.stopPropagation());
	prioritySelect.addEventListener("change", (e) => {
		e.stopPropagation();
		sizeSelectToContent(prioritySelect);
		if (!prioritySelect.value) return;
		batchUpdate("priority", prioritySelect.value);
	});

	// Batch status
	const statusSelect = document.createElement("select");
	statusSelect.classList.add("selection-select");
	const statDefault = document.createElement("option");
	statDefault.value = "";
	statDefault.textContent = "Status";
	statusSelect.appendChild(statDefault);
	getColumnLabels().forEach(l => {
		const opt = document.createElement("option");
		opt.value = l; opt.textContent = l;
		statusSelect.appendChild(opt);
	});
	sizeSelectToContent(statusSelect);
	statusSelect.addEventListener("click", (e) => e.stopPropagation());
	statusSelect.addEventListener("change", (e) => {
		e.stopPropagation();
		sizeSelectToContent(statusSelect);
		if (!statusSelect.value) return;
		batchUpdate("status", statusSelect.value);
	});

	const closeBtn = document.createElement("button");
	closeBtn.classList.add("selection-close-btn");
	closeBtn.title = "Clear selection";
	closeBtn.textContent = "✕";
	closeBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		selectedTodos.clear();
		document.querySelectorAll(".todo-card.selected").forEach(c => c.classList.remove("selected"));
		renderSelectionBar();
	});

	selectionOverlay.appendChild(count);
	selectionOverlay.appendChild(divider);
	selectionOverlay.appendChild(deleteAllBtn);
	selectionOverlay.appendChild(moveSelect);
	selectionOverlay.appendChild(prioritySelect);
	selectionOverlay.appendChild(statusSelect);
	selectionOverlay.appendChild(closeBtn);
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
		// Apply epic filter (no-epic is always shown)
		if (!isNoEpic && epicFilterIds.size > 0 && !epicFilterIds.has(epicId)) return;

		const swimlane = document.createElement("div");
		swimlane.classList.add("swimlane");
		if (isNoEpic) swimlane.classList.add("swimlane-no-epic");
		if (collapsed) swimlane.classList.add("collapsed");

		// Header
		const header = document.createElement("div");
		header.classList.add("swimlane-header");

		// Collapse button (both No Epic and regular epics)
		const collapseBtn = document.createElement("button");
		collapseBtn.classList.add("swimlane-collapse-btn");
		collapseBtn.textContent = collapsed ? "▶" : "▼";
		collapseBtn.addEventListener("click", () => {
			if (isNoEpic) {
				project.noEpicCollapsed = !project.noEpicCollapsed;
			} else {
				const epic = project.epics.find(e => e.id === epicId);
				if (epic) epic.collapsed = !epic.collapsed;
			}
			saveProjects();
			const isNowCollapsed = isNoEpic ? project.noEpicCollapsed : (project.epics.find(e => e.id === epicId)?.collapsed ?? false);
			collapseBtn.textContent = isNowCollapsed ? "▶" : "▼";
			swimlane.classList.toggle("collapsed", isNowCollapsed);
			const board = swimlane.querySelector(".swimlane-board");
			if (board) board.style.display = isNowCollapsed ? "none" : "";
		});
		header.appendChild(collapseBtn);

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
			deleteBtn.title = "Delete epic";
			deleteBtn.addEventListener("click", () => showEpicDeleteModal(epicId, project));
			header.appendChild(deleteBtn);
		}

		swimlane.appendChild(header);

		const board = document.createElement("div");
		board.classList.add("swimlane-board");
		if (collapsed) board.style.display = "none";

		// Project-wide columns + epic-specific extra columns
		const epic = isNoEpic ? null : project.epics.find(e => e.id === epicId);
		const epicCols = epic?.extraColumns || [];
		const allCols = [...columns, ...epicCols];

		allCols.forEach(col => {
			const { column } = buildKanbanColumn(col, project, isNoEpic ? null : epicId, true);
			// Epic-specific columns get a delete button in their header
			if (!isNoEpic && epicCols.includes(col)) {
				const colHeader = column.querySelector(".kanban-header");
				const delColBtn = document.createElement("button");
				delColBtn.classList.add("swimlane-delete-col-btn");
				delColBtn.textContent = "✕";
				delColBtn.title = "Remove this column";
				delColBtn.addEventListener("click", () => {
					epic.extraColumns = epic.extraColumns.filter(c => c.id !== col.id);
					saveProjects();
					renderTodos();
				});
				colHeader.appendChild(delColBtn);
			}
			board.appendChild(column);
		});

		if (!isNoEpic) {
			const addColBtn = document.createElement("button");
			addColBtn.classList.add("swimlane-add-col-btn");
			addColBtn.textContent = "+ Column";
			addColBtn.addEventListener("click", () => {
				const name = prompt("Column name:");
				if (!name?.trim()) return;
				if (!epic.extraColumns) epic.extraColumns = [];
				const COL_PALETTE = ["#9c27b0","#e91e63","#00bcd4","#ff5722","#3f51b5","#009688"];
				const color = COL_PALETTE[epic.extraColumns.length % COL_PALETTE.length];
				epic.extraColumns.push({ id: self.crypto.randomUUID(), label: name.trim(), color, isCompleted: false });
				saveProjects();
				renderTodos();
			});
			board.appendChild(addColBtn);
		}

		swimlane.appendChild(board);
		todoContainer.appendChild(swimlane);
	};

	// "No Epic" swimlane first
	renderSwimlane(null, "No Epic", true, project.noEpicCollapsed || false);

	// Each defined epic
	project.epics.forEach(epic => {
		renderSwimlane(epic.id, epic.title, false, epic.collapsed || false);
	});

	// Add Epic button
	const addEpicBtn = document.createElement("button");
	addEpicBtn.classList.add("add-epic-btn");
	addEpicBtn.textContent = "+ Add Epic";
	addEpicBtn.addEventListener("click", () => {
		const newEpic = { id: self.crypto.randomUUID(), title: "New Epic", collapsed: false, extraColumns: [] };
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
   TOUCH DRAG
====================== */

function addCardTouchDrag(todoCard, todo, ctx) {
	let pressTimer = null;
	let startTouch = null;
	let isDragging = false;

	todoCard.addEventListener("touchstart", (e) => {
		if (e.touches.length > 1) return;
		startTouch = e.touches[0];
		isDragging = false;
		pressTimer = setTimeout(() => {
			pressTimer = null;
			isDragging = true;
			if (!selectedTodos.has(todo.id)) {
				selectedTodos.clear();
				document.querySelectorAll(".todo-card.selected").forEach(c => c.classList.remove("selected"));
				selectedTodos.add(todo.id);
				todoCard.classList.add("selected");
				renderSelectionBar();
			}
			dragState = {
				todoIds: [...selectedTodos],
				source: ctx.isInbox ? "inbox" : "project",
				projectId: ctx.isInbox ? null : currentProjectId,
			};
			const rect = todoCard.getBoundingClientRect();
			const ghost = todoCard.cloneNode(true);
			ghost.classList.add("touch-drag-ghost");
			ghost.style.width = rect.width + "px";
			ghost.style.left = rect.left + "px";
			ghost.style.top = rect.top + "px";
			document.body.appendChild(ghost);
			touchDrag = { ghost, offsetX: startTouch.clientX - rect.left, offsetY: startTouch.clientY - rect.top };
			todoCard.style.opacity = "0.35";
		}, 400);
	}, { passive: true });

	todoCard.addEventListener("touchmove", (e) => {
		if (pressTimer) {
			const t = e.touches[0];
			if (Math.abs(t.clientX - startTouch.clientX) > 8 || Math.abs(t.clientY - startTouch.clientY) > 8) {
				clearTimeout(pressTimer); pressTimer = null;
			}
		}
		if (!isDragging || !touchDrag) return;
		e.preventDefault();
		const t = e.touches[0];
		touchDrag.ghost.style.left = (t.clientX - touchDrag.offsetX) + "px";
		touchDrag.ghost.style.top = (t.clientY - touchDrag.offsetY) + "px";
		// highlight drop targets
		document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
		touchDrag.ghost.style.pointerEvents = "none";
		const el = document.elementFromPoint(t.clientX, t.clientY);
		touchDrag.ghost.style.pointerEvents = "";
		if (el) {
			const ca = el.closest(".kanban-cards"); const pi = el.closest(".project-item[data-project-id]"); const ii = el.closest(".inbox-sidebar-item"); const ic = el.closest(".inbox-col");
			if (ca) ca.classList.add("drag-over");
			else if (pi) pi.classList.add("drag-over");
			else if (ii) ii.classList.add("drag-over");
			else if (ic) ic.classList.add("drag-over");
		}
	}, { passive: false });

	const endDrag = (e) => {
		if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
		if (!isDragging || !touchDrag) { isDragging = false; return; }
		isDragging = false;
		const t = (e.changedTouches || e.touches)[0];
		touchDrag.ghost.style.pointerEvents = "none";
		const el = t ? document.elementFromPoint(t.clientX, t.clientY) : null;
		touchDrag.ghost.remove(); touchDrag = null;
		todoCard.style.opacity = "";
		document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
		if (!el || !dragState?.todoIds) { dragState = null; return; }

		const ca = el.closest(".kanban-cards"); const pi = el.closest(".project-item[data-project-id]"); const ii = el.closest(".inbox-sidebar-item"); const ic = el.closest(".inbox-col");
		if (ca) {
			const col = columns.find(c => c.id === ca.closest(".kanban-column")?.dataset.colId);
			if (col) {
				dragState.todoIds.forEach(id => {
					let t2;
					if (dragState.source === "inbox") { t2 = inbox.find(x => x.id === id); if (t2) inbox.splice(inbox.indexOf(t2), 1); }
					else { const src = projects.find(p => p.id === dragState.projectId); t2 = src?.todos.find(x => x.id === id); if (t2) src.removeTodo(id); }
					if (t2) { t2.status = col.label; getCurrentProject().addTodo(t2); }
				});
				selectedTodos.clear(); dragState = null; saveInbox(); saveProjects(); renderProjects(); renderTodos(); return;
			}
		}
		if (pi) {
			const tp = projects.find(p => p.id === pi.dataset.projectId);
			if (tp) {
				dragState.todoIds.forEach(id => {
					let t2;
					if (dragState.source === "inbox") { t2 = inbox.find(x => x.id === id); if (t2) inbox.splice(inbox.indexOf(t2), 1); }
					else { if (dragState.projectId === tp.id) return; const src = projects.find(p => p.id === dragState.projectId); t2 = src?.todos.find(x => x.id === id); if (t2) src.removeTodo(id); }
					if (t2) { const v = getColumnLabels(); if (!v.includes(t2.status)) t2.status = v.find(l => l.toLowerCase().includes("progress")) || v[0]; t2.epicId = null; tp.addTodo(t2); }
				});
				selectedTodos.clear(); dragState = null; saveInbox(); saveProjects(); renderProjects(); renderTodos(); return;
			}
		}
		if (ii || ic) {
			if (dragState.source !== "inbox") {
				dragState.todoIds.forEach(id => { const src = projects.find(p => p.id === dragState.projectId); const t2 = src?.todos.find(x => x.id === id); if (t2) { src.removeTodo(id); inbox.push(t2); } });
				selectedTodos.clear(); dragState = null; saveInbox(); saveProjects(); renderProjects();
				if (currentView === "inbox") renderInbox(); else renderTodos(); return;
			}
		}
		dragState = null;
	};

	todoCard.addEventListener("touchend", endDrag);
	todoCard.addEventListener("touchcancel", endDrag);
}

/* ======================
   RENDER
====================== */

function renderInbox() {
	currentView = "inbox";
	addTodoBtn.style.display = "none";
	todoContainer.innerHTML = "";
	todoContainer.classList.remove("swimlane-mode");
	todoContainer.classList.remove("overview-view");
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

/* ======================
   OVERVIEW
====================== */

function renderOverview() {
	addTodoBtn.style.display = "none";
	todoContainer.innerHTML = "";
	todoContainer.classList.remove("swimlane-mode");
	todoContainer.classList.add("overview-view");
	projectTitle.textContent = "Overview";
	projectTabsContainer.innerHTML = "";
	sortBarContainer.innerHTML = "";

	const completedLabels = columns.filter(c => c.isCompleted).map(c => c.label);
	const now = Date.now();
	const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

	const allProjectTodos = projects.flatMap(p => p.todos);
	const allTodos = [...allProjectTodos, ...inbox];

	const totalCount = allTodos.length;
	const completedCount = allTodos.filter(t => completedLabels.includes(t.status)).length;
	const highPriorityCount = allTodos.filter(t => (t.priority || "").toLowerCase() === "high").length;
	const overdueCount = allTodos.filter(t => {
		if (!t.dueDate || completedLabels.includes(t.status)) return false;
		return new Date(t.dueDate).getTime() < now;
	}).length;

	// Stats row
	const statsRow = document.createElement("div");
	statsRow.classList.add("overview-stats-row");

	[
		{ label: "Total", value: totalCount },
		{ label: "Completed", value: completedCount },
		{ label: "High Priority", value: highPriorityCount },
		{ label: "Overdue", value: overdueCount },
		{ label: "In Inbox", value: inbox.length },
	].forEach(stat => {
		const card = document.createElement("div");
		card.classList.add("overview-stat-card");
		if (stat.label === "Overdue" && overdueCount > 0) card.classList.add("is-overdue");
		const val = document.createElement("div");
		val.classList.add("overview-stat-value");
		val.textContent = stat.value;
		const lbl = document.createElement("div");
		lbl.classList.add("overview-stat-label");
		lbl.textContent = stat.label;
		card.append(val, lbl);
		statsRow.appendChild(card);
	});

	todoContainer.appendChild(statsRow);

	// Per-project section
	if (projects.length > 0) {
		const projSection = document.createElement("div");
		projSection.classList.add("overview-section");
		const projHeading = document.createElement("h3");
		projHeading.classList.add("overview-section-title");
		projHeading.textContent = "Projects";
		projSection.appendChild(projHeading);

		const projGrid = document.createElement("div");
		projGrid.classList.add("overview-projects-grid");

		projects.forEach(project => {
			const todos = project.todos;
			const total = todos.length;
			const done = todos.filter(t => completedLabels.includes(t.status)).length;
			const pct = total > 0 ? Math.round((done / total) * 100) : 0;

			const projCard = document.createElement("div");
			projCard.classList.add("overview-project-card");
			projCard.addEventListener("click", () => {
				currentProjectId = project.id;
				currentView = "project";
				currentProjectTab = "board";
				selectedTodos.clear();
				renderTodos();
				renderProjects();
			});

			const projName = document.createElement("div");
			projName.classList.add("overview-project-name");
			projName.textContent = project.title;

			const progressRow = document.createElement("div");
			progressRow.classList.add("overview-progress-row");

			const bar = document.createElement("div");
			bar.classList.add("overview-progress-bar");
			const fill = document.createElement("div");
			fill.classList.add("overview-progress-fill");
			fill.style.width = `${pct}%`;
			bar.appendChild(fill);

			const pctLabel = document.createElement("span");
			pctLabel.classList.add("overview-progress-label");
			pctLabel.textContent = `${done}/${total}`;

			progressRow.append(bar, pctLabel);

			const statusRow = document.createElement("div");
			statusRow.classList.add("overview-status-row");

			columns.forEach(col => {
				const count = todos.filter(t => t.status === col.label).length;
				if (count === 0) return;
				const chip = document.createElement("span");
				chip.classList.add("overview-status-chip");
				chip.style.setProperty("--chip-color", col.isCompleted ? "#9e9e9e" : col.color);
				chip.textContent = `${col.label} ${count}`;
				statusRow.appendChild(chip);
			});

			projCard.append(projName, progressRow, statusRow);
			projGrid.appendChild(projCard);
		});

		projSection.appendChild(projGrid);
		todoContainer.appendChild(projSection);
	}

	// Due soon section
	const dueSoon = allTodos.filter(t => {
		if (!t.dueDate || completedLabels.includes(t.status)) return false;
		const due = new Date(t.dueDate).getTime();
		return due >= now && due <= now + sevenDaysMs;
	}).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

	if (dueSoon.length > 0) {
		const dueSection = document.createElement("div");
		dueSection.classList.add("overview-section");
		const dueHeading = document.createElement("h3");
		dueHeading.classList.add("overview-section-title");
		dueHeading.textContent = "Due in the next 7 days";
		dueSection.appendChild(dueHeading);

		const dueList = document.createElement("div");
		dueList.classList.add("overview-due-list");

		dueSoon.forEach(todo => {
			const item = document.createElement("div");
			item.classList.add("overview-due-item");

			const titleEl = document.createElement("span");
			titleEl.classList.add("overview-due-title");
			titleEl.textContent = todo.title || "(Untitled)";

			const ownerProject = projects.find(p => p.todos.some(t => t.id === todo.id));
			const contextEl = document.createElement("span");
			contextEl.classList.add("overview-due-context");
			contextEl.textContent = ownerProject ? ownerProject.title : "Inbox";

			const dateEl = document.createElement("span");
			dateEl.classList.add("overview-due-date");
			dateEl.textContent = todo.dueDate;

			item.append(titleEl, contextEl, dateEl);
			dueList.appendChild(item);
		});

		dueSection.appendChild(dueList);
		todoContainer.appendChild(dueSection);
	}

	renderSelectionBar();
}

function buildEpicFilterBar(project) {
	if (!project.epics.length) return null;

	const bar = document.createElement("div");
	bar.classList.add("epic-filter-bar");

	const allBtn = document.createElement("button");
	allBtn.classList.add("epic-filter-pill", "epic-filter-all");
	allBtn.textContent = "All epics";
	allBtn.classList.toggle("active", epicFilterIds.size === 0);
	allBtn.addEventListener("click", () => {
		epicFilterIds.clear();
		renderTodos();
	});
	bar.appendChild(allBtn);

	project.epics.forEach(epic => {
		const pill = document.createElement("button");
		pill.classList.add("epic-filter-pill");
		pill.textContent = epic.title;
		pill.classList.toggle("active", epicFilterIds.has(epic.id));
		pill.addEventListener("click", () => {
			if (epicFilterIds.has(epic.id)) {
				epicFilterIds.delete(epic.id);
			} else {
				epicFilterIds.add(epic.id);
			}
			renderTodos();
		});
		bar.appendChild(pill);
	});

	return bar;
}

function renderTodos() {
	if (currentView === "overview") { renderOverview(); return; }
	if (currentView === "inbox") { renderInbox(); return; }

	const project = getCurrentProject();
	if (!project) return;

	if (!project.resources) project.resources = { notes: "" };
	if (!project.epics) project.epics = [];

	// Reset epic filter when switching projects
	if (currentProjectId !== lastEpicFilterProjectId) {
		epicFilterIds.clear();
		lastEpicFilterProjectId = currentProjectId;
	}

	addTodoBtn.style.display = "";
	todoContainer.innerHTML = "";
	todoContainer.classList.remove("swimlane-mode");
	todoContainer.classList.remove("overview-view");
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
		const filterBar = buildEpicFilterBar(project);
		if (filterBar) sortBarContainer.appendChild(filterBar);
	}

	if (project.epics.length === 0) {
		const epicBtn = document.createElement("button");
		epicBtn.classList.add("sort-btn", "add-epic-sort-btn");
		epicBtn.textContent = "+ Add Epic";
		epicBtn.style.marginLeft = "auto";
		epicBtn.addEventListener("click", () => {
			const newEpic = { id: self.crypto.randomUUID(), title: "New Epic", collapsed: false, extraColumns: [] };
			project.epics.push(newEpic);
			saveProjects();
			renderTodos();
		});
		sortBarContainer.querySelector(".sort-bar").appendChild(epicBtn);
	}

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

	// Two-region layout: scrollable list on top, pinned bottom strip
	const scrollEl = document.createElement("div");
	scrollEl.classList.add("sidebar-scroll");

	const bottomEl = document.createElement("div");
	bottomEl.classList.add("sidebar-bottom");

	sidebar.appendChild(scrollEl);
	sidebar.appendChild(bottomEl);

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
	scrollEl.appendChild(sidebarHeader);

	// Overview item
	const overviewItem = document.createElement("div");
	overviewItem.classList.add("overview-sidebar-item");
	if (currentView === "overview") overviewItem.classList.add("active");

	const overviewIcon = document.createElement("span");
	overviewIcon.classList.add("overview-sidebar-icon");
	overviewIcon.textContent = "◉";

	const overviewLabel = document.createElement("span");
	overviewLabel.textContent = "Overview";

	overviewItem.appendChild(overviewIcon);
	overviewItem.appendChild(overviewLabel);

	overviewItem.addEventListener("click", () => {
		currentView = "overview";
		currentProjectTab = "board";
		selectedTodos.clear();
		sidebar.classList.remove("open");
		sidebarBackdrop.classList.remove("visible");
		renderProjects();
		renderOverview();
	});

	scrollEl.appendChild(overviewItem);

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

	scrollEl.appendChild(inboxItem);

	const sectionLabel = document.createElement("div");
	sectionLabel.classList.add("sidebar-section-label");
	sectionLabel.textContent = "Projects";
	scrollEl.appendChild(sectionLabel);

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
			// Hover-to-switch: switch project after holding over it for 700ms
			if (isCardDrag && project.id !== currentProjectId && !dragHoverTimer) {
				dragHoverTimer = setTimeout(() => {
					dragHoverTimer = null;
					currentProjectId = project.id;
					currentView = "project";
					renderTodos();
					renderProjects();
				}, 700);
			}
		});

		item.addEventListener("dragleave", () => {
			item.classList.remove("drag-over");
			if (dragHoverTimer) { clearTimeout(dragHoverTimer); dragHoverTimer = null; }
		});

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
		name.title = "Double-click to rename";

		name.addEventListener("click", (e) => {
			if (e.detail >= 2) {
				const input = document.createElement("input");
				input.classList.add("project-name-input");
				input.value = project.title;
				name.replaceWith(input);
				input.focus();
				input.select();
				function saveRename() {
					const newTitle = input.value.trim() || project.title;
					project.title = newTitle;
					saveProjects();
					renderProjects();
					if (currentProjectId === project.id) projectTitle.textContent = newTitle;
				}
				input.addEventListener("blur", saveRename);
				input.addEventListener("keydown", ev => {
					if (ev.key === "Enter") input.blur();
					if (ev.key === "Escape") renderProjects();
				});
				return;
			}
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

		scrollEl.appendChild(item);
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
	bottomEl.appendChild(addRow);

	if (currentUser) {
		bottomEl.appendChild(buildUserRow(currentUser));
	}
}

/* ======================
   USER ROW + SETTINGS POPUP
====================== */

const AVATAR_COLORS = [
	"#FCFF4B", "#1a73e8", "#188038", "#e91e8c",
	"#f59e0b", "#9c27b0", "#ef4444", "#06b6d4",
];

function getUserDisplayName(user) {
	return localStorage.getItem("userDisplayName") ||
		user.user_metadata?.name ||
		user.user_metadata?.full_name ||
		user.email || "User";
}

function getAvatarColor() {
	return localStorage.getItem("userAvatarColor") || "#FCFF4B";
}

function buildUserAvatar(user, sizeClass) {
	const avatar = document.createElement("div");
	avatar.classList.add(sizeClass);
	const color = getAvatarColor();
	const hasCustomColor = localStorage.getItem("userAvatarColor") !== null;

	if (!hasCustomColor && user.user_metadata?.avatar_url) {
		// Show Google photo only when no custom colour chosen
		const img = document.createElement("img");
		img.src = user.user_metadata.avatar_url;
		img.alt = "";
		img.classList.add("sidebar-user-avatar-img");
		avatar.appendChild(img);
	} else {
		avatar.style.background = color;
		avatar.style.color = color === "#FCFF4B" ? "#044389" : "#fff";
		avatar.textContent = (getUserDisplayName(user)[0] || "?").toUpperCase();
	}
	return avatar;
}

function buildUserRow(user) {
	const userRow = document.createElement("div");
	userRow.classList.add("sidebar-user-row");
	userRow.title = "Settings";

	const avatar = buildUserAvatar(user, "sidebar-user-avatar");

	const nameEl = document.createElement("span");
	nameEl.classList.add("sidebar-user-email");
	nameEl.textContent = getUserDisplayName(user);
	nameEl.title = user.email || "";

	const chevron = document.createElement("span");
	chevron.classList.add("sidebar-user-chevron");
	chevron.textContent = "⌃";

	userRow.appendChild(avatar);
	userRow.appendChild(nameEl);
	userRow.appendChild(chevron);

	userRow.addEventListener("click", (e) => {
		e.stopPropagation();
		openUserSettings(userRow, user);
	});

	return userRow;
}

function openUserSettings(anchorEl, user) {
	const existing = document.querySelector(".user-settings-popup");
	if (existing) { existing.remove(); return; }

	const popup = document.createElement("div");
	popup.classList.add("user-settings-popup");

	// ── User info header ──
	const popupHeader = document.createElement("div");
	popupHeader.classList.add("user-settings-header");

	// Use a wrapper so the avatar can be replaced in-place by swatch clicks
	const avatarWrap = document.createElement("div");
	avatarWrap.appendChild(buildUserAvatar(user, "user-settings-avatar"));

	const headerInfo = document.createElement("div");
	headerInfo.classList.add("user-settings-info");
	const headerName = document.createElement("div");
	headerName.classList.add("user-settings-name");
	headerName.textContent = getUserDisplayName(user);
	const headerEmail = document.createElement("div");
	headerEmail.classList.add("user-settings-email");
	headerEmail.textContent = user.email || "";
	headerInfo.appendChild(headerName);
	headerInfo.appendChild(headerEmail);

	popupHeader.appendChild(avatarWrap);
	popupHeader.appendChild(headerInfo);
	popup.appendChild(popupHeader);

	// ── Divider ──
	const div1 = document.createElement("div");
	div1.classList.add("user-settings-divider");
	popup.appendChild(div1);

	// ── Display name ──
	const nameSection = document.createElement("div");
	nameSection.classList.add("user-settings-section");
	const nameLabel = document.createElement("label");
	nameLabel.classList.add("user-settings-label");
	nameLabel.textContent = "Display name";
	const nameInput = document.createElement("input");
	nameInput.classList.add("user-settings-input");
	nameInput.value = getUserDisplayName(user);
	nameInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") nameInput.blur();
	});
	nameInput.addEventListener("blur", () => {
		const val = nameInput.value.trim();
		if (val) {
			localStorage.setItem("userDisplayName", val);
			renderProjects();
		}
	});
	nameSection.appendChild(nameLabel);
	nameSection.appendChild(nameInput);
	popup.appendChild(nameSection);

	// ── Icon colour ──
	const colorSection = document.createElement("div");
	colorSection.classList.add("user-settings-section");
	const colorLabel = document.createElement("label");
	colorLabel.classList.add("user-settings-label");
	colorLabel.textContent = "Icon colour";
	const swatches = document.createElement("div");
	swatches.classList.add("user-settings-swatches");

	AVATAR_COLORS.forEach(hex => {
		const swatch = document.createElement("button");
		swatch.classList.add("user-settings-swatch");
		swatch.style.background = hex;
		if (hex === getAvatarColor()) swatch.classList.add("active");
		swatch.addEventListener("click", (e) => {
			e.stopPropagation();
			localStorage.setItem("userAvatarColor", hex);
			swatches.querySelectorAll(".user-settings-swatch").forEach(s => s.classList.remove("active"));
			swatch.classList.add("active");
			// Update the popup header avatar live
			avatarWrap.innerHTML = "";
			avatarWrap.appendChild(buildUserAvatar(user, "user-settings-avatar"));
			renderProjects();
		});
		swatches.appendChild(swatch);
	});

	colorSection.appendChild(colorLabel);
	colorSection.appendChild(swatches);
	popup.appendChild(colorSection);

	// ── Divider ──
	const div2 = document.createElement("div");
	div2.classList.add("user-settings-divider");
	popup.appendChild(div2);

	// ── Sign out ──
	const signOutBtn = document.createElement("button");
	signOutBtn.classList.add("user-settings-signout");
	signOutBtn.textContent = "Sign out";
	signOutBtn.addEventListener("click", () => signOut());
	popup.appendChild(signOutBtn);

	document.body.appendChild(popup);

	// Position above anchor
	const rect = anchorEl.getBoundingClientRect();
	popup.style.left = `${rect.left}px`;
	popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
	// Clamp to viewport width
	const popupWidth = 220;
	const maxLeft = window.innerWidth - popupWidth - 8;
	popup.style.left = `${Math.min(rect.left, maxLeft)}px`;

	// Close on outside click
	function onOutside(e) {
		if (!popup.contains(e.target) && !anchorEl.contains(e.target)) {
			popup.remove();
			document.removeEventListener("click", onOutside, true);
		}
	}
	setTimeout(() => document.addEventListener("click", onOutside, true), 0);
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
	if (!e.target.closest(".todo-card") && !e.target.closest(".selection-bar-overlay")) {
		selectedTodos.clear();
		document.querySelectorAll(".todo-card.selected").forEach(c => c.classList.remove("selected"));
		renderSelectionBar();
	}
});

projectTitle.addEventListener("dblclick", () => {
	if (currentView !== "project") return;
	const project = getCurrentProject();
	if (!project) return;

	const input = document.createElement("input");
	input.value = project.title;
	input.classList.add("project-title-edit");
	projectTitle.textContent = "";
	projectTitle.appendChild(input);
	input.focus();
	input.select();

	function saveTitle() {
		const newTitle = input.value.trim() || project.title;
		project.title = newTitle;
		saveProjects();
		renderProjects();
		renderTodos();
	}

	input.addEventListener("blur", saveTitle);
	input.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter") input.blur();
		if (ev.key === "Escape") renderTodos();
	});
});

window.addEventListener("resize", () => {
	if (currentView === "inbox") renderInbox();
});
