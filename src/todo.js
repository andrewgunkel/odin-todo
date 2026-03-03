function Todo(title, description, dueDate, priority, notes, checklist, link, status) {
	this.title = title;
	this.description = description;
	this.dueDate = dueDate;
	this.priority = priority;
	this.notes = notes;
	this.checklist = checklist;
	this.link = link;
	this.status = status;
	this.id = self.crypto.randomUUID();
}

export { Todo };