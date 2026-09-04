MIZAN build fix
- Put package.json and Dockerfile in the PROJECT ROOT, replacing the existing files.
- Keep the existing package-lock.json in the project root.
- Do not move these files into src/ or any subfolder.
- Then run: npm install
- Then run: npm run build
- If package-lock.json changes after npm install, include that changed lockfile in your commit too.
