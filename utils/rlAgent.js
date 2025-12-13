const path = require("path");
const fs = require("fs");

const qTablePath = path.join(process.cwd(), "data/qTable.json");

// Helper: safely load or init Q-table
function loadQTable() {
  try {
    if (!fs.existsSync(qTablePath)) return {};
    return JSON.parse(fs.readFileSync(qTablePath, "utf8"));
  } catch (err) {
    console.error("⚠️ Failed to load Q-table:", err);
    return {};
  }
}

function saveQTable(qTable) {
  try {
    fs.mkdirSync(path.dirname(qTablePath), { recursive: true });
    fs.writeFileSync(qTablePath, JSON.stringify(qTable, null, 2));
  } catch (err) {
    console.error("⚠️ Failed to save Q-table:", err);
  }
}

module.exports = class RLAgent {
  constructor(alpha = 0.1, gamma = 0.9, epsilon = 0.2) {
    this.alpha = alpha;
    this.gamma = gamma;
    this.epsilon = epsilon;
    this.qTable = loadQTable();
  }

  // Convert player state into a compact string key, include userId to personalize
  // state may include userId OR userId can be passed separately to methods
  getStateKey(state, userId) {
    const accuracy = Math.round((state.accuracy ?? 0) * 10);
    const time = Math.min(Math.round((state.avgTime ?? 0) / 10), 10);
    const topic = state.topic ?? "general";
    const diff = state.recentDifficulty ?? 1;
    const hints = Math.min(state.hintsUsed ?? 0, 10); // cap at 10 for compactness
    const uid = userId || state.userId || "global";
    return `${uid}_${topic}_${accuracy}_${time}_${diff}_${hints}`;
  }

  // Choose an action (topic + difficulty)
  chooseAction(userId, state, possibleActions) {
    const key = this.getStateKey(state, userId);

    // Explore
    if (Math.random() < this.epsilon || !this.qTable[key]) {
      return possibleActions[Math.floor(Math.random() * possibleActions.length)];
    }

    // Exploit
    const actions = this.qTable[key];
    const best = Object.entries(actions).sort((a, b) => b[1] - a[1])[0];
    let chosenAction = best ? best[0] : possibleActions[0];

    // Bias towards progression if last problem was solved
    const difficulties = ['basic', 'easy', 'medium', 'hard'];
    if (state.recentScore > 0 && state.lastDifficulty && difficulties.includes(state.lastDifficulty)) {
      const lastIndex = difficulties.indexOf(state.lastDifficulty);
      if (lastIndex < difficulties.length - 1) {
        const nextDifficulty = difficulties[lastIndex + 1];
        const [chosenTopic] = chosenAction.split('_');
        const progressionAction = `${chosenTopic}_${nextDifficulty}`;
        console.log('Progression action:', progressionAction, 'available?', possibleActions.includes(progressionAction));
        if (possibleActions.includes(progressionAction)) {
          const progressionChance = (state.recentScore / 100);
          console.log('Progression chance:', progressionChance, 'random:', Math.random());
          if (Math.random() < progressionChance) {
            console.log('Overriding to progression');
            chosenAction = progressionAction;
          }
        }
      }
    }

    return chosenAction;
  }

  // Update Q-values
  update(userId, state, action, reward, nextState) {
    const key = this.getStateKey(state, userId);
    const nextKey = this.getStateKey(nextState, userId);

    if (!this.qTable[key]) this.qTable[key] = {};
    if (!this.qTable[key][action]) this.qTable[key][action] = 0;

    const nextMax = Math.max(...Object.values(this.qTable[nextKey] || { 0: 0 }));
    this.qTable[key][action] += this.alpha * (
      reward + this.gamma * nextMax - this.qTable[key][action]
    );

    saveQTable(this.qTable);
  }
}