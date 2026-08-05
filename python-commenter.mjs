import fs from 'fs';
import path from 'path';

const API_KEY = 'AQ.Ab8RN6IsUWZLycs8JVOKt7j3paerRFWsFul_3cXZ5YwJYfADkw';
const MODEL = 'gemini-3.5-flash';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateCommentedCode(code, fileName) {
  const prompt = `
You are a Senior Python Backend Developer.
Task for the file "${fileName}":
1. STRIP OUT ALL existing comments (French, legacy English, TODOs, commented-out dead code).
2. ADD PROFESSIONAL, PEP-8 COMPLIANT ENGLISH DOCUMENTATION:
   - Add a clear, concise Docstring ("""...""") directly below the definition of every function, class, and major route handler.
   - Add short inline comments (# ...) ONLY to explain complex logic blocks, SQL queries context, or API interactions.
   - Do not over-explain obvious Python syntax.
3. DO NOT alter any functional code, logic, variable names, SQL queries, or formatting.
4. Output ONLY the clean documented code. Do NOT wrap output in markdown code fences like \`\`\`python.

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

// 📁 LISTE DES NOUVEAUX FICHIERS PYTHON
const filesToProcess = [
  'backend-python/main.py',
  'backend-python/config/admin_role.py',
  'backend-python/config/database.py',
  'backend-python/config/storage.py',
  'backend-python/config/translator.py',
  'backend-python/routers/attachments.py',
  'backend-python/routers/audit.py',
  'backend-python/routers/auth.py',
  'backend-python/routers/issues.py',
  'backend-python/routers/regroupement.py',
  'backend-python/routers/schemas.py',
  'backend-python/routers/security.py',
  'backend-python/services/ai_clustering.py',
  'backend-python/services/ai_extractor.py',
  'backend-python/services/state_manager.py'
];

async function run() {
  console.log(`🚀 Re-commenting Python backend files with English PEP-8 docstrings...\n`);
  for (const file of filesToProcess) {
    const fullPath = path.resolve(file);
    if (fs.existsSync(fullPath)) {
      await processFile(fullPath);
      await sleep(2500); 
    } else {
      console.warn(`⚠️ File not found: ${file}`);
    }
  }
  console.log('\n🎉 Done! All targeted Python files have been re-commented.');
}

run().catch(err => {
  console.error(`❌ An unexpected error occurred: ${err.message}`);
});