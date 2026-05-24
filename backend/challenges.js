import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const challenges = [
  // ==================== BEGINNER ====================
  {
    id: 'init-commit',
    title: 'Your First Commit',
    difficulty: 'Beginner',
    description:
      'Initialize a new Git repository, create a file called `hello.txt` with the content "Hello, Git!", and make your first commit with the message "Initial commit".',
    hints: [
      'Use `git init` to initialize a repository',
      'Use `echo` or a text editor to create the file',
      'Use `git add` and `git commit` to save your changes',
    ],
    setup(dir) {
      // Empty dir, user must init
    },
    validationContext:
      'Check that: 1) The directory is a git repo, 2) There is a file hello.txt with content "Hello, Git!", 3) There is exactly one commit with message "Initial commit".',
  },
  {
    id: 'branch-create',
    title: 'Branch Out',
    difficulty: 'Beginner',
    description:
      'Create a new branch called `feature` and switch to it. Then create a file called `feature.txt` with the content "New feature" and commit it with the message "Add feature".',
    hints: [
      'Use `git branch <name>` or `git checkout -b <name>` to create and switch',
      'Make sure you are on the `feature` branch before committing',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'README.md'), '# Project\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
    },
    validationContext:
      'Check that: 1) A branch named "feature" exists, 2) HEAD is on the "feature" branch, 3) feature.txt exists with "New feature", 4) The latest commit on feature has message "Add feature".',
  },
  {
    id: 'staging-selective',
    title: 'Selective Staging',
    difficulty: 'Beginner',
    description:
      'There are three modified files in the repository: `a.txt`, `b.txt`, and `c.txt`. Stage ONLY `a.txt` and `c.txt`, then commit with the message "Add selected files". Do NOT stage `b.txt`.',
    hints: [
      'Use `git add <file>` to stage specific files',
      'Use `git status` to verify what is staged',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'a.txt'), 'File A\n');
      fs.writeFileSync(path.join(dir, 'b.txt'), 'File B\n');
      fs.writeFileSync(path.join(dir, 'c.txt'), 'File C\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'a.txt'), 'File A modified\n');
      fs.writeFileSync(path.join(dir, 'b.txt'), 'File B modified\n');
      fs.writeFileSync(path.join(dir, 'c.txt'), 'File C modified\n');
    },
    validationContext:
      'Check that: 1) a.txt and c.txt are committed with the message "Add selected files", 2) b.txt is NOT in that commit (still modified/unstaged), 3) git diff shows b.txt still has changes.',
  },
  {
    id: 'undo-last-commit',
    title: 'Oops, Undo!',
    difficulty: 'Beginner',
    description:
      'The last commit was a mistake. Undo it so the changes are back in the working directory (unstaged). The commit history should show only the "Initial commit".',
    hints: [
      'Use `git reset` with the right flag',
      'There is a difference between --soft, --mixed, and --hard',
      '`git log` will show you the commit history',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'file.txt'), 'Original\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'file.txt'), 'Mistake\n');
      execSync('git add . && git commit -m "Bad commit"', { cwd: dir });
    },
    validationContext:
      'Check that: 1) Only one commit exists with message "Initial commit", 2) file.txt has content "Mistake" in the working directory, 3) file.txt changes are unstaged.',
  },
  {
    id: 'view-diff',
    title: 'Spot the Difference',
    difficulty: 'Beginner',
    description:
      'There are some unstaged changes in `config.txt`. Use `git diff` to find what line was changed, then create a file called `answer.txt` containing ONLY the new line that was added (not the old one). Commit everything with message "Found the diff".',
    hints: [
      '`git diff` shows unstaged changes',
      'Lines starting with + are additions, - are removals',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'config.txt'), 'host=localhost\nport=3000\ndebug=false\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'config.txt'), 'host=localhost\nport=8080\ndebug=false\n');
    },
    validationContext:
      'Check that: 1) answer.txt exists and contains "port=8080", 2) All files are committed with message "Found the diff".',
  },

  // ==================== INTERMEDIATE ====================
  {
    id: 'merge-conflict',
    title: 'Conflict Resolution',
    difficulty: 'Intermediate',
    description:
      'There are two branches: `main` and `feature`. Both modified `data.txt` on the same line. Merge `feature` into `main` and resolve the conflict by keeping BOTH changes (main\'s line first, then feature\'s line). Commit the merge.',
    hints: [
      'Use `git merge feature` while on main',
      'Open the conflicted file and look for <<<<<<< markers',
      'Remove the conflict markers and keep both lines',
      'Stage and commit to complete the merge',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'data.txt'), 'Original line\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      execSync('git checkout -b feature', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'data.txt'), 'Feature change\n');
      execSync('git add . && git commit -m "Feature update"', { cwd: dir });
      execSync('git checkout main', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'data.txt'), 'Main change\n');
      execSync('git add . && git commit -m "Main update"', { cwd: dir });
    },
    validationContext:
      'Check that: 1) The merge is complete (no conflict markers in data.txt), 2) data.txt contains both "Main change" and "Feature change" with Main\'s line first, 3) The merge commit exists in the log.',
  },
  {
    id: 'cherry-pick',
    title: 'Cherry Picker',
    difficulty: 'Intermediate',
    description:
      'The `feature` branch has 3 commits. Cherry-pick ONLY the commit with message "Add utility function" onto `main`. Do NOT bring the other commits.',
    hints: [
      'Use `git log feature` to find the commit hash',
      'Use `git cherry-pick <hash>` on main',
      '`git log --oneline feature` gives a compact view',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'main.txt'), 'Main file\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      execSync('git checkout -b feature', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'experiment.txt'), 'Experiment\n');
      execSync('git add . && git commit -m "Add experiment"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'util.txt'), 'Utility function\n');
      execSync('git add . && git commit -m "Add utility function"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'debug.txt'), 'Debug stuff\n');
      execSync('git add . && git commit -m "Add debug code"', { cwd: dir });
      execSync('git checkout main', { cwd: dir });
    },
    validationContext:
      'Check that: 1) HEAD is on main, 2) util.txt exists with "Utility function", 3) experiment.txt does NOT exist on main, 4) debug.txt does NOT exist on main, 5) The commit message "Add utility function" appears in main\'s log.',
  },
  {
    id: 'interactive-rebase',
    title: 'Rewrite History',
    difficulty: 'Intermediate',
    description:
      'There are 4 commits on main. Use interactive rebase to squash the last 3 commits into a single commit with the message "Combined changes". The first commit "Initial commit" should remain unchanged.',
    hints: [
      'Use `git rebase -i HEAD~3` to start interactive rebase',
      'Change `pick` to `squash` (or `s`) for commits you want to combine',
      'You can also use `git rebase -i <commit-hash>` with the hash of Initial commit',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'base.txt'), 'Base\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'a.txt'), 'A\n');
      execSync('git add . && git commit -m "Add A"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'b.txt'), 'B\n');
      execSync('git add . && git commit -m "Add B"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'c.txt'), 'C\n');
      execSync('git add . && git commit -m "Add C"', { cwd: dir });
    },
    validationContext:
      'Check that: 1) There are exactly 2 commits total, 2) First commit is "Initial commit", 3) Second commit is "Combined changes", 4) All files (base.txt, a.txt, b.txt, c.txt) exist.',
  },
  {
    id: 'stash-apply',
    title: 'Stash It Away',
    difficulty: 'Intermediate',
    description:
      'You have uncommitted changes in `work.txt`. Stash them, then create a new branch called `hotfix`, make a commit there with a file `fix.txt` containing "Bug fixed" and message "Hotfix applied". Switch back to `main` and apply your stash. Commit everything with message "Resume work".',
    hints: [
      '`git stash` saves your changes temporarily',
      '`git stash pop` or `git stash apply` brings them back',
      'Make sure to switch branches between operations',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'work.txt'), 'Initial work\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'work.txt'), 'Work in progress\n');
    },
    validationContext:
      'Check that: 1) "hotfix" branch exists with a commit "Hotfix applied" containing fix.txt, 2) HEAD is on main, 3) work.txt has "Work in progress", 4) Latest commit on main is "Resume work", 5) The stash list is empty (stash was applied/popped).',
  },
  {
    id: 'amend-commit',
    title: 'Amend & Fix',
    difficulty: 'Intermediate',
    description:
      'The last commit forgot to include `forgotten.txt`. Create a file called `forgotten.txt` with the content "Oops, forgot this!" and amend the last commit to include it. The commit message should be changed to "Complete feature with all files".',
    hints: [
      '`git commit --amend` lets you modify the last commit',
      'Stage the new file first, then amend',
      'You can change the message while amending with -m',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'main.txt'), 'Main file\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'feature.txt'), 'Feature\n');
      execSync('git add . && git commit -m "Add feature"', { cwd: dir });
    },
    validationContext:
      'Check that: 1) forgotten.txt exists with "Oops, forgot this!", 2) The last commit message is "Complete feature with all files", 3) The last commit includes both feature.txt and forgotten.txt, 4) There are exactly 2 commits total (no extra commit for the forgotten file).',
  },

  // ==================== ADVANCED ====================
  {
    id: 'bisect-bug',
    title: 'Bug Hunter',
    difficulty: 'Advanced',
    description:
      'There is a bug introduced somewhere in the commit history. The file `app.js` contains `BUG` in one of the commits. Use `git bisect` to find the EXACT commit that introduced the bug. Create a file called `culprit.txt` containing the short hash (first 7 characters) of the bad commit and commit with message "Found the bug".',
    hints: [
      '`git bisect start` to begin bisecting',
      '`git bisect bad` marks current as bad, `git bisect good <hash>` marks a known good commit',
      'Check the file content at each step to determine good/bad',
      '`git bisect reset` when done',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("v1");\n');
      execSync('git add . && git commit -m "Version 1"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("v2");\n');
      execSync('git add . && git commit -m "Version 2"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("v3");\n');
      execSync('git add . && git commit -m "Version 3"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("BUG");\n');
      execSync('git add . && git commit -m "Version 4"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("BUG v5");\n');
      execSync('git add . && git commit -m "Version 5"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("BUG v6");\n');
      execSync('git add . && git commit -m "Version 6"', { cwd: dir });
    },
    validationContext:
      'Check that: 1) culprit.txt exists and contains the short hash of the commit with message "Version 4" (which introduced BUG), 2) The commit "Found the bug" exists, 3) bisect session is ended (git bisect reset was called).',
  },
  {
    id: 'reflog-recovery',
    title: 'Lost & Found',
    difficulty: 'Advanced',
    description:
      'A branch called `important-work` was accidentally deleted. Use the reflog to find the commit it pointed to and recreate the branch pointing to that exact commit. The branch should contain a file called `important.txt`.',
    hints: [
      '`git reflog` shows all reference changes including deleted branches',
      'Look for entries mentioning "important-work"',
      '`git branch <name> <commit-hash>` creates a branch at a specific commit',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'readme.md'), '# Main\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      execSync('git checkout -b important-work', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'important.txt'), 'Critical work\n');
      execSync('git add . && git commit -m "Add important work"', { cwd: dir });
      execSync('git checkout main', { cwd: dir });
      execSync('git branch -D important-work', { cwd: dir });
    },
    validationContext:
      'Check that: 1) Branch "important-work" exists again, 2) Checking out that branch shows important.txt with "Critical work", 3) The commit "Add important work" is on the branch.',
  },
  {
    id: 'revert-middle',
    title: 'Surgical Revert',
    difficulty: 'Advanced',
    description:
      'There are 5 commits on main. Revert ONLY the 3rd commit (message: "Add broken feature") without affecting any other commits. The revert should create a new commit (do NOT rewrite history).',
    hints: [
      '`git revert <hash>` creates a new commit that undoes a specific commit',
      '`git log --oneline` to find the commit hash',
      'Unlike reset, revert does not rewrite history',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'base.txt'), 'Base\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'good1.txt'), 'Good 1\n');
      execSync('git add . && git commit -m "Add good feature 1"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'broken.txt'), 'Broken!\n');
      execSync('git add . && git commit -m "Add broken feature"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'good2.txt'), 'Good 2\n');
      execSync('git add . && git commit -m "Add good feature 2"', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'good3.txt'), 'Good 3\n');
      execSync('git add . && git commit -m "Add good feature 3"', { cwd: dir });
    },
    validationContext:
      'Check that: 1) There are 6 commits (5 original + 1 revert), 2) broken.txt does NOT exist in the working tree, 3) good1.txt, good2.txt, good3.txt still exist, 4) The revert commit message mentions "Add broken feature".',
  },
  {
    id: 'tag-release',
    title: 'Tag & Release',
    difficulty: 'Intermediate',
    description:
      'Create an annotated tag called `v1.0.0` on the current HEAD with the message "Release version 1.0.0". Then create a new commit adding `changelog.txt` with content "## v1.0.0\\n- Initial release" and message "Add changelog". Finally, create a lightweight tag `v1.1.0-beta` on this new commit.',
    hints: [
      '`git tag -a <name> -m "<message>"` creates an annotated tag',
      '`git tag <name>` creates a lightweight tag',
      '`git tag -l` lists all tags',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, 'app.js'), 'const version = "1.0.0";\n');
      execSync('git add . && git commit -m "Initial release"', { cwd: dir });
    },
    validationContext:
      'Check that: 1) Annotated tag v1.0.0 exists with message "Release version 1.0.0", 2) Lightweight tag v1.1.0-beta exists, 3) changelog.txt exists with the right content, 4) v1.0.0 points to "Initial release" commit, 5) v1.1.0-beta points to "Add changelog" commit.',
  },
  {
    id: 'clean-repo',
    title: 'Spring Cleaning',
    difficulty: 'Advanced',
    description:
      'The repository has a mess: untracked files, ignored files (via .gitignore), and modified tracked files. Your task:\n1. Remove ALL untracked files (but NOT ignored ones)\n2. Discard all changes to tracked files (restore them)\n3. Create a file called `cleaned.txt` with "All clean!" and commit with message "Clean slate"',
    hints: [
      '`git clean -f` removes untracked files',
      '`git clean -fd` also removes untracked directories',
      '`git checkout -- .` or `git restore .` discards changes to tracked files',
      'Be careful with `-x` flag — it removes ignored files too',
    ],
    setup(dir) {
      execSync('git init', { cwd: dir });
      fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n*.log\n');
      fs.writeFileSync(path.join(dir, 'tracked.txt'), 'Original\n');
      execSync('git add . && git commit -m "Initial commit"', { cwd: dir });
      // Create mess
      fs.writeFileSync(path.join(dir, 'tracked.txt'), 'Modified!\n');
      fs.writeFileSync(path.join(dir, 'untracked1.txt'), 'Junk\n');
      fs.writeFileSync(path.join(dir, 'untracked2.txt'), 'More junk\n');
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'node_modules', 'pkg.js'), '// package\n');
      fs.writeFileSync(path.join(dir, 'debug.log'), 'Log entry\n');
    },
    validationContext:
      'Check that: 1) untracked1.txt and untracked2.txt are gone, 2) tracked.txt has "Original" (changes discarded), 3) .gitignore, node_modules/, and debug.log still exist (ignored files preserved), 4) cleaned.txt exists with "All clean!", 5) Commit "Clean slate" exists.',
  },
];

export default challenges;
