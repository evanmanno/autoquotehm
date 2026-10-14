#!/bin/bash
# One command to ship everything: build, copy into the iPhone app, push to GitHub (Vercel deploys from there).
# Usage:  bash ship.sh
set -e
cd "$(dirname "$0")"
echo "1/3 Building..."
npm run build
echo "2/3 Copying into the iPhone app..."
npx cap sync ios
echo "3/3 Pushing to GitHub..."
git add -A
git commit -m "${1:-Update}" || echo "(nothing new to commit)"
git push origin main
echo
echo "Done. Vercel will update the website in about a minute."
echo "For the iPhone app: press Run (play) in Xcode again."
