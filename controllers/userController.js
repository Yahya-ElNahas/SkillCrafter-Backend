const User = require('../models/user');
const tokenService = require('../services/tokenService');
const Turn = require('../models/turn');
const Armies = require('../models/armies');
const Performance = require('../models/performance');
const { version } = require('mongoose');

exports.getUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, gender } = req.body;

    // Determine version based on current user distribution
    const version1Count = await User.countDocuments({ version: 1 });
    const version3Count = await User.countDocuments({ version: 2 });
    const version = version1Count > version3Count ? 2 : 1;

    const user = new User({ username, password, version, gender });
    await user.save();
    
    const turn = new Turn({ userId: user._id, version });
    await turn.save();

    const initialUnits = [
      ['infantry', 'allied', 'path33'],
      ['infantry', 'allied', 'path49'],
      ['infantry', 'allied', 'path48'],
      ['infantry', 'allied', 'path38'],
      ['infantry', 'enemy',  'path36'],
      ['infantry', 'enemy',  'path52'],
      ['infantry', 'enemy',  'path37'],
      ['infantry', 'enemy',  'path14'],
      ['armor',    'enemy',  'path44'],
    ];

    if(version !== 3) {
      for (const [type, faction, position] of initialUnits) {
        const doc = new Armies({ turnId: turn._id });
        await doc.createUnit(turn._id, type, faction, position);
        await doc.save();
      }
    }

    res.status(201).json({ message: 'User created successfully', user });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 11000) {
      if(error.keyPattern.username) {
        return res.status(400).json({ message: 'Username already exists' });
      }
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;
    const user = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.deleteMany();
    const turn = await Turn.deleteMany();
    const armies = await Armies.deleteMany();
    const performance = await Performance.deleteMany();
    res.json({ message: 'User deleted successfully', user });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    let user;
    user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const payload = { id: user._id, username: user.username };
    const token = tokenService.generate(payload);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    };

    res.cookie('token', token, cookieOptions);

    const safeUser = user.toObject();
    delete safeUser.password;

    res.json({ message: 'Login successful', version: user.version, token });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.logoutUser = async (req, res) => {
  try {
    res.clearCookie('token');
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Error logging out user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
