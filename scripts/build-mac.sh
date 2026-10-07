#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

# The model ships inside the app via transformers.js' cache, so make sure it's downloaded.
node -e "require('./src/ocr').load()"

# Server-only files, the browser runtime, and non-macOS binaries aren't needed in the client.
npx electron-packager . ss2tex \
  --platform=darwin --arch=arm64 --out=dist --overwrite --no-asar \
  --app-bundle-id=io.github.szykopyc.ss2tex --icon=assets/icon.icns \
  --ignore='^/(Dockerfile|compose(\.example)?\.yml|README\.md|\.dockerignore|src/server\.js|test|scripts|assets)($|/)' \
  --ignore='^/node_modules/onnxruntime-web($|/)' \
  --ignore='^/node_modules/onnxruntime-node/bin/napi-v[0-9]+/(linux|win32)($|/)' \
  --ignore='^/node_modules/@huggingface/transformers/\.cache/onnx-community($|/)'

APP=dist/ss2tex-darwin-arm64/ss2tex.app
codesign --force --deep --sign - "$APP" # ad-hoc: Apple Silicon refuses to run unsigned code
ditto -c -k --keepParent "$APP" dist/ss2tex-mac-arm64.zip
echo "Built dist/ss2tex-mac-arm64.zip"
