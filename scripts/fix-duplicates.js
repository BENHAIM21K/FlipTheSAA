/**
 * Script to remove duplicate choice text from choiceExplanations
 * Fixes: "Choice text: Choice text: Explanation" -> "Choice text: Explanation"
 */

const fs = require('fs');

const INPUT_FILE = './questions-with-explanations.json';
const OUTPUT_FILE = './questions-with-explanations-fixed.json';
const BACKUP_FILE = './questions-with-explanations-backup-before-fix.json';

console.log('=== Fix Duplicate Choice Text in Explanations ===\n');

// Load the file
if (!fs.existsSync(INPUT_FILE)) {
  console.error(`❌ Error: ${INPUT_FILE} not found`);
  process.exit(1);
}

console.log(`Loading ${INPUT_FILE}...`);
const questions = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
console.log(`✅ Loaded ${questions.length} questions\n`);

// Create backup
console.log(`Creating backup at ${BACKUP_FILE}...`);
fs.writeFileSync(BACKUP_FILE, JSON.stringify(questions, null, 2));
console.log('✅ Backup created\n');

let totalFixed = 0;
let questionsFixed = 0;

// Process each question
questions.forEach((question, qIndex) => {
  if (!question.choiceExplanations) {
    return; // Skip questions without choice explanations
  }

  let fixedInThisQuestion = 0;

  Object.entries(question.choiceExplanations).forEach(([choiceIdx, explanation]) => {
    const choiceText = question.choices[choiceIdx];

    if (!choiceText) {
      console.warn(`⚠️  Warning: Question ${question.id} has explanation for choice ${choiceIdx} but no choice text`);
      return;
    }

    // Check if explanation starts with the choice text followed by colon
    // Pattern: "Choice text: Actual explanation"
    // We want to remove this prefix since app.js will add it
    const choicePrefix = new RegExp(`^${escapeRegex(choiceText)}:\\s*`, 'i');

    if (choicePrefix.test(explanation)) {
      // Remove the "Choice text: " prefix
      const fixed = explanation.replace(choicePrefix, '');
      question.choiceExplanations[choiceIdx] = fixed;
      fixedInThisQuestion++;
      totalFixed++;

      if (fixedInThisQuestion === 1) {
        console.log(`[${qIndex + 1}/${questions.length}] Fixing ${question.id}...`);
      }
      console.log(`  ✓ Fixed choice ${choiceIdx}: Removed "${choiceText}:" prefix`);
    }
  });

  if (fixedInThisQuestion > 0) {
    questionsFixed++;
  }
});

// Helper function to escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

console.log(`\n=== Summary ===`);
console.log(`Total questions processed: ${questions.length}`);
console.log(`Questions with fixes: ${questionsFixed}`);
console.log(`Total explanations fixed: ${totalFixed}`);

if (totalFixed > 0) {
  // Save the fixed file
  console.log(`\nSaving fixed questions to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(questions, null, 2));
  console.log('✅ Fixed file saved\n');

  console.log('Next steps:');
  console.log('1. Review the fixed file to ensure it looks correct');
  console.log('2. If satisfied, replace the original:');
  console.log(`   copy ${OUTPUT_FILE} ${INPUT_FILE}`);
  console.log('3. Delete the backup if no longer needed');
} else {
  console.log('\n✅ No duplicates found - file is already clean!');
}
