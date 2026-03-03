import { Project } from "./projects.js";
import { Todo } from "./todo.js";

console.log("test");

const btnAddTodoForm = document.querySelector("#new-todo-form");

const p = new Project("Default", "Default project");
window.p = p;
console.log("Created project:", p);

btnAddTodoForm.addEventListener("submit", (event) => {
    console.log(btnAddTodoForm);
	event.preventDefault();

	const title = document.querySelector("#todo-title").value;
	const description = document.querySelector("#todo-description").value;
	const dueDate = document.querySelector("#todo-dueDate").value;
    const priority = document.querySelector("#todo-priority").value;
    const notes = document.querySelector("#todo-notes").value;
    const checklist = document.querySelector("#todo-checklist").value;
    const referenceLink = document.querySelector("#todo-link").value;
    const status = document.querySelector("#todo-status").value;


	const todo = new Todo(title, description, dueDate, priority, notes, checklist, referenceLink, status);
    p.addTodo(todo);
    console.log(p.todos);
    console.log(p);

	btnAddTodoForm.reset();
	//modal.classList.add("is-hidden");
});
