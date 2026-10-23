// FlipTheSAA — Multi-answer helpers

// ============================================================================
// MULTI-ANSWER SUPPORT - Helper functions for questions with multiple correct answers
// ============================================================================

/**
 * WHAT IT DOES: Checks if a question has multiple correct answers
 *
 * WHY WE NEED IT: Questions can have either single answer (integer) or
 * multiple answers (array). We need to detect which type to handle selection
 * and validation correctly.
 *
 * PARAMETERS:
 * - question: Question object with answer field
 *
 * RETURNS: Boolean - true if multi-answer, false if single-answer
 *
 * EXAMPLES:
 * - isMultiAnswer({answer: 2}) → false (single answer)
 * - isMultiAnswer({answer: [1, 2]}) → true (multi-answer)
 */
export function isMultiAnswer(question) {
  return Array.isArray(question.answer);
}

/**
 * WHAT IT DOES: Validates if user's answer is correct
 *
 * WHY WE NEED IT: Handles both single-answer (simple equality) and
 * multi-answer (array comparison with all-or-nothing logic)
 *
 * HOW IT WORKS:
 * - Single-answer: userAnswer === correctAnswer
 * - Multi-answer: Arrays must match exactly (same indices, same length)
 *   User must select ALL correct answers and NO incorrect answers
 *
 * PARAMETERS:
 * - userAnswer: User's selection (integer or array of integers)
 * - correctAnswer: Correct answer (integer or array of integers)
 *
 * RETURNS: Boolean - true if correct, false otherwise
 *
 * EXAMPLES:
 * Single-answer:
 * - isCorrectAnswer(2, 2) → true
 * - isCorrectAnswer(1, 2) → false
 *
 * Multi-answer (all-or-nothing):
 * - isCorrectAnswer([1, 2], [1, 2]) → true (exact match)
 * - isCorrectAnswer([2, 1], [1, 2]) → true (order doesn't matter)
 * - isCorrectAnswer([1], [1, 2]) → false (missing one answer)
 * - isCorrectAnswer([1, 2, 3], [1, 2]) → false (extra wrong answer)
 */
export function isCorrectAnswer(userAnswer, correctAnswer) {
  // Multi-answer question
  if (Array.isArray(correctAnswer)) {
    // User must provide an array
    if (!Array.isArray(userAnswer)) return false;

    // Must select exact number of answers (all-or-nothing)
    if (userAnswer.length !== correctAnswer.length) return false;

    // All selected answers must be correct (no extras, no missing)
    // Sort both arrays to compare regardless of selection order
    const sortedUser = [...userAnswer].sort((a, b) => a - b);
    const sortedCorrect = [...correctAnswer].sort((a, b) => a - b);
    return sortedUser.every((val, idx) => val === sortedCorrect[idx]);
  }

  // Single-answer question
  return userAnswer === correctAnswer;
}

/**
 * WHAT IT DOES: Checks if a choice index is selected
 *
 * WHY WE NEED IT: User selections can be stored as integer (single-answer)
 * or array (multi-answer). This helper abstracts the check.
 *
 * PARAMETERS:
 * - userAnswer: User's selection (integer or array of integers)
 * - choiceIndex: Index to check (0-based)
 *
 * RETURNS: Boolean - true if selected, false otherwise
 *
 * EXAMPLES:
 * - isChoiceSelected(2, 2) → true (single-answer, exact match)
 * - isChoiceSelected(2, 1) → false (single-answer, no match)
 * - isChoiceSelected([1, 2], 1) → true (multi-answer, included)
 * - isChoiceSelected([1, 2], 3) → false (multi-answer, not included)
 */
export function isChoiceSelected(userAnswer, choiceIndex) {
  if (Array.isArray(userAnswer)) {
    return userAnswer.includes(choiceIndex);
  }
  return userAnswer === choiceIndex;
}
