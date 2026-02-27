function Project(title, description) {
    this.title = title;
    this.description = description;
    this.id = self.crypto.randomUUID();
    this.todos = [];

}


//const Project {}


Project.prototype.addTodo = function(todo) {
    this.todos.push(todo);
}

//Project.prototype.removeTodo

//internal projects[]

//addProject

//removeProject

//getProject

export { Project };