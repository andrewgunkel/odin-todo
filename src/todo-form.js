import { Todo } from "./todo.js";

function createTodoForm(formContainer, addTodoBtn, project, saveTodos, renderTodos) {

	if (formContainer.firstChild) return;

	addTodoBtn.disabled = true;

	const form = document.createElement("form");
	form.id = "new-todo-form";

	function createField(labelText, id, type = "text") {

		const group = document.createElement("div");
		group.classList.add("form-group");

		const label = document.createElement("label");
		label.textContent = labelText;
		label.setAttribute("for", id);

		let input;

		if (type === "textarea") {
			input = document.createElement("textarea");
		} else {
			input = document.createElement("input");
			input.type = type;
		}

		input.id = id;
		input.name = id;

		group.appendChild(label);
		group.appendChild(input);

		return { group, input };
	}

	const title = createField("Title", "todo-title");
	const description = createField("Description", "todo-description");
	const dueDate = createField("Due Date", "todo-dueDate", "date");
	const priority = createField("Priority", "todo-priority");
	const notes = createField("Notes", "todo-notes", "textarea");
	const checklist = createField("Checklist", "todo-checklist");
	const link = createField("Reference Link", "todo-link", "url");
	const status = createField("Status", "todo-status");

	const submit = document.createElement("button");
	submit.type = "submit";
	submit.textContent = "Add Todo";

	const cancel = document.createElement("button");
	cancel.type = "button";
	cancel.textContent = "Cancel";

	cancel.addEventListener("click", () => {
		formContainer.innerHTML = "";
		addTodoBtn.disabled = false;
	});

	form.append(
		title.group,
		description.group,
		dueDate.group,
		priority.group,
		notes.group,
		checklist.group,
		link.group,
		status.group,
		submit,
		cancel
	);

	formContainer.appendChild(form);

	title.input.focus();

	form.addEventListener("submit", (event) => {

		event.preventDefault();

		const checklistArray = checklist.input.value
	? checklist.input.value.split(",").map(item => ({
		text: item.trim(),
		completed: false
	}))
	: [];

const todo = new Todo(
	title.input.value,
	description.input.value,
	dueDate.input.value,
	priority.input.value,
	notes.input.value,
	checklistArray,   // ✅ FIXED
	link.input.value,
	status.input.value
);

		project.addTodo(todo);

		saveTodos();
		renderTodos();

		formContainer.innerHTML = "";
		addTodoBtn.disabled = false;
	});
}

export { createTodoForm };