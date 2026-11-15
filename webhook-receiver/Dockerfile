FROM node:22-alpine
WORKDIR /app
COPY server.js ./
USER node
EXPOSE 9000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:9000/health || exit 1
CMD ["node", "server.js"]
