const Achievement = require('../models/achievement');
const tokenService = require('../services/tokenService');
const User = require('../models/user');
const achievementsData = require('../utils/achievements.json');

exports.getUserAchievements = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies.token;
    if (!token) return res.status(401).json({ error: "Authentication required" });

    let decodedToken;
    try {
      decodedToken = tokenService.verify(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = decodedToken.id;

    const user = (await User.findById(userId));
    const achievementIds = user.achievements || [];
    const xp = user.xp || 0;

    // Calculate level based on xp, level 2 requires 100 xp, level 3 requires 300 xp, level 4 requires 600 xp, level 5 requires 1000 xp, etc.
    const level = Math.floor((Math.sqrt(1 + (8 * xp) / 100) - 1) / 2) + 1;

    // i want to also send all other achievements
    const allAchievements = await Achievement.find();

    const achievements = [];
    for (const achId of achievementIds) {
        const ach = allAchievements.find(a => a._id.toString() === achId);
        if (ach) {
            achievements.push(ach);
        }
    }

    res.json({
        level,
        xp,
        achievements,
        allAchievements
    });

  } catch (error) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Function to check and award achievements based on problem solving
exports.checkAndAwardProblemAchievement = async (userId, problem, performance) => {
  try {
    const user = await User.findById(userId);
    if (!user) return [];

    const userAchievements = user.achievements || [];
    const newAchievements = [];

    // Check for hard problem achievements
    if (problem.difficulty === 'hard') {
      const achievementId = `hard_${problem.topic.replace(' ', '_')}`;
      const dbAchievement = await Achievement.findOne({ id: achievementId });

      if (dbAchievement && !userAchievements.some(id => id.toString() === dbAchievement._id.toString())) {
        userAchievements.push(dbAchievement._id);
        newAchievements.push(dbAchievement);
      }
    }

    // Check for one-attempt solve
    if (performance.attempts === 1) {
      const dbAchievement = await Achievement.findOne({ id: 'quick_solver' });
      if (dbAchievement && !userAchievements.some(id => id.toString() === dbAchievement._id.toString())) {
        userAchievements.push(dbAchievement._id);
        newAchievements.push(dbAchievement);
      }
    }

    // Check for solving without hints
    if ((performance.hintsUsed || 0) === 0) {
      const dbAchievement = await Achievement.findOne({ id: 'hint_master' });
      if (dbAchievement && !userAchievements.some(id => id.toString() === dbAchievement._id.toString())) {
        userAchievements.push(dbAchievement._id);
        newAchievements.push(dbAchievement);
      }
    }

    // Check for persistent solving (solved after multiple attempts)
    if (performance.attempts > 2) {
      const dbAchievement = await Achievement.findOne({ id: 'persistent_solver' });
      if (dbAchievement && !userAchievements.some(id => id.toString() === dbAchievement._id.toString())) {
        userAchievements.push(dbAchievement._id);
        newAchievements.push(dbAchievement);
      }
    }

    // Save user achievements if any new ones were added
    if (newAchievements.length > 0) {
      user.achievements = userAchievements;
      await user.save();
    }

    return newAchievements;

  } catch (error) {
    console.error('Error checking achievements:', error);
    return [];
  }
};

// Function to check and award turn completion achievements
exports.checkAndAwardTurnAchievement = async (userId, turnCount) => {
  try {
    const user = await User.findById(userId);
    if (!user) return [];

    const userAchievements = user.achievements || [];
    const newAchievements = [];

    // Check for first turn completion
    if (turnCount >= 1) {
      const dbAchievement = await Achievement.findOne({ id: 'first_turn_complete' });
      if (dbAchievement && !userAchievements.some(id => id.toString() === dbAchievement._id.toString())) {
        userAchievements.push(dbAchievement._id);
        newAchievements.push(dbAchievement);
      }
    }

    // Save user achievements if any new ones were added
    if (newAchievements.length > 0) {
      user.achievements = userAchievements;
      await user.save();
    }

    return newAchievements;

  } catch (error) {
    console.error('Error checking turn achievements:', error);
    return [];
  }
};

exports.getAllUsersLevels = async (req, res) => {
  try {
    // return username, level, xp for all users
    const users = await User.find();
    const usersLevel = users.map(user => {
      const xp = user.xp || 0;
      const level = Math.floor((Math.sqrt(1 + (8 * xp) / 100) - 1) / 2) + 1;
      return {
        username: user.username,
        level,
        xp
      };
    });

    res.json({ users: usersLevel });
  } catch (error) {
    console.error('Error fetching users level:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};