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
  assert.match(ci, /untrusted execution workflow deliberately publishes no evidence artifact/);
  assert.doesNotMatch(ci, /upload-artifact|prospective-merge\.json/);
});

test('Review binds MERGE_READY to the successful merge CI run', async () => {
  const review = await workflow('review-fix.yml');

  assert.match(review, /git merge-tree --write-tree "\$BASE_SHA" "\$HEAD_SHA"/);
  assert.match(review, /-f tested_base_sha="\$BASE_SHA" -f tested_head_sha="\$HEAD_SHA"/);
  assert.match(review, /testedResultTree:\$tree,ciRunId:\$run/);
  assert.match(review, /testedBaseSha:\$t\.testedBaseSha,testedHeadSha:\$t\.testedHeadSha,testedResultTree:\$t\.testedResultTree/);
});

test('Review accepts only the exact CI run created by its trusted dispatch', async () => {
  const ci = await workflow('ci.yml');
  const review = await workflow('review-fix.yml');

  assert.match(ci, /run-name: prospective-merge-\$\{\{ inputs\.tested_base_sha[^\n]+inputs\.tested_head_sha[^\n]+inputs\.contract_nonce/);
  assert.match(review, /nonce="\$\(openssl rand -hex 32\)"/);
  assert.match(review, /title="prospective-merge-\$BASE_SHA-\$HEAD_SHA-\$nonce"/);
  assert.match(review, /Ambiguous CI dispatch provenance/);
  assert.match(review, /\.workflow_id == \$workflow_id and \.path == \$path/);
  assert.match(review, /\.actor\.login == \$actor and \.actor\.id == \$actor_id/);
  assert.match(review, /\.triggering_actor\.login == \$actor and \.triggering_actor\.id == \$actor_id/);
  assert.match(review, /\.created_at >= \$since/);
  assert.doesNotMatch(review, /if length == 1 then \.\[0\] else empty end/);
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

test('candidate execution, AI review, and contract creation use separate workflow or jobs', async () => {
  const ci = await workflow('ci.yml');
  const review = await workflow('review-fix.yml');
  const ai = review.slice(review.indexOf('  ai-review:'), review.indexOf('  merge-ready-contract:'));
  const contract = review.slice(review.indexOf('  merge-ready-contract:'));

  assert.match(ci, /npm test/);
  assert.doesNotMatch(ci, /openai-api-key:|GH_TOKEN:|SELF_IMPROVEMENT_MERGE_TOKEN|upload-artifact/);
  assert.match(ai, /OPENAI_API_KEY/);
  assert.doesNotMatch(ai, /npm (?:ci|install|test)/);
  assert.doesNotMatch(contract, /actions\/checkout|openai\/codex-action|npm (?:ci|install|test)/);
});

test('workflow identity uses the REST path and validates run source identity', async () => {
  for (const name of ['review-fix.yml', 'trusted-merge.yml']) {
    const contents = await workflow(name);
    assert.match(contents, /\.path == \$workflow/);
    assert.doesNotMatch(contents, /--arg workflow "\$GITHUB_REPOSITORY\/\.github\/workflows\/approval-automation\.yml@"[\s\S]{0,160}\.path/);
    assert.match(contents, /\.head_sha == \$sha and \.head_branch == \$ref/);
  }
});

test('contract downloads only exact trusted evidence artifacts without merging namespaces', async () => {
  const review = await workflow('review-fix.yml');
  const contract = review.slice(review.indexOf('  merge-ready-contract:'));
  assert.match(contract, /name: authorized-input-/);
  assert.match(contract, /name: validated-test-/);
  assert.match(contract, /name: validated-review-/);
  assert.doesNotMatch(contract, /pattern:|merge-multiple:/);
});

test('an existing unproven implementation branch fails closed', async () => {
  const publication = await workflow('approval-automation.yml');
  assert.match(publication, /publication provenance.*중단합니다/);
  assert.doesNotMatch(publication, /missing pull request will be recovered/);
});

test('Trusted Merge rejects a changed base and revalidates the CI run', async () => {
  const trusted = await workflow('trusted-merge.yml');

  assert.match(trusted, /current_base=.*git\/ref\/heads\/\$DEFAULT_BRANCH/);
  assert.match(trusted, /\[ "\$current_base" = "\$expected_base" \]/);
  assert.match(trusted, /actions\/runs\/\$ci_run_id/);
  assert.match(trusted, /workflow_dispatch\\tsuccess/);
});

test('Trusted Merge atomically binds the tested base, head, and result tree', async () => {
  const trusted = await workflow('trusted-merge.yml');

  assert.match(trusted, /expected_tree=.*testedResultTree/);
  assert.match(trusted, /git merge-tree --write-tree "\$expected_base" "\$expected_head"/);
  assert.match(trusted, /\[ "\$actual_tree" = "\$expected_tree" \]/);
  assert.match(trusted, /commit-tree "\$expected_tree" -p "\$expected_base" -p "\$expected_head"/);
  assert.match(trusted, /--force-with-lease="refs\/heads\/\$DEFAULT_BRANCH:\$expected_base"/);
  assert.doesNotMatch(trusted, /pulls\/\$pr_number\/merge/);
});

test('AI stage is review-only and exposes no automated fix contract', async () => {
  const review = await workflow('review-fix.yml');
  const trusted = await workflow('trusted-merge.yml');

  assert.match(review, /review-only: do not propose or apply an automated fix/);
  assert.match(review, /VERDICT: PASS or VERDICT: NON_PASS/);
  assert.doesNotMatch(review, /reviewFixAttempts/);
  assert.doesNotMatch(trusted, /\.reviewFixAttempts/);
});

test('AI review accepts only one verdict with PASS as the final nonempty line', async () => {
  const review = await workflow('review-fix.yml');

  assert.match(review, /\^\[\[:space:\]\]\*VERDICT:/);
  assert.match(review, /verdict_count != 1/);
  assert.match(review, /last_nonempty != "VERDICT: PASS"/);
  assert.doesNotMatch(review, /grep -Fx 'VERDICT: PASS'/);
});
