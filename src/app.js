import { Project } from "./projects.js";
import { Todo } from "./todo.js";

console.log("test");

const btnAddTodoForm = document.querySelector("#new-todo-form");
const todoContainer = document.querySelector("#todo-container");

function saveTodos() {
    localStorage.setItem("todos", JSON.stringify(p.todos));
}

function loadTodos() {
    const storedTodos = localStorage.getItem("todos");

    if (!storedTodos) return;

    const parsedTodos = JSON.parse(storedTodos);

    p.todos = parsedTodos;
}

const p = new Project("Default", "Default project");
window.p = p;
loadTodos();
renderTodos();

console.log("Created project:", p);



function renderTodos() {
    todoContainer.innerHTML = "";

    p.todos.forEach((todo) => {

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

        todoTitle.textContent = todo.title;
        todoDescription.textContent = todo.description;
        todoDueDate.textContent = "Due: " + todo.dueDate;
        todoPriority.textContent = "Priority: " + todo.priority;
        todoNotes.textContent = todo.notes;
        todoLink.textContent = todo.referenceLink;
        todoStatus.textContent = todo.status;

        todoChecklistLi.textContent = todo.checklist;
        todoChecklist.appendChild(todoChecklistLi);

        todoCard.appendChild(todoTitle);
        todoCard.appendChild(todoDescription);
        todoCard.appendChild(todoDueDate);
        todoCard.appendChild(todoPriority);
        todoCard.appendChild(todoNotes);
        todoCard.appendChild(todoChecklist);
        todoCard.appendChild(todoLink);
        todoCard.appendChild(todoStatus);

        const btnDelete = document.createElement("button");
        btnDelete.classList.add("delete-btn", "btn");
        btnDelete.textContent = "Delete";
        todoCard.appendChild(btnDelete);

        btnDelete.addEventListener("click", () => {
            p.removeTodo(todo.id);
saveTodos();
renderTodos();
        });

        todoCard.appendChild(btnDelete);

        todoContainer.appendChild(todoCard);
    });
}

btnAddTodoForm.addEventListener("submit", (event) => {
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
saveTodos();
renderTodos();

    btnAddTodoForm.reset();

    console.log(p);

});