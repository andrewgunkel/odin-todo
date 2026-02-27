function Todo(title, description, dueDate, priority, project, notes, checklist, link, status) {
	this.title = title;
	this.description = description;
	this.dueDate = dueDate;
	this.priority = priority;
	this.project = project;
	this.notes = notes;
	this.checklist = checklist;
	this.link = link;
	this.status = status;
	this.completed = false;
	this.id = self.crypto.randomUUID();
}

export { Todo };