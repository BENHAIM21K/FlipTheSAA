/**
 * Verification script for generated choice explanations
 * Helps identify potential issues and questions that need manual review
 */

const fs = require('fs');

const INPUT_FILE = './questions-with-explanations.json';
const REVIEW_OUTPUT = './questions-needing-review.json';

class ExplanationVerifier {
  constructor() {
    this.issues = [];
  }

  verifyQuestion(question, index) {
    const issues = [];

    // Check if choiceExplanations exists
    if (!question.choiceExplanations) {
      issues.push({
        type: 'missing',
        severity: 'high',
        message: 'Missing choiceExplanations field'
      });
      return issues;
    }

    const explanations = question.choiceExplanations;
    const numChoices = question.choices.length;
    const correctIndices = Array.isArray(question.answer)
      ? question.answer
      : [question.answer];

    // Check 1: All choices have explanations
    for (let i = 0; i < numChoices; i++) {
      if (!explanations[i.toString()]) {
        issues.push({
          type: 'incomplete',
          severity: 'high',
          message: `Missing explanation for choice ${i}: "${question.choices[i]}"`
        });
      }
    }

    // Check 2: Correct answers marked with ✅
    correctIndices.forEach(idx => {
      const exp = explanations[idx.toString()];
      if (exp && !exp.includes('✅')) {
        issues.push({
          type: 'marking',
          severity: 'medium',
          message: `Correct answer (choice ${idx}) not marked with ✅`
        });
      }
    });

    // Check 3: Wrong answers marked with ❌
    for (let i = 0; i < numChoices; i++) {
      if (!correctIndices.includes(i)) {
        const exp = explanations[i.toString()];
        if (exp && !exp.includes('❌')) {
          issues.push({
            type: 'marking',
            severity: 'medium',
            message: `Wrong answer (choice ${i}) not marked with ❌`
          });
        }
      }
    }

    // Check 4: Explanations are not too short
    Object.entries(explanations).forEach(([idx, exp]) => {
      if (exp.length < 20) {
        issues.push({
          type: 'quality',
          severity: 'low',
          message: `Explanation for choice ${idx} is very short (${exp.length} chars)`
        });
      }
    });

    // Check 5: Explanations are not too long
    Object.entries(explanations).forEach(([idx, exp]) => {
      if (exp.length > 300) {
        issues.push({
          type: 'quality',
          severity: 'low',
          message: `Explanation for choice ${idx} is very long (${exp.length} chars) - consider shortening`
        });
      }
    });

    // Check 6: Correct answer explanation mentions why it's correct
    correctIndices.forEach(idx => {
      const exp = explanations[idx.toString()]?.toLowerCase() || '';
      const hasPositiveWords = ['correct', 'provides', 'enables', 'allows', 'best', 'ideal', 'appropriate'];
      const hasAny = hasPositiveWords.some(word => exp.includes(word));

      if (!hasAny) {
        issues.push({
          type: 'quality',
          severity: 'medium',
          message: `Correct answer explanation (choice ${idx}) should explain WHY it's correct`
        });
      }
    });

    return issues;
  }

  generateReport(questions) {
    console.log('=== Explanation Verification Report ===\n');

    let totalQuestions = questions.length;
    let questionsWithExplanations = 0;
    let questionsWithIssues = 0;
    let questionsByDifficulty = { Easy: 0, Medium: 0, Hard: 0 };
    let issuesByType = {};
    let issuesBySeverity = { high: 0, medium: 0, low: 0 };

    const questionsNeedingReview = [];

    questions.forEach((q, index) => {
      if (q.choiceExplanations) {
        questionsWithExplanations++;
      }

      // Count by difficulty
      if (q.difficulty) {
        questionsByDifficulty[q.difficulty] = (questionsByDifficulty[q.difficulty] || 0) + 1;
      }

      const issues = this.verifyQuestion(q, index);

      if (issues.length > 0) {
        questionsWithIssues++;

        issues.forEach(issue => {
          // Count by type
          issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;

          // Count by severity
          issuesBySeverity[issue.severity]++;
        });

        questionsNeedingReview.push({
          ...q,
          _verificationIssues: issues
        });
      }
    });

    // Print summary
    console.log('📊 Overall Statistics:');
    console.log(`   Total questions: ${totalQuestions}`);
    console.log(`   With explanations: ${questionsWithExplanations} (${(questionsWithExplanations/totalQuestions*100).toFixed(1)}%)`);
    console.log(`   With issues: ${questionsWithIssues} (${(questionsWithIssues/totalQuestions*100).toFixed(1)}%)`);
    console.log(`   Clean: ${questionsWithExplanations - questionsWithIssues}\n`);

    console.log('📚 By Difficulty:');
    Object.entries(questionsByDifficulty).forEach(([diff, count]) => {
      console.log(`   ${diff}: ${count}`);
    });
    console.log();

    console.log('⚠️  Issues by Severity:');
    console.log(`   🔴 High: ${issuesBySeverity.high} (must fix)`);
    console.log(`   🟡 Medium: ${issuesBySeverity.medium} (should review)`);
    console.log(`   🟢 Low: ${issuesBySeverity.low} (optional)`);
    console.log();

    console.log('🔍 Issues by Type:');
    Object.entries(issuesByType)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });
    console.log();

    // High priority questions
    const highPriorityQuestions = questionsNeedingReview.filter(q =>
      q._verificationIssues.some(issue => issue.severity === 'high')
    );

    if (highPriorityQuestions.length > 0) {
      console.log(`🔴 HIGH PRIORITY: ${highPriorityQuestions.length} questions need immediate attention:\n`);
      highPriorityQuestions.slice(0, 10).forEach(q => {
        console.log(`   ${q.id} (${q.difficulty}) - ${q.section}`);
        q._verificationIssues
          .filter(i => i.severity === 'high')
          .forEach(issue => {
            console.log(`      ❌ ${issue.message}`);
          });
        console.log();
      });

      if (highPriorityQuestions.length > 10) {
        console.log(`   ... and ${highPriorityQuestions.length - 10} more\n`);
      }
    }

    // Suggested review order
    console.log('📋 Suggested Review Order:\n');
    console.log(`   1. High-severity issues: ${issuesBySeverity.high} questions`);
    console.log(`   2. Hard questions: ${questionsByDifficulty.Hard || 0} questions (for accuracy)`);
    console.log(`   3. Medium-severity issues: ${issuesBySeverity.medium} questions`);
    console.log(`   4. Spot-check Easy questions: ~50 random questions`);
    console.log();

    // Save questions needing review
    if (questionsNeedingReview.length > 0) {
      fs.writeFileSync(REVIEW_OUTPUT, JSON.stringify(questionsNeedingReview, null, 2));
      console.log(`💾 Saved ${questionsNeedingReview.length} questions needing review to:`);
      console.log(`   ${REVIEW_OUTPUT}\n`);
    }

    // Success message
    if (questionsWithIssues === 0 && questionsWithExplanations === totalQuestions) {
      console.log('✅ All questions have complete, well-formatted explanations!');
    } else if (issuesBySeverity.high === 0) {
      console.log('✅ No critical issues found! Medium/low issues are optional to fix.');
    }

    return {
      total: totalQuestions,
      withExplanations: questionsWithExplanations,
      withIssues: questionsWithIssues,
      issues: issuesByType,
      severity: issuesBySeverity
    };
  }

  // Generate sample questions for manual review
  generateReviewSample(questions, options = {}) {
    const {
      hardQuestions = 10,
      mediumQuestions = 5,
      easyQuestions = 5,
      multiAnswerQuestions = 5
    } = options;

    const hard = questions.filter(q => q.difficulty === 'Hard').slice(0, hardQuestions);
    const medium = questions.filter(q => q.difficulty === 'Medium').slice(0, mediumQuestions);
    const easy = questions.filter(q => q.difficulty === 'Easy').slice(0, easyQuestions);
    const multiAnswer = questions.filter(q => Array.isArray(q.answer)).slice(0, multiAnswerQuestions);

    const sample = [...hard, ...medium, ...easy, ...multiAnswer];

    // Remove duplicates
    const unique = Array.from(new Map(sample.map(q => [q.id, q])).values());

    fs.writeFileSync('./review-sample.json', JSON.stringify(unique, null, 2));

    console.log(`\n📝 Generated review sample with ${unique.length} questions:`);
    console.log(`   ${hard.length} Hard questions`);
    console.log(`   ${medium.length} Medium questions`);
    console.log(`   ${easy.length} Easy questions`);
    console.log(`   ${multiAnswer.length} Multi-answer questions`);
    console.log(`   Saved to: review-sample.json\n`);

    return unique;
  }
}

// Main execution
async function main() {
  console.log('=== Choice Explanations Verifier ===\n');

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Error: ${INPUT_FILE} not found`);
    console.log('\nRun generate-choice-explanations.js first.\n');
    process.exit(1);
  }

  const questions = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

  const verifier = new ExplanationVerifier();
  const report = verifier.generateReport(questions);

  // Generate review sample
  const args = process.argv.slice(2);
  if (args.includes('--sample')) {
    verifier.generateReviewSample(questions);
  }

  // Exit code based on issues
  if (report.severity.high > 0) {
    process.exit(1); // Critical issues found
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { ExplanationVerifier };
