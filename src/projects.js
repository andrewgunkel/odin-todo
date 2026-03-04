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

Project.prototype.removeTodo = function(id) {
    this.todos = this.todos.filter(todo => todo.id !== id);
};




//Project.prototype.removeTodo

//internal projects[]

//addProject

//removeProject

//getProject

export { Project };