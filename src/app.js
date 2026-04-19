import { Project } from "./projects.js";
import { createTodoForm } from "./todo-form.js"; 

console.log("test");

const todoContainer = document.querySelector("#app");
const formContainer = document.querySelector("#form-container");
const addTodoBtn = document.querySelector("#add-todo-btn");
const sidebar = document.querySelector("#sidebar");

/* ======================
   STATE
====================== */

const projects = [];
let currentProjectId = null;

window.projects = projects;

/* ======================
   STORAGE
====================== */

function saveProjects() {
	localStorage.setItem("projects", JSON.stringify(projects));
}

function loadProjects() {
	const stored = localStorage.getItem("projects");
	if (!stored) return;

	const parsed = JSON.parse(stored);

	parsed.forEach(project => {

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

if (projects.length === 0) {
	const defaultProject = new Project("Default", "Default project");
	projects.push(defaultProject);
	currentProjectId = defaultProject.id;
}

loadProjects();
renderProjects();
renderTodos();

/* ======================
   HELPERS
====================== */

function getCurrentProject() {
	return projects.find(p => p.id === currentProjectId);
}

/* ======================
   EDITABLE FIELDS
====================== */

function makeEditable(element, todo, field, type = "text") {

	element.addEventListener("click", () => {

		const input = document.createElement("input");
		input.type = type;
		input.value = todo[field];

		element.replaceWith(input);
		input.focus();

		function saveEdit() {

			getCurrentProject().editTodo(todo.id, {
				[field]: input.value
			});

			saveProjects();
			renderTodos();
		}

		input.addEventListener("blur", saveEdit);

		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") input.blur();
		});
	});
}

/* ======================
   RENDER
====================== */

function renderProjects() {
	sidebar.innerHTML = "";

	projects.forEach(project => {

		const item = document.createElement("div");
		item.textContent = project.title;
		item.classList.add("project-item");

		if (project.id === currentProjectId) {
			item.classList.add("active");
		}

		item.addEventListener("click", () => {
			currentProjectId = project.id;
			renderTodos();
			renderProjects();
			saveProjects();
		});

		sidebar.appendChild(item);
	});
}

function renderTodos() {

	const project = getCurrentProject();
	if (!project) return;

	todoContainer.innerHTML = "";

	project.todos.forEach((todo) => {

		const todoCard = document.createElement("div");
		todoCard.classList.add("todo-card");

		const todoTitle = document.createElement("h1");
		const todoDescription = document.createElement("p");
		const todoDueDate = document.createElement("h2");
		const todoPriority = document.createElement("h3");
		const todoNotes = document.createElement("p");
		const todoChecklist = document.createElement("ul");
		const todoLink = document.createElement("p");
		const todoStatus = document.createElement("h2");

		todoTitle.textContent = todo.title;
		todoDescription.textContent = todo.description;
		todoDueDate.textContent = todo.dueDate ? "Due: " + todo.dueDate : "Set due date";
		todoPriority.textContent = "Priority: " + todo.priority;
		todoNotes.textContent = "Notes: " + todo.notes;
		todoLink.textContent = "Link: " + todo.referenceLink;
		todoStatus.textContent = todo.status;

		makeEditable(todoTitle, todo, "title");
		makeEditable(todoDescription, todo, "description");
		makeEditable(todoNotes, todo, "notes");
		makeEditable(todoPriority, todo, "priority");
		makeEditable(todoDueDate, todo, "dueDate", "date");
		makeEditable(todoLink, todo, "referenceLink");
		makeEditable(todoStatus, todo, "status");

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

		// APPEND

		todoCard.appendChild(todoTitle);
		todoCard.appendChild(todoDescription);
		todoCard.appendChild(todoDueDate);
		todoCard.appendChild(todoPriority);
		todoCard.appendChild(todoNotes);
		todoCard.appendChild(todoChecklist);
		todoCard.appendChild(todoLink);
		todoCard.appendChild(todoStatus);

		// DELETE TODO

		const btnDelete = document.createElement("button");
		btnDelete.classList.add("delete-btn", "btn");
		btnDelete.textContent = "Delete";

		btnDelete.addEventListener("click", () => {
			getCurrentProject().removeTodo(todo.id);
			saveProjects();
			renderTodos();
		});

		todoCard.appendChild(btnDelete);

		todoContainer.appendChild(todoCard);
	});
}

/* ======================
   EVENTS
====================== */

addTodoBtn.addEventListener("click", () => {
	createTodoForm(
		formContainer,
		addTodoBtn,
		getCurrentProject(),
		saveProjects,
		renderTodos
	);
});