# Choice Explanations Generation Guide

This guide explains how to automatically generate choice explanations for all AWS SAA quiz questions using the Claude API.

## Prerequisites

1. **Node.js installed** (version 14 or higher)
2. **Claude API key** from https://console.anthropic.com/
3. **@anthropic-ai/sdk** package

## Setup

### Step 1: Install Dependencies

```bash
npm install @anthropic-ai/sdk
```

### Step 2: Get Your Claude API Key

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Go to API Keys section
4. Create a new API key
5. Copy the key (it starts with "sk-ant-...")

### Step 3: Set Your API Key

**Windows (Command Prompt):**
```cmd
set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

**Linux/Mac:**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

## Usage

### Test with Dry Run First

Test the script without making changes:

```bash
node generate-choice-explanations.js --dry-run --batch=5
```

This will process the first 5 questions without saving results.

### Process All Questions

```bash
node generate-choice-explanations.js
```

This will:
- Create a backup of your questions.json
- Process all 585 questions
- Save results to `questions-with-explanations.json`
- Track progress in `generation-progress.json`

### Process in Batches

Process 100 questions at a time:

```bash
node generate-choice-explanations.js --batch=100
```

Process starting from question 200:

```bash
node generate-choice-explanations.js --start=200
```

Process 50 questions starting from question 300:

```bash
node generate-choice-explanations.js --start=300 --batch=50
```

## Progress Tracking

The script automatically saves progress to `generation-progress.json`. If the script is interrupted:

1. Simply run it again
2. It will skip already-processed questions
3. Continue from where it left off

To start fresh:
```bash
del generation-progress.json
```

## Review Process

Since accuracy is your priority, follow this review workflow:

### 1. Automated Generation
```bash
node generate-choice-explanations.js
```

### 2. Review Hard Questions First

The output file includes difficulty levels. Focus your manual review on:
- All "Hard" questions (~100 questions)
- Sample of "Medium" questions (~200 questions)
- Spot-check "Easy" questions (~50 questions)

### 3. Verification Script

Use the verification script to find potential issues:

```bash
node verify-explanations.js
```

## Expected Output Format

Each question will have a new `choiceExplanations` field:

```json
{
  "id": "SAA-001",
  "domainId": "D1",
  "domain": "Design Secure Architectures",
  "section": "IAM",
  "question": "Which feature lets you grant temporary permissions to access AWS resources?",
  "choices": [
    "Resource Tags",
    "IAM Roles",
    "IAM Groups",
    "IAM Users"
  ],
  "answer": 1,
  "explanation": "IAM Roles provide temporary credentials and are commonly assumed by services/users.",
  "difficulty": "Easy",
  "choiceExplanations": {
    "0": "❌ Resource Tags are metadata labels used for organizing and categorizing AWS resources, not for granting permissions or access control.",
    "1": "✅ Correct! IAM Roles provide temporary security credentials that can be assumed by services, applications, or users, making them ideal for granting temporary permissions.",
    "2": "❌ IAM Groups are collections of IAM users that share the same permissions, but they provide permanent access through attached policies, not temporary permissions.",
    "3": "❌ IAM Users are permanent identities with long-term credentials (access keys or passwords), not designed for temporary access."
  }
}
```

## Cost Estimation

- Model: Claude Sonnet 4.5
- ~585 questions × ~500 tokens per request = ~292,500 input tokens
- ~585 questions × ~300 tokens per response = ~175,500 output tokens
- **Estimated cost: $5-10 USD** (based on current API pricing)

## Processing Time

- Rate limit: 50 requests per minute
- 585 questions ÷ 50 = ~12 minutes minimum
- With processing time: **~15-20 minutes total**

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
Make sure you've set the environment variable in your current terminal session.

### Rate Limit Errors
The script includes automatic rate limiting (50 requests/minute). If you hit limits:
- Wait a few minutes
- Run the script again (it will resume from where it stopped)

### API Errors
Check `generation-progress.json` for error details:
```json
{
  "processedIds": ["SAA-001", "SAA-002", ...],
  "errors": [
    {
      "questionId": "SAA-123",
      "error": "Error message here",
      "timestamp": "2026-01-24T..."
    }
  ]
}
```

### JSON Parsing Errors
If the API returns invalid JSON:
- The script will log the error
- Skip that question
- Continue processing
- You can manually fix problematic questions later

## After Generation

1. **Review the output:**
   ```bash
   node verify-explanations.js
   ```

2. **Spot-check random questions** - Open `questions-with-explanations.json` and verify accuracy

3. **Replace original file** (only after review):
   ```bash
   copy questions-with-explanations.json questions.json
   ```

4. **Clean up:**
   ```bash
   del generation-progress.json
   del questions-backup.json
   ```

## Manual Review Checklist

For each question you review, check:

- [ ] All choices have explanations
- [ ] Correct answers marked with ✅
- [ ] Wrong answers marked with ❌
- [ ] Explanations are technically accurate
- [ ] Explanations cite specific AWS services/features
- [ ] No contradictions with the main explanation
- [ ] Concise (1-2 sentences per choice)

## Need Help?

If you encounter issues:
1. Check the console output for error messages
2. Review `generation-progress.json` for detailed error logs
3. Verify your API key is correct
4. Ensure you have internet connection
5. Check the backup file exists before proceeding
