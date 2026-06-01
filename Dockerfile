FROM node:20-alpine
RUN apk add --no-cache python3 make g++ git py3-setuptools py3-pip libusb
RUN pip3 install pyusb --break-system-packages
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p /app/data /tmp/uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
CMD ["node", "server.js"]
