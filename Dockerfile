FROM node:18

# Install OpenJDK 17 (available in Debian bookworm)
RUN apt-get update && apt-get install -y openjdk-17-jdk

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Expose port (if needed, but Railway handles this)
EXPOSE 5000

# Start the app
CMD ["npm", "start"]