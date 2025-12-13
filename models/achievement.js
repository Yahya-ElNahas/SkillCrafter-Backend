const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  emoji: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  trigger: {
    type: String,
    required: true,
  },
  id: {
    type: String,
    required: true,
    unique: true,
  },
});

module.exports = mongoose.model('Achievement', achievementSchema);
