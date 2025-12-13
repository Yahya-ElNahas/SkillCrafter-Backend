const jwt = require('jsonwebtoken');

class TokenService {
    constructor() {
        this.tokenSecret = process.env.JWT_ACCESS_SECRET || 'access-secret-key';
        this.tokenExpiry = process.env.JWT_ACCESS_EXPIRY || '7d';
    }

    generate(payload) {
        return jwt.sign(payload, this.tokenSecret, {
            expiresIn: this.tokenExpiry
        });
    }

    verify(token) {
        try {
            return jwt.verify(token, this.tokenSecret);
        } catch (error) {
            throw new Error('Invalid access token');
        }
    }

    decode(token) {
        return jwt.decode(token);
    }
}

module.exports = new TokenService();