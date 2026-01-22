const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar_icon: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Profile", profileSchema);
