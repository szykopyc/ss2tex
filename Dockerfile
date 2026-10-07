FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
# onnxruntime-web is already bundled into transformers.js; the darwin/win32 runtimes can't load here.
RUN npm ci --omit=dev \
 && rm -rf node_modules/onnxruntime-web \
    node_modules/onnxruntime-node/bin/napi-v*/darwin \
    node_modules/onnxruntime-node/bin/napi-v*/win32
COPY src/ocr.js ./
# Bake the model into the image so the server never needs the internet.
RUN node -e "require('./ocr').load()"
COPY src/server.js ./
USER node
ENV PORT=8000
EXPOSE 8000
CMD ["node", "server.js"]
