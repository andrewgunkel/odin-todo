import { Project } from "./projects.js";
import { Todo } from "./todo.js";

console.log("test");

const btnAddTodoForm = document.querySelector("#new-todo-form");
const todoContainer = document.querySelector("#todo-container")

const p = new Project("Default", "Default project");
window.p = p;
console.log("Created project:", p);

function renderTodos() {
    todoContainer.innerHTML = "";

    for (let i = 0; i < p.todos.length; i++) {
        //console.log(i);

        const todoCard = document.createElement("div");
        todoCard.classList.add("todo-card");

        const todoTitle = document.createElement("h1");
        const todoDescription = document.createElement("p");
        const todoDueDate = document.createElement("h2");
        const todoPriority = document.createElement("h3");
        const todoNotes = document.createElement("p");
        const todoChecklist = document.createElement("ul");
        const todoChecklistLi = document.createElement("li");
        const todoLink = document.createElement("p");
        const todoStatus = document.createElement("h2");


        todoTitle.textContent = p.todos[i].title;
        todoDescription.textContent = p.todos[i].description;
        todoDueDate.textContent = "Due: " + p.todos[i].dueDate;
        todoPriority.textContent = "Priority: " + p.todos[i].priority;
        todoNotes.textContent = p.todos[i].notes;
        todoLink.textContent = p.todos[i].referenceLink;
        todoStatus.textContent = p.todos[i].status;
        

        todoCard.appendChild(todoTitle);
        todoCard.appendChild(todoDescription);
        todoCard.appendChild(todoDueDate);
        todoCard.appendChild(todoPriority);
        todoCard.appendChild(todoNotes);
        todoChecklistLi.textContent = p.todos[i].checklist;
        todoChecklist.appendChild(todoChecklistLi);
        todoCard.appendChild(todoChecklist);
        todoCard.appendChild(todoLink);
        todoCard.appendChild(todoStatus);


        todoContainer.appendChild(todoCard);
    }
}

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
    renderTodos();
    console.log(p.todos);
    console.log(p);

	btnAddTodoForm.reset();
	//modal.classList.add("is-hidden");
});


