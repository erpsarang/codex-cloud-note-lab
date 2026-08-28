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
  assert.match(review, /\.testedResultTree == \$tree/);
  assert.match(review, /testedBaseSha:\$base,testedHeadSha:\$head,testedResultTree:\$resultTree/);
});

test('Trusted Merge rejects a changed base and revalidates the CI run', async () => {
  const trusted = await workflow('trusted-merge.yml');

  assert.match(trusted, /current_base=.*git\/ref\/heads\/\$DEFAULT_BRANCH/);
  assert.match(trusted, /\[ "\$current_base" = "\$expected_base" \]/);
  assert.match(trusted, /actions\/runs\/\$ci_run_id/);
  assert.match(trusted, /workflow_dispatch\\tsuccess/);
});
