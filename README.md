# Auggie the BuilderBot

Auggie is a Discord bot designed to help you learn by building small projects. It uses AI (LLMs) to answer questions, provide challenges, and encourage incremental progress on your ideas.

## Features

- **Ask Questions:**  
  Use `!ask [question]` to get guidance from Auggie (powered by OpenAI’s API).

- **Weekly Challenges:**  
  `!challenge` generates a beginner-friendly AI or coding challenge for you to try.

- **Note-Taking:**  
  `!addnote [text]` to store a quick note, `!mynotes` to review them, and `!clearnotes` to clear them.

- **Daily Prompts (Optional):**  
  Auggie can post random open-ended questions once a day to spark conversation.

- **Chess Puzzles (Feature-Flagged):**  
  By default, Auggie includes a daily chess puzzle and `!testpuzzle` command. If you don’t need it, set `ENABLE_CHESS_PUZZLES = false` in the code to disable.

## Setup

1. **Install Dependencies:**
   ```bash
   npm install
