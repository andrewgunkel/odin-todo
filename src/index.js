console.log("test");

import { Project } from "./projects.js";
import { Todo } from "./todo.js";

const project = new Project("Work", "Job tasks");

const todo = new Todo(
	"Finish report",
	"Quarterly numbers",
	"Friday",
	"High",
	"Some notes",
	[],
	"",
	"In Progress"
);

project.addTodo(todo);

console.log(project);
console.log(project.todos);