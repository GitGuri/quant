# Use a base image with Node
FROM node:20-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Run the build command as you specified
RUN npm run build

# Expose the port your server runs on (e.g., 3000)
EXPOSE 3000

# Command to start the application in development mode
CMD [ "npm", "run", "dev" ]