import fs from 'fs';
import path from 'path';

const API_KEY = 'AQ.Ab8RN6IsUWZLycs8JVOKt7j3paerRFWsFul_3cXZ5YwJYfADkw';
const MODEL = 'gemini-3.5-flash';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateCommentedCode(code, fileName) {
  const prompt = `
You are a senior React & TypeScript Developer code reviewer.
Task for the file "${fileName}":
1. STRIP OUT ALL existing comments (French, legacy English, TODOs, commented-out dead code).
2. ADD BALANCED, PROFESSIONAL ENGLISH DOCUMENTATION:
   - For React / TS / JS files:
     * Add clear JSDoc / TSDoc headers above exported functions, custom hooks, components, and interfaces.
     * Add short inline comments explaining key logic blocks (e.g., state updates, API request handlers, useEffect triggers, conditional rendering).
   - For CSS / CSS Modules:
     * Add concise section comments (/* ... */) above major style blocks.
   - For JSON / HTML:
     * Keep clean if comment syntax isn't standard.
3. DO NOT alter any functional code, logic, variable names, JSX tags, or formatting.
4. Output ONLY the clean documented code. Do NOT wrap output in markdown code fences like \`\`\`tsx.

Original Code:
${code}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP Error ${response.status}: ${errText}`);
  }

  const json = await response.json();
  let text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) throw new Error('Empty response from Gemini API');
  
  return text;
}

async function processFile(filePath, retries = 3) {
  console.log(`⏳ Processing: ${filePath}...`);
  const fileName = path.basename(filePath);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const originalCode = fs.readFileSync(filePath, 'utf-8');
      
      if (originalCode.trim().length < 20) {
        console.log(`⏭️ Skipped (too short/empty): ${filePath}`);
        return;
      }

      let cleanedCode = await generateCommentedCode(originalCode, fileName);

      cleanedCode = cleanedCode.trim();
      if (cleanedCode.startsWith('```')) {
        cleanedCode = cleanedCode.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
      }

      fs.writeFileSync(filePath, cleanedCode, 'utf-8');
      console.log(`✅ Completed: ${filePath}`);
      return; 

    } catch (error) {
      console.error(`⚠️ Attempt ${attempt} failed for ${filePath}: ${error.message}`);
      if (attempt === retries) {
        console.error(`❌ Failed to process ${filePath} permanently.`);
      } else {
        console.log(`🔄 Retrying in 4 seconds...`);
        await sleep(4000); 
      }
    }
  }
}

const filesToProcess = [
  'index.html',
  'vite.config.ts',
  '.eslintrc.cjs',
  'src/App.css',
  'src/App.tsx',
  'src/i18n.ts',
  'src/index.css',
  'src/main.tsx',
  'src/vite-env.d.ts',
  'src/utils/security.ts',
  'src/api/client.ts',
  'src/api/issues.ts',
  'src/api/regroupements.ts',
  'src/components/AdminRoute.tsx',
  'src/components/ErrorMessage.module.css',
  'src/components/ErrorMessage.tsx',
  'src/components/FileUploader.module.css',
  'src/components/FileUploader.tsx',
  'src/components/GenericTable.tsx',
  'src/components/IssueCard.module.css',
  'src/components/IssueCard.tsx',
  'src/components/Notifications.tsx',
  'src/components/ProtectedRoute.tsx',
  'src/components/SearchBar.module.css',
  'src/components/SearchBar.tsx',
  'src/components/StatCard.tsx',
  'src/layouts/MainLayout.module.css',
  'src/layouts/MainLayout.tsx',
  'src/pages/AuditLogs.tsx',
  'src/pages/Dashboard.module.css',
  'src/pages/Dashboard.tsx',
  'src/pages/IssueForm.module.css',
  'src/pages/IssueForm.tsx',
  'src/pages/Login.module.css',
  'src/pages/Login.tsx',
  'src/pages/RegroupementDetail.tsx',
  'src/pages/RegroupementForm.tsx',
  'src/pages/RegroupementList.module.css',
  'src/pages/RegroupementList.tsx'
];

async function run() {
  console.log(`🚀 Re-commenting frontend files with richer English documentation...\n`);
  for (const file of filesToProcess) {
    const fullPath = path.resolve(file);
    if (fs.existsSync(fullPath)) {
      await processFile(fullPath);
      await sleep(2500); 
    } else {
      console.warn(`⚠️ File not found: ${file}`);
    }
  }
  console.log('\n🎉 Done! All targeted files have been re-commented.');
}

run().catch(err => {
  console.error(`❌ An unexpected error occurred: ${err.message}`);
});