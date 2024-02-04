const { Schema, model } = require("mongoose");

const User = new Schema({
	name: String,
	email: String,
	userType: String,
	password: String,
});

module.exports = model("User", User);
