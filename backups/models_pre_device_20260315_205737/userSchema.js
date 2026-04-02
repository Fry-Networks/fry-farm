const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  walletId: {
    type: String,
    required: true,
    unique: true, // Assuming walletId is unique
  },
  profilePicture: {
    type: String, // URL or path to the image
    required: false, // Optional field
  },
  banner: {
    type: String, // URL or path to the banner image
    required: false, // Optional field
  },
  name: {
    type: String,
    required: true,
    trim: true, // Trims any leading/trailing spaces
  },
  bio: {
    type: String,
    required: false, // Optional field
    trim: true, // Trims any leading/trailing spaces
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  collection: 'users' // MongoDB collection name
});

const User = mongoose.model("User", userSchema, "users");
module.exports = User;
