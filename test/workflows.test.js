import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readWorkflow = (name) =>
  readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

test('generated implementation PR carries a candidate marker and closing reference', async () => {
  const workflow = await readWorkflow('approval-automation.yml');
  assert.match(workflow, /Closes #\$ISSUE_NUMBER/);
  assert.match(workflow, /self-improvement-candidate:\$ISSUE_NUMBER/);
  assert.match(workflow, /persist-credentials: false/);
});

test('review-fix loop keeps its approval, iteration, HEAD, and policy gates', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  assert.match(workflow, /any\(\.labels\[\]\?; \.name == "approved"\)/);
  assert.match(workflow, /MAX_FIX_ATTEMPTS: '3'/);
  assert.match(workflow, /current" = "\$REVIEWED_SHA"/);
  assert.match(workflow, /--match-head-commit "\$REVIEWED_SHA"/);
  assert.match(workflow, /\^\\\.github\/workflows\//);
  assert.match(workflow, /npm install && npm test/);
});

test('generated code jobs never receive the publication credential', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const reviewAndFix = workflow.slice(workflow.indexOf('\n  review:'), workflow.indexOf('\n  publish-fix:'));
  assert.doesNotMatch(reviewAndFix, /SELF_IMPROVEMENT_PUBLISH_TOKEN/);
  assert.match(workflow, /publish-fix:[\s\S]*SELF_IMPROVEMENT_PUBLISH_TOKEN/);
});
