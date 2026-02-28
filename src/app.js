import { Project } from "./projects.js";
import { Todo } from "./todo.js";

console.log("test");

const btnAddTodoForm = document.querySelector("#new-todo-form");

const p = new Project("Default", "Default project");


btnAddTodoForm.addEventListener("submit", (event) => {
    console.log(btnAddTodoForm);
	event.preventDefault();

	const title = document.querySelector("#todo-title").value;
	const description = document.querySelector("#todo-description").value;
    const todo = new Todo(title, description, "", "", "", [], "", "Not Started");
    p.addTodo(todo);
    console.log(p.todos);

	btnAddTodoForm.reset();
	//modal.classList.add("is-hidden");
});

