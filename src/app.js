import { Project } from "./projects.js";
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

window.projects = projects;

let sortBy = "default"; // default | priority | createdAt | updatedAt | dueDate
let sortDir = "asc"; // asc | desc

let undoTimer = null;
let undoToastEl = null;

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

function loadProjects() {
	const stored = localStorage.getItem("projects");
	if (!stored) return;

	const parsed = JSON.parse(stored);

	parsed.forEach(project => {
		Object.setPrototypeOf(project, Project.prototype);

		project.todos.forEach(todo => {

			// fix old checklist format
			if (typeof todo.checklist === "string") {
				todo.checklist = todo.checklist
					.split(",")
					.map(item => ({
						text: item.trim(),
						completed: false
					}));
			}

			if (!Array.isArray(todo.checklist)) {
				todo.checklist = [];
			}
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

if (projects.length === 0) {
	const defaultProject = new Project("Default", "Default project");
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

function makeEditable(element, todo, field, type = "text", options = null) {

	element.addEventListener("click", () => {

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
			getCurrentProject().editTodo(todo.id, { [field]: input.value });
			saveProjects();
			renderTodos();
		}

		input.addEventListener("blur", saveEdit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") input.blur();
		});
		if (type === "select") {
			input.addEventListener("change", saveEdit);
		}
	});
}

/* ======================
   PROJECT MANAGEMENT
====================== */

function addProject(title) {
	const project = new Project(title.trim(), "");
	projects.push(project);
	currentProjectId = project.id;
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
	}
	saveProjects();
	renderProjects();
	renderTodos();
	showUndoToast("Project deleted", () => {
		projects.splice(index, 0, removed);
		currentProjectId = prevCurrentId;
		saveProjects();
		renderProjects();
		renderTodos();
	});
}

/* ======================
   RENDER
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

	const sectionLabel = document.createElement("div");
	sectionLabel.classList.add("sidebar-section-label");
	sectionLabel.textContent = "Projects";
	sidebar.appendChild(sectionLabel);

	projects.forEach(project => {

		const item = document.createElement("div");
		item.classList.add("project-item");
		item.draggable = true;
		item.dataset.projectId = project.id;

		if (project.id === currentProjectId) {
			item.classList.add("active");
		}

		item.addEventListener("dragstart", (e) => {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/project-id", project.id);
			item.classList.add("dragging");
		});

		item.addEventListener("dragend", () => item.classList.remove("dragging"));

		item.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			item.classList.add("drag-over");
		});

		item.addEventListener("dragleave", () => item.classList.remove("drag-over"));

		item.addEventListener("drop", (e) => {
			e.preventDefault();
			item.classList.remove("drag-over");
			const draggedId = e.dataTransfer.getData("text/project-id");
			if (draggedId === project.id) return;
			const fromIndex = projects.findIndex(p => p.id === draggedId);
			const toIndex = projects.findIndex(p => p.id === project.id);
			const [moved] = projects.splice(fromIndex, 1);
			projects.splice(toIndex, 0, moved);
			saveProjects();
			renderProjects();
		});

		const name = document.createElement("span");
		name.textContent = project.title;
		name.classList.add("project-name");

		name.addEventListener("click", () => {
			currentProjectId = project.id;
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

function renderTodos() {

	const project = getCurrentProject();
	if (!project) return;

	todoContainer.innerHTML = "";

	projectTitle.textContent = project.title;

	// Sort bar
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
		btn.addEventListener("click", () => {
			sortBy = opt.value;
			renderTodos();
		});
		sortBar.appendChild(btn);
	});

	const dirBtn = document.createElement("button");
	dirBtn.classList.add("sort-dir-btn");
	dirBtn.title = sortDir === "asc" ? "Sort ascending" : "Sort descending";
	dirBtn.textContent = sortDir === "asc" ? "↑" : "↓";
	dirBtn.addEventListener("click", () => {
		sortDir = sortDir === "asc" ? "desc" : "asc";
		renderTodos();
	});
	sortBar.appendChild(dirBtn);

	sortBarContainer.innerHTML = "";
	sortBarContainer.appendChild(sortBar);

	const COL_PALETTE = ["#6b7280","#1a73e8","#188038","#f59e0b","#9c27b0","#e91e63","#00bcd4","#ff5722"];

	const columnCards = {};

	columns.forEach((col, index) => {
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

		// Editable label — click to rename
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

		// Controls (completed toggle + delete)
		const colControls = document.createElement("div");
		colControls.classList.add("kanban-controls");

		// Completed toggle
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

		// Delete button (only when more than 1 column)
		if (columns.length > 1) {
			const deleteColBtn = document.createElement("button");
			deleteColBtn.classList.add("kanban-delete-col");
			deleteColBtn.title = "Delete column";

			deleteColBtn.addEventListener("click", () => {
				const fallback = columns.find(c => c.id !== col.id);
				projects.forEach(p => p.todos.forEach(t => {
					if (t.status === col.label) t.status = fallback.label;
				}));
				columns = columns.filter(c => c.id !== col.id);
				saveColumns();
				saveProjects();
				renderTodos();
			});

			colControls.appendChild(deleteColBtn);
		}

		// Drag handle on header
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

		column.appendChild(colHeader);
		column.appendChild(cardArea);
		todoContainer.appendChild(column);

		columnCards[col.id] = { cardArea, colCount };
	});

	// Add-column button at the end of the board
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

	const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

	const sortedTodos = [...project.todos].sort((a, b) => {
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

	sortedTodos.forEach((todo) => {

		const todoCard = document.createElement("div");
		todoCard.classList.add("todo-card");

		todoCard.dataset.priority = (todo.priority || "").toLowerCase();
		todoCard.dataset.status = (todo.status || "").toLowerCase().replace(/ /g, "-");

		const todoTitle = document.createElement("h1");
		todoTitle.classList.add("todo-title");

		const todoDescription = document.createElement("p");
		todoDescription.classList.add("todo-description");

		const todoDueDate = document.createElement("span");
		todoDueDate.classList.add("todo-due-date");

		const todoPriority = document.createElement("span");
		todoPriority.classList.add("todo-priority");

		const todoNotes = document.createElement("p");
		todoNotes.classList.add("todo-notes");

		const todoChecklist = document.createElement("ul");
		todoChecklist.classList.add("todo-checklist");

		const todoLink = document.createElement("p");
		todoLink.classList.add("todo-link");

		const todoStatus = document.createElement("span");
		todoStatus.classList.add("todo-status");

		todoTitle.textContent = todo.title || "Untitled";
		todoDescription.textContent = todo.description;
		todoDueDate.textContent = formatDate(todo.dueDate);
		todoPriority.textContent = todo.priority || "Priority";
		todoNotes.textContent = todo.notes;
		todoLink.textContent = todo.referenceLink;
		todoStatus.textContent = todo.status || "Status";

		makeEditable(todoTitle, todo, "title");
		makeEditable(todoDescription, todo, "description");
		makeEditable(todoNotes, todo, "notes");
		makeEditable(todoPriority, todo, "priority", "select", ["Low", "Medium", "High"]);
		makeEditable(todoDueDate, todo, "dueDate", "date");
		makeEditable(todoLink, todo, "referenceLink");
		makeEditable(todoStatus, todo, "status", "select", getColumnLabels());

		// CHECKLIST

		if (!Array.isArray(todo.checklist)) {
	todo.checklist = [];
}

		todo.checklist.forEach((item, index) => {

			const li = document.createElement("li");

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = item.completed;

			const label = document.createElement("span");
			label.textContent = item.text;

			checkbox.addEventListener("change", () => {
				item.completed = checkbox.checked;
				saveProjects();
			});

			label.addEventListener("click", () => {

				const input = document.createElement("input");
				input.value = item.text;

				label.replaceWith(input);
				input.focus();

				function saveChecklistEdit() {
					item.text = input.value;
					saveProjects();
					renderTodos();
				}

				input.addEventListener("blur", saveChecklistEdit);

				input.addEventListener("keydown", (e) => {
					if (e.key === "Enter") input.blur();
				});
			});

			const deleteItemBtn = document.createElement("button");
			deleteItemBtn.textContent = "✕";
			deleteItemBtn.classList.add("checklist-delete");

			deleteItemBtn.addEventListener("click", () => {
				todo.checklist.splice(index, 1);
				saveProjects();
				renderTodos();
			});

			li.appendChild(checkbox);
			li.appendChild(label);
			li.appendChild(deleteItemBtn);

			todoChecklist.appendChild(li);
		});

		// ADD CHECKLIST ITEM

		const addChecklistInput = document.createElement("input");
		addChecklistInput.placeholder = "+ add checklist item";

		addChecklistInput.addEventListener("keydown", (e) => {

			if (e.key === "Enter") {

				e.preventDefault();

				if (!addChecklistInput.value.trim()) return;

				todo.checklist.push({
					text: addChecklistInput.value.trim(),
					completed: false
				});

				saveProjects();
				renderTodos();
			}
		});

		todoChecklist.appendChild(addChecklistInput);

		// DELETE TODO

		const btnDelete = document.createElement("button");
		btnDelete.classList.add("delete-btn");
		btnDelete.textContent = "✕";
		btnDelete.title = "Delete todo";

		btnDelete.addEventListener("click", () => {
			const proj = getCurrentProject();
			const index = proj.todos.findIndex(t => t.id === todo.id);
			proj.removeTodo(todo.id);
			saveProjects();
			renderTodos();
			showUndoToast("Card deleted", () => {
				proj.todos.splice(index, 0, todo);
				saveProjects();
				renderTodos();
			});
		});

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
				if (p.id === currentProjectId) opt.selected = true;
				select.appendChild(opt);
			});

			moveBtn.replaceWith(select);
			select.focus();

			function commitMove() {
				const targetProjectId = select.value;
				if (targetProjectId !== currentProjectId) {
					const targetProject = projects.find(p => p.id === targetProjectId);
					const validStatuses = getColumnLabels();
					if (!validStatuses.includes(todo.status)) {
						todo.status = validStatuses.find(l => l.toLowerCase().includes("progress")) || validStatuses[0];
					}
					getCurrentProject().removeTodo(todo.id);
					targetProject.addTodo(todo);
					saveProjects();
					renderTodos();
				} else {
					select.replaceWith(moveBtn);
				}
			}

			select.addEventListener("change", commitMove);
			select.addEventListener("blur", () => select.replaceWith(moveBtn));
		});

		// HEADER (title + delete)

		const todoHeader = document.createElement("div");
		todoHeader.classList.add("todo-header");
		todoHeader.appendChild(todoTitle);
		todoHeader.appendChild(moveBtn);
		todoHeader.appendChild(btnDelete);

		// META ROW (chips)

		const todoMeta = document.createElement("div");
		todoMeta.classList.add("todo-meta");
		todoMeta.appendChild(todoDueDate);
		todoMeta.appendChild(todoPriority);
		todoMeta.appendChild(todoStatus);

		// APPEND

		todoCard.appendChild(todoHeader);
		todoCard.appendChild(todoDescription);
		todoCard.appendChild(todoMeta);
		todoCard.appendChild(todoNotes);
		todoCard.appendChild(todoChecklist);
		todoCard.appendChild(todoLink);

		const matchedCol = columns.find(c => c.label === todo.status);
		const targetCol = matchedCol ? columnCards[matchedCol.id] : Object.values(columnCards)[0];
		targetCol.cardArea.appendChild(todoCard);
	});

	Object.values(columnCards).forEach(({ cardArea, colCount }) => {
		colCount.textContent = cardArea.children.length;
	});
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