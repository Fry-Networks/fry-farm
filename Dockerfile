FROM node:18-slim AS build

# Step 2: Set the working directory
WORKDIR /app

# Step 3: Copy package.json and package-lock.json
COPY package*.json ./

# Step 4: Install dependencies
RUN npm install

# Step 5: Copy the rest of the application code
COPY . .

# Step 6: Build the app
RUN npm run build

# Step 7: Expose port
EXPOSE 3000

# Step 8: Start the Next.js app (SSR or SSG)
CMD ["npm", "run", "start"]
