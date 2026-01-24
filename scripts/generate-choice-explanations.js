/**
 * Script to generate choice explanations for AWS SAA quiz questions
 * Uses Claude API to create accurate explanations for all answer choices
 *
 * Usage:
 * 1. npm install @anthropic-ai/sdk
 * 2. Set environment variable: set ANTHROPIC_API_KEY=your_api_key_here
 * 3. node generate-choice-explanations.js
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// Configuration
const INPUT_FILE = './questions.json';
const OUTPUT_FILE = './questions-with-explanations.json';
const BACKUP_FILE = './questions-backup.json';
const PROGRESS_FILE = './generation-progress.json';

// Rate limiting (to avoid API limits)
const REQUESTS_PER_MINUTE = 50;
const DELAY_MS = (60 * 1000) / REQUESTS_PER_MINUTE;

class ExplanationGenerator {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
    this.progress = this.loadProgress();
  }

  loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
    return { processedIds: [], errors: [] };
  }

  saveProgress() {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(this.progress, null, 2));
  }

  async generateChoiceExplanations(question) {
    const isMultiAnswer = Array.isArray(question.answer);
    const correctIndices = isMultiAnswer ? question.answer : [question.answer];

    // Get wrong answer indices only
    const wrongIndices = question.choices
      .map((_, idx) => idx)
      .filter(idx => !correctIndices.includes(idx));

    const prompt = `You are an AWS Solutions Architect Associate exam expert. Given this exam question, provide accurate, concise explanations for why each WRONG answer is incorrect, based on official AWS documentation.

Question ID: ${question.id}
Domain: ${question.domain}
Section: ${question.section}
Difficulty: ${question.difficulty}

Question: ${question.question}

All Choices:
${question.choices.map((choice, idx) => `${idx}. ${choice}`).join('\n')}

Correct Answer(s): ${correctIndices.map(i => `Choice ${i}: "${question.choices[i]}"`).join(', ')}
Current Explanation for Correct Answer: ${question.explanation}

WRONG Choices to Explain:
${wrongIndices.map(i => `${i}. ${question.choices[i]}`).join('\n')}

Instructions:
1. Provide explanations ONLY for the WRONG answer choices listed above
2. For each WRONG choice: Explain WHY it's incorrect or what it actually does (but why it doesn't fit this question)
3. Keep explanations accurate to AWS documentation
4. Be concise but informative (1-2 sentences)
5. DO NOT repeat the choice text - provide ONLY the explanation (the choice text will be added automatically)

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
${wrongIndices.map(i => `  "${i}": "Explanation for why choice ${i} is wrong (do NOT include the choice text)"`).join(',\n')}
}`;

    try {
      const message = await this.client.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 1024,
        temperature: 0.3, // Lower temperature for more accurate, consistent responses
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const responseText = message.content[0].text.trim();

      // Remove markdown code blocks if present
      const jsonText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const explanations = JSON.parse(jsonText);

      // Validate that we have explanations for all WRONG choices only
      const expectedKeys = wrongIndices.map(idx => idx.toString());
      const hasAllKeys = expectedKeys.every(key => key in explanations);

      if (!hasAllKeys) {
        throw new Error(`Missing explanations for some wrong choices. Expected keys: ${expectedKeys.join(', ')}`);
      }

      // Ensure no correct answers are included
      correctIndices.forEach(idx => {
        if (idx.toString() in explanations) {
          delete explanations[idx.toString()];
          console.log(`  ⚠️  Removed explanation for correct answer (choice ${idx})`);
        }
      });

      return explanations;
    } catch (error) {
      console.error(`Error generating explanations for ${question.id}:`, error.message);
      throw error;
    }
  }

  async processQuestions(questions, options = {}) {
    const { startIndex = 0, batchSize = null, dryRun = false } = options;

    const questionsToProcess = batchSize
      ? questions.slice(startIndex, startIndex + batchSize)
      : questions.slice(startIndex);

    console.log(`\nProcessing ${questionsToProcess.length} questions...`);
    console.log(`Starting from index ${startIndex}`);
    if (dryRun) console.log('DRY RUN MODE - No changes will be saved\n');

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < questionsToProcess.length; i++) {
      const question = questionsToProcess[i];
      const actualIndex = startIndex + i;

      // Skip if already processed
      if (this.progress.processedIds.includes(question.id)) {
        console.log(`[${actualIndex + 1}/${questions.length}] ⏭️  Skipping ${question.id} (already processed)`);
        results.push({ ...question });
        continue;
      }

      console.log(`[${actualIndex + 1}/${questions.length}] Processing ${question.id} - ${question.section}...`);

      try {
        const choiceExplanations = await this.generateChoiceExplanations(question);

        const updatedQuestion = {
          ...question,
          choiceExplanations
        };

        results.push(updatedQuestion);

        if (!dryRun) {
          this.progress.processedIds.push(question.id);
          this.saveProgress();
        }

        successCount++;
        console.log(`  ✅ Generated explanations for ${question.choices.length} choices`);

        // Rate limiting delay
        if (i < questionsToProcess.length - 1) {
          await this.sleep(DELAY_MS);
        }
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Failed: ${error.message}`);

        this.progress.errors.push({
          questionId: question.id,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        if (!dryRun) {
          this.saveProgress();
        }

        // Keep original question without explanations
        results.push({ ...question });
      }
    }

    console.log(`\n✅ Success: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);

    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  mergeResults(originalQuestions, processedQuestions) {
    const processedMap = new Map(
      processedQuestions.map(q => [q.id, q])
    );

    return originalQuestions.map(original => {
      const processed = processedMap.get(original.id);
      return processed || original;
    });
  }
}

// CLI Interface
async function main() {
  console.log('=== AWS SAA Choice Explanations Generator ===\n');

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: ANTHROPIC_API_KEY environment variable not set');
    console.log('\nSet it with: set ANTHROPIC_API_KEY=your_api_key_here');
    console.log('Get your API key from: https://console.anthropic.com/\n');
    process.exit(1);
  }

  // Load questions
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Error: ${INPUT_FILE} not found`);
    process.exit(1);
  }

  console.log(`Loading questions from ${INPUT_FILE}...`);
  const questions = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`✅ Loaded ${questions.length} questions\n`);

  // Create backup
  console.log(`Creating backup at ${BACKUP_FILE}...`);
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(questions, null, 2));
  console.log('✅ Backup created\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const startIndex = parseInt(args.find(arg => arg.startsWith('--start='))?.split('=')[1] || '0');
  const batchSize = args.find(arg => arg.startsWith('--batch='))
    ? parseInt(args.find(arg => arg.startsWith('--batch='))?.split('=')[1])
    : null;

  // Initialize generator
  const generator = new ExplanationGenerator(apiKey);

  // Show progress
  if (generator.progress.processedIds.length > 0) {
    console.log(`📊 Progress: ${generator.progress.processedIds.length}/${questions.length} questions already processed`);
    console.log(`   Errors: ${generator.progress.errors.length}\n`);
  }

  // Process questions
  const processedQuestions = await generator.processQuestions(questions, {
    startIndex,
    batchSize,
    dryRun
  });

  if (!dryRun) {
    // Merge results with original questions
    const finalQuestions = generator.mergeResults(questions, processedQuestions);

    // Save results
    console.log(`\nSaving results to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalQuestions, null, 2));
    console.log('✅ Results saved\n');

    // Summary
    console.log('=== Summary ===');
    console.log(`Total questions: ${questions.length}`);
    console.log(`Processed: ${generator.progress.processedIds.length}`);
    console.log(`Errors: ${generator.progress.errors.length}`);

    if (generator.progress.errors.length > 0) {
      console.log('\n❌ Questions with errors:');
      generator.progress.errors.forEach(err => {
        console.log(`   ${err.questionId}: ${err.error}`);
      });
    }

    console.log('\n✅ Generation complete!');
    console.log(`\nNext steps:`);
    console.log(`1. Review ${OUTPUT_FILE}`);
    console.log(`2. If satisfied, replace ${INPUT_FILE} with the new file`);
    console.log(`3. Delete ${PROGRESS_FILE} to reset progress tracking`);
  } else {
    console.log('\n⚠️  DRY RUN - No files were modified');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { ExplanationGenerator };
