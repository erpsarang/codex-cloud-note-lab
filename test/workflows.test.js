import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = (name) =>
  readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

test('manual CI constructs and records the prospective merge tree', async () => {
  const ci = await workflow('ci.yml');

  assert.match(ci, /workflow_dispatch:/);
  assert.match(ci, /tested_base_sha:/);
  assert.match(ci, /tested_head_sha:/);
  assert.match(ci, /merge --no-commit --no-ff "\$HEAD_SHA"/);
  assert.match(ci, /testedResultTree:\$tree/);
});

test('Review/Fix binds MERGE_READY to the successful merge CI run', async () => {
  const review = await workflow('review-fix.yml');

  assert.match(review, /git merge-tree --write-tree "\$BASE_SHA" "\$HEAD_SHA"/);
  assert.match(review, /-f tested_base_sha="\$BASE_SHA" -f tested_head_sha="\$HEAD_SHA"/);
  assert.match(review, /\.testedResultTree==\$tree/);
  assert.match(review, /testedBaseSha:\$t\.testedBaseSha,testedHeadSha:\$t\.testedHeadSha,testedResultTree:\$t\.testedResultTree/);
});

test('publication provenance is immutable and authorizes the exact current head', async () => {
  const publication = await workflow('approval-automation.yml');
  const review = await workflow('review-fix.yml');
  const trusted = await workflow('trusted-merge.yml');

  assert.match(publication, /candidate-publication-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(publication, /publishedHeadSha:\$head,publicationWorkflow:\$workflow/);
  assert.match(review, /\.head\.sha == \$head/);
  assert.doesNotMatch(review, /startsWith\(github\.event\.pull_request\.head\.ref/);
  assert.match(trusted, /publication-provenance\.json/);
  assert.match(trusted, /\.publishedHeadSha==\$head/);
});

test('candidate execution, AI review, and contract creation use separate jobs', async () => {
  const review = await workflow('review-fix.yml');
  const candidate = review.slice(review.indexOf('  candidate-test:'), review.indexOf('  validate-test:'));
  const ai = review.slice(review.indexOf('  ai-review:'), review.indexOf('  merge-ready-contract:'));
  const contract = review.slice(review.indexOf('  merge-ready-contract:'));

  assert.match(candidate, /npm ci/);
  assert.match(candidate, /npm test/);
  assert.doesNotMatch(candidate, /openai-api-key:|GH_TOKEN:|SELF_IMPROVEMENT_MERGE_TOKEN/);
  assert.match(ai, /OPENAI_API_KEY/);
  assert.doesNotMatch(ai, /npm (?:ci|install|test)/);
  assert.doesNotMatch(contract, /actions\/checkout|openai\/codex-action|npm (?:ci|install|test)/);
});

test('Trusted Merge rejects a changed base and revalidates the CI run', async () => {
  const trusted = await workflow('trusted-merge.yml');

  assert.match(trusted, /current_base=.*git\/ref\/heads\/\$DEFAULT_BRANCH/);
  assert.match(trusted, /\[ "\$current_base" = "\$expected_base" \]/);
  assert.match(trusted, /actions\/runs\/\$ci_run_id/);
  assert.match(trusted, /workflow_dispatch\\tsuccess/);
});
