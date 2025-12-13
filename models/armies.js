const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const counterSchema = new Schema({
  _id: { type: String },        
  seq: { type: Number, default: 0 }
});
const UnitCounter = mongoose.models.UnitCounter || mongoose.model('UnitCounter', counterSchema);

const armySchema = new mongoose.Schema({
  turnId: { type: String, required: true },
  type: String,
  faction: String,
  position: String,
  health: Number,
  movement: Number,
  name: String,
  unitNumber: Number, 
});

armySchema.index({ turnId: 1, faction: 1, unitNumber: 1 }, { unique: true });

// Helper to convert numbers to ordinals (1 -> 1st, 2 -> 2nd, 3 -> 3rd, 4 -> 4th, ...)
function toOrdinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const capitalize = (s = "") => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

armySchema.methods.createUnit = async function (turnIdArg, type, faction, position) {
  const tId = turnIdArg || this.turnId;
  if (!tId) throw new Error("turnId is required to assign unitNumber");

  this.type = type;
  this.faction = faction;
  this.position = position;
  this.health = 100;
  this.movement = type === 'infantry' ? 1 : 2;
  this.turnId = tId;

  const key = `${tId}_${faction}`;
  const counter = await UnitCounter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).exec();

  this.unitNumber = counter.seq;
  // Name format example: "1st Allied Infantry Division"
  const ordinal = toOrdinal(this.unitNumber);
  this.name = `${ordinal} ${capitalize(this.faction)} ${capitalize(this.type)} Division`;
  return this;
};

module.exports = mongoose.model('Armies', armySchema);