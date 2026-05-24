import { GoogleGenerativeAI } from '@google/generative-ai';
import http from 'http';
import dotenv from "dotenv";
dotenv.config();

let genAI = null;
// here we are using the singleton pattern for the model 
export const getGeminiModel = (modelName = 'gemini-2.0-flash') => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI.getGenerativeModel({ model: modelName });
}

export const getPrompt = (level, guide) => {
  return `You are a Git challenge designer for an interactive Git training app. Generate a UNIQUE and CREATIVE git challenge.

DIFFICULTY: ${level}
GUIDE: ${guide}

Generate a challenge with:
1. A catchy title
2. A clear description of the task the user must complete
3. 2-4 helpful hints
4. Shell commands to set up the initial git repository state (these will run in an empty temp directory)
5. Validation criteria for the AI judge to check the solution

CRITICAL RULES FOR SETUP COMMANDS:
- The commands run in a fresh empty directory on Linux with git installed
- Always start with "git init" if you need a git repo
- Use only basic shell commands: git, echo, cat, mkdir, touch, cp, mv, sed
- Each command must be a single line (no multi-line heredocs)
- To write file content, use: echo "content" > file.txt  or  echo "line" >> file.txt
- Do NOT use interactive commands (no vim, no editors, no git rebase -i)
- Do NOT use "cat << EOF" or heredoc syntax
- Make sure all git commands will succeed (add before commit, create branch before checkout, etc.)
- For branch operations, use "git checkout -b branchname" to create and switch in one go if the branch doesn't exist yet.
- Keep setup to 30 commands or fewer
- VERY VERY IMPORTANT: MAKE SURE THAT THE ORDER OF SETUP COMMANDS ARE VALID AND WILL NOT CAUSE ANY ERRORS
- Make the scenario realistic and practical

Respond in this EXACT JSON format (no markdown, no code blocks, just raw JSON):
{
  "title": "Challenge Title",
  "difficulty": "${level}",
  "description": "Clear description of what the user needs to do. Use backticks for git commands and filenames.",
  "hints": ["Hint 1", "Hint 2", "Hint 3"],
  "setupCommands": ["git init", "echo 'hello' > file.txt", "git add .", "git commit -m 'Initial commit'"],
  "validationContext": "Detailed criteria for the judge: what files should exist, what the git log should show, what branches should exist, etc."
}`
}

/**
 * Call the local Ollama model for AI generation/judging.
 */
export const generateChallengeWithLocalModel = (prompt) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'deepseek-coder:6.7b-instruct-q4_K_M',
      prompt: prompt,
      stream: false,
      format: 'json'
    });

    const req = http.request({
      hostname: '10.1.131.41',
      port: 3001,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed.response.trim());
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`Ollama API Error: ${res.statusCode} ${body}`));
        }
      });
    });

    req.setTimeout(200000, () => {
      req.destroy();
      reject(new Error('Ollama request timed out after 20 seconds'));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}