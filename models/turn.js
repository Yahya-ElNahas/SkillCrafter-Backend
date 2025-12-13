const mongoose = require('mongoose');

const turnSchema = new mongoose.Schema({
  userId: { type: String, ref: 'User', required: true, unique: true },
  currentTurn: { type: Number, default: 1 },
  isEnding: { type: Boolean, default: false },
  controlledProvinces: { type: Array, default: [
    "path32", "path33", "path49", "RU-CHE", "path48", "path38", 
    "path41"
  ] },
  processedUnitIds: { type: [String], default: [] },
  version: { type: Number, default: 1 }
});

module.exports = mongoose.model('Turn', turnSchema);