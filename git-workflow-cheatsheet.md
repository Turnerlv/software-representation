# Chomp Git Architecture & Sync Cheatsheet

Because Chomp uses both **Git Worktrees** and a **Git Submodule**, the repository operates in a "3D" state. This document explains the mental model and the commands needed to diagnose sync issues.

## 🏛️ The Mental Model: Shared Brain vs. Remote Teammate

```text
💻 YOUR LOCAL MACHINE
│
├── .git/  <-- The "Shared Brain" (Main Code Database)
│
├── chomp/  (Main Directory)
│   ├── packages/core/         [Reads from Shared Brain]
│   └── fixtures/research/     [ISOLATED SUBMODULE DB A] 
│
└── .git/worktrees/
    └── explore_nextjs/  (Worktree Directory)
        ├── packages/core/     [Reads from Shared Brain]
        └── fixtures/research/ [ISOLATED SUBMODULE DB B] 
```

* **The Main Code (`packages/core`, etc.):** Acts as a **Shared Brain**. A branch or commit created in a worktree is instantly available in your main directory. You do not need GitHub to sync code between folders.
* **The Submodule (`fixtures/research`):** Acts like a **Remote Teammate**. When initialized inside a worktree, Git creates a separate, isolated database for it. A commit made to the submodule in a worktree is *invisible* to the main directory until you push it to GitHub and pull it back down.

---

## 🔍 Diagnosis Commands: "Where am I and what is out of sync?"

Whenever you context-switch back to the project, run these commands to get your bearings:

### 1. `git worktree list`
* **What it does:** Shows every physical folder on your machine and which branch is currently checked out in it.
* **Why use it:** Prevents the "Wait, where did I leave that branch?" problem.

### 2. `git branch -vv`
* **What it does:** Shows all your local branches, their upstream tracking branches, and sync status.
* **What to look for:** Look at the brackets. 
  * `[origin/main]` = In sync.
  * `[origin/main: behind 5]` = You are out of sync with GitHub. You need to `git pull`.
  * `[origin/main: ahead 2]` = You have local commits that need to be pushed.

### 3. `git status`
* **What it does:** Checks the state of your current working tree.
* **What to look for:** Look for `modified: fixtures/research (new commits)`. This is Git telling you: *"The code branch you are on expects the research database to be at a newer point in time than the submodule folder currently is."*

### 4. `git submodule status`
* **What it does:** Compares the submodule commit hash the main repo *expects* versus the hash the submodule is *actually* checked out at.
* **What to look for (The Prefixes):**
  * ` 405cd...` (Space): Perfect harmony. Code and ledger are in sync.
  * `+359f8...` (Plus): Out of sync! Your folder has different files than what the code expects. (Fix: `git submodule update`)
  * `-359f8...` (Minus): Submodule isn't initialized in this worktree yet. (Fix: `git submodule update --init`)
  * `U359f8...` (U): Merge conflict in the submodule.

---

## 🛠️ The Fix Commands

If the commands above show that things are out of sync, here is how you fix them:

**Scenario A: The main code is behind GitHub**
```bash
# Pulls the latest extractor code and updates the submodule pointer
git pull
```

**Scenario B: `git status` says `fixtures/research` has new commits / is out of sync**
```bash
# Tells Git: "Go to GitHub, download the exact submodule commit this code expects, and put it in my folder."
git submodule update
```

**Scenario C: You want to manually pull the absolute latest research data regardless of the code**
```bash
cd fixtures/research
git pull origin main
cd ..
# (Note: This will cause `git status` to show new commits if the code hasn't been updated to expect this newer ledger yet).
```
