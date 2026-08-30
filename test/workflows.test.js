import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = (name) =>
  readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

test('automatic Review accepts only the existing repository dispatch payload', async () => {
  const review = await workflow('review-fix.yml');
  const authorize = review.slice(review.indexOf('  authorize:'), review.indexOf('  validate-test:'));

  assert.match(review, /repository_dispatch:\n    types: \[self-improvement-review\]/);
  assert.doesNotMatch(review, /workflow_dispatch:/);
  assert.match(review, /REVIEW_PR_NUMBER: \$\{\{ github\.event\.client_payload\.pr_number \}\}/);
  assert.match(review, /REVIEW_PUBLICATION_RUN_ID: \$\{\{ github\.event\.client_payload\.publication_run_id \}\}/);
  assert.match(review, /REVIEW_PUBLICATION_RUN_ATTEMPT: \$\{\{ github\.event\.client_payload\.publication_run_attempt \}\}/);
  assert.match(authorize, /PR_NUMBER: \$\{\{ env\.REVIEW_PR_NUMBER \}\}/);
  assert.match(authorize, /PUBLICATION_RUN_ID: \$\{\{ env\.REVIEW_PUBLICATION_RUN_ID \}\}/);
  assert.match(authorize, /PUBLICATION_RUN_ATTEMPT: \$\{\{ env\.REVIEW_PUBLICATION_RUN_ATTEMPT \}\}/);
  assert.match(authorize, /\.state == "open" and \.draft == false and \.head\.sha == \$head and \.base\.ref == \$branch/);
  assert.match(authorize, /index\("approved"\) != null/);
  assert.match(authorize, /\[ "\$actual" = "\$fingerprint" \]/);
});

test('removed recovery workflow and metadata stay absent', async () => {
  const { access } = await import('node:fs/promises');
  const workflows = await Promise.all([
    workflow('approval-automation.yml'),
    workflow('review-fix.yml'),
    workflow('trusted-merge.yml'),
  ]);

  await assert.rejects(access(new URL('../.github/workflows/review-recovery-dispatch.yml', import.meta.url)));
  for (const contents of workflows) {
    assert.doesNotMatch(contents, /review-retry|stale_recovery_|staleRecoveryCount/);
  }
  assert.doesNotMatch(workflows[2], /event_type=self-improvement-review/);
});

test('Review remains read-only and has no merge authority', async () => {
  const review = await workflow('review-fix.yml');

  assert.match(review, /permissions: \{\}/);
  assert.match(review, /allow-bot-users: github-actions\[bot\]/);
  assert.match(review, /permission-profile: ":read-only"/);
  assert.doesNotMatch(review, /SELF_IMPROVEMENT_MERGE_TOKEN|pulls\/[^\n]+\/merge|gh pr merge|git push/);
});

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

  assert.match(review, /git merge-tree --write-tree --messages "\$BASE_SHA" "\$HEAD_SHA"/);
  assert.match(review, /-f tested_base_sha="\$BASE_SHA" -f tested_head_sha="\$HEAD_SHA"/);
  assert.match(review, /ciWorkflowSourceSha:\$source,ciRunId:\$run/);
  assert.match(review, /testedBaseSha:\$t\.testedBaseSha,testedHeadSha:\$t\.testedHeadSha,testedResultTree:\$t\.testedResultTree/);
  assert.match(review, /ciWorkflowSourceSha:\$t\.ciWorkflowSourceSha/);
});

test('Review obtains exact merge objects and diagnoses every fail-closed merge-tree outcome', async () => {
  const review = await workflow('review-fix.yml');
  const validation = review.slice(review.indexOf('  validate-test:'), review.indexOf('  ai-review:'));

  assert.match(validation, /git cat-file -e "\$sha\^\{commit\}"/);
  assert.match(validation, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(validation, /GITHUB_SERVER_URL: \$\{\{ github\.server_url \}\}/);
  assert.match(validation, /printf 'x-access-token:%s' "\$GITHUB_TOKEN" \| base64 \| tr -d '\\n'/);
  assert.match(validation, /git -c "http\.\$\{GITHUB_SERVER_URL\}\/\.extraheader=AUTHORIZATION: basic \$auth_header"[\s\S]*?fetch --no-tags --no-recurse-submodules origin "\$sha"/);
  assert.doesNotMatch(validation, /git config|credential\.helper/);
  assert.match(validation, /required Git object missing: unable to fetch \$label commit \$sha/);
  assert.match(validation, /git merge-tree --write-tree --messages "\$BASE_SHA" "\$HEAD_SHA"/);
  assert.match(validation, /git diff --name-only "\$BASE_SHA" "\$HEAD_SHA" \| grep -E '\^\\\.github\/\(workflows\|actions\)\/'/);
  assert.match(validation, /actual merge conflict between exact base/);
  assert.match(validation, /git merge-tree invocation failure \(exit \$merge_status\)/);
  assert.match(validation, /\[ "\$merge_status" -eq 0 \].*result_tree.*\{40,64\}/s);
  assert.doesNotMatch(validation, /\.base\.sha|git (?:rebase|push)|gh pr update/);
});

test('Review hands its immutable MERGE_READY run to Trusted Merge by repository dispatch', async () => {
  const review = await workflow('review-fix.yml');
  const contract = review.slice(review.indexOf('  merge-ready-contract:'));
  const trusted = await workflow('trusted-merge.yml');

  assert.doesNotMatch(trusted, /workflow_run:/);
  assert.match(trusted, /repository_dispatch:\n    types: \[self-improvement-trusted-merge\]/);
  assert.match(contract, /contents: write/);
  assert.match(contract, /event_type=self-improvement-trusted-merge/);
  assert.match(contract, /client_payload\[review_run_id\]=\$GITHUB_RUN_ID/);
  assert.match(contract, /client_payload\[review_run_attempt\]=\$GITHUB_RUN_ATTEMPT/);
  assert.match(contract, /client_payload\[review_workflow_source_sha\]=\$GITHUB_SHA/);
  assert.match(contract, /reviewRunId:\$run,reviewRunAttempt:\$attempt,reviewWorkflowSourceSha:\$source/);
  assert.match(contract, /name: merge-ready-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-\$\{\{ needs\.authorize\.outputs\.pr \}\}-\$\{\{ needs\.authorize\.outputs\.head \}\}/);
  assert.doesNotMatch(review, /SELF_IMPROVEMENT_MERGE_TOKEN/);
});

test('Trusted Merge re-authenticates the dispatched Review run and exact artifact', async () => {
  const trusted = await workflow('trusted-merge.yml');

  assert.match(trusted, /actions\/runs\/\$REVIEW_RUN_ID\/attempts\/\$REVIEW_RUN_ATTEMPT/);
  assert.doesNotMatch(trusted, /actions\/runs\/\$REVIEW_RUN_ID"/);
  assert.match(trusted, /\.name == "Self-Improvement Review"/);
  assert.match(trusted, /\.path == "\.github\/workflows\/review-fix\.yml"/);
  assert.match(trusted, /\.event == "repository_dispatch"/);
  assert.match(trusted, /\.conclusion == "success"/);
  assert.match(trusted, /\.run_attempt == \$review_attempt/);
  assert.match(trusted, /\.head_sha == \$sha and \.head_branch == \$branch/);
  assert.match(trusted, /actions\/runs\/\$REVIEW_RUN_ID\/artifacts\?per_page=100/);
  assert.match(trusted, /artifact_pattern="\^merge-ready-\$REVIEW_RUN_ID-\$REVIEW_RUN_ATTEMPT-\[0-9\]\+-\[0-9a-f\]\{40\}\$"/);
  assert.match(trusted, /\.name \| test\(\$pattern\)/);
  assert.match(trusted, /length == 1 then \.\[0\]\.id else empty/);
  assert.doesNotMatch(trusted, /test\("\^merge-ready-\[0-9\]\+-\[0-9a-f\]\{40\}\$"\)/);
  assert.match(trusted, /\.reviewRunId == \$run and \.reviewRunAttempt == \$attempt/);
  assert.match(trusted, /\.reviewWorkflowSourceSha == \$source/);
});

test('stale after Review is obsolete and never dispatches recovery', async () => {
  const trusted = await workflow('trusted-merge.yml');
  const stale = trusted.slice(
    trusted.indexOf('# Never merge evidence tested against a stale implementation base.'),
    trusted.indexOf('# Build a commit with the exact tested result tree'),
  );

  assert.match(stale, /for snapshot_attempt in 1 2 3; do/);
  assert.match(stale, /if \[ "\$current_base" != "\$expected_base" \]; then/);
  assert.match(stale, /obsolete=true/);
  assert.match(stale, /exit 0/);
  assert.doesNotMatch(stale, /git push|commit-tree/);
  assert.match(trusted, /name: Mark terminal candidate obsolete/);
  assert.match(trusted, /--add-label obsolete/);
  assert.doesNotMatch(trusted, /event_type=self-improvement-review/);
});

test('Trusted Merge terminally obsoletes authenticated version-1 publications during rollout', async () => {
  const trusted = await workflow('trusted-merge.yml');
  const merge = trusted.slice(
    trusted.indexOf('- name: Validate trusted state and merge exact head'),
    trusted.indexOf('- name: Mark terminal candidate obsolete'),
  );
  const commonBinding = merge.indexOf("'(.version == 1 or .version == 2) and");
  const runBinding = merge.indexOf("'.head_sha == $sha and .head_branch == $ref'");
  const versionOne = merge.indexOf('if [ "$publication_version" = 1 ]; then');
  const obsolete = merge.indexOf("printf 'obsolete=true\\ncandidate=%s\\n'", versionOne);
  const versionTwo = merge.indexOf('[ "$publication_version" = 2 ]', versionOne);
  const mergeTokenAction = merge.indexOf('git push origin', versionTwo);

  assert.ok(commonBinding >= 0 && runBinding > commonBinding && versionOne > runBinding);
  assert.match(merge, /\.candidate==\$candidate and \.pullRequest==\$pr/);
  assert.match(merge, /\.publicationRunId==\$run and\n\s+\.publicationRunAttempt==\$attempt/);
  assert.ok(obsolete > versionOne && versionTwo > obsolete && mergeTokenAction > versionTwo);
  assert.match(merge.slice(versionOne, versionTwo), /authenticated v1/);
  assert.match(merge.slice(obsolete, versionTwo), /exit 0/);
  assert.doesNotMatch(merge.slice(versionOne, versionTwo), /implementationBaseSha|git push|gh api --method (?:PUT|POST|PATCH)/);
  assert.match(merge.slice(versionTwo), /\.implementationBaseSha == \$base/);
  assert.match(trusted, /if: steps\.merge\.outputs\.obsolete == 'true'/);
});

test('Trusted Merge obtains a coherent default-branch snapshot', async () => {
  const trusted = await workflow('trusted-merge.yml');
  const snapshot = trusted.indexOf('for snapshot_attempt in 1 2 3; do');
  const baseBefore = trusted.indexOf('base_before="$(gh api', snapshot);
  const refreshedPr = trusted.indexOf('pr="$(gh api "repos/$GH_REPO/pulls/$pr_number")"', baseBefore);
  const baseAfter = trusted.indexOf('base_after="$(gh api', refreshedPr);
  const staleCheck = trusted.indexOf('if [ "$current_base" != "$expected_base" ]; then', baseAfter);

  assert.ok(snapshot >= 0 && baseBefore > snapshot && refreshedPr > baseBefore && baseAfter > refreshedPr && staleCheck > baseAfter);
  assert.match(trusted.slice(baseAfter, staleCheck), /\[ "\$base_before" = "\$base_after" \]/);
});

test('Review rejects stale publications against the exact implementation base', async () => {
  const review = await workflow('review-fix.yml');
  const authorize = review.slice(review.indexOf('  authorize:'), review.indexOf('  validate-test:'));
  const provenanceBinding = authorize.indexOf("'(.version == 1 or .version == 2) and");
  const staleCheck = authorize.indexOf('if [ "$current_base" != "$implementation_base" ]; then');
  const obsoleteLabel = authorize.indexOf(
    'gh issue edit "$candidate" --repo "$GH_REPO" --add-label obsolete',
    staleCheck,
  );

  assert.match(authorize, /issues: write/);
  assert.match(authorize, /implementation_base="\$\(jq -r \.implementationBaseSha/);
  assert.match(authorize, /if \[ "\$current_base" != "\$implementation_base" \]; then/);
  assert.match(authorize, /Candidate is obsolete/);
  assert.match(authorize, /gh label create obsolete[^\n]*--repo "\$GH_REPO"/);
  assert.ok(provenanceBinding >= 0 && staleCheck > provenanceBinding && obsoleteLabel > staleCheck);
  assert.match(authorize.slice(staleCheck, obsoleteLabel), /Candidate is obsolete/);
  assert.match(authorize.slice(obsoleteLabel), /exit 1/);
  assert.match(authorize, /--arg head "\$published_head" --arg base "\$implementation_base"/);
  assert.doesNotMatch(authorize, /review-retry|recovery|git (?:rebase|push)|gh pr update/);
});

test('Review terminally obsoletes authenticated version-1 publications during rollout', async () => {
  const review = await workflow('review-fix.yml');
  const authorize = review.slice(review.indexOf('  authorize:'), review.indexOf('  validate-test:'));
  const commonBinding = authorize.indexOf("'(.version == 1 or .version == 2) and");
  const runBinding = authorize.indexOf("'.head_sha == $sha and .head_branch == $ref'");
  const versionOne = authorize.indexOf('if [ "$version" = 1 ]; then');
  const obsolete = authorize.indexOf('gh issue edit "$candidate" --repo "$GH_REPO" --add-label obsolete', versionOne);
  const versionTwo = authorize.indexOf('[ "$version" = 2 ]', versionOne);

  assert.ok(commonBinding >= 0 && runBinding > commonBinding && versionOne > runBinding);
  assert.match(authorize, /\.pullRequest == \$pr and \.publicationRunId == \$run/);
  assert.match(authorize, /\.publicationRunAttempt == \$attempt and \.publicationWorkflow == \$workflow/);
  assert.match(authorize.slice(versionOne, versionTwo), /authenticated version 1 publication/);
  assert.ok(obsolete > versionOne && versionTwo > obsolete);
  assert.match(authorize.slice(obsolete, versionTwo), /exit 1/);
  assert.match(authorize.slice(versionTwo), /implementationBaseSha/);
  assert.doesNotMatch(authorize.slice(versionOne, versionTwo), /implementationBaseSha|review-retry|recovery|git (?:rebase|push)|gh pr update/);
});

test('fresh Trusted Merge path retains atomic compare-and-swap publication', async () => {
  const trusted = await workflow('trusted-merge.yml');

  assert.match(trusted, /echo 'obsolete=false' >> "\$GITHUB_OUTPUT"/);
  assert.match(trusted, /actual_tree=.*merge-tree --write-tree "\$expected_base" "\$expected_head"/);
  assert.match(trusted, /\[ "\$actual_tree" = "\$expected_tree" \]/);
  assert.match(trusted, /--force-with-lease="refs\/heads\/\$DEFAULT_BRANCH:\$expected_base"/);
});

test('Trusted Merge diagnoses each fail-closed gate and tolerates delayed merged projection', async () => {
  const trusted = await workflow('trusted-merge.yml');
  const merge = trusted.slice(
    trusted.indexOf('- name: Validate trusted state and merge exact head'),
    trusted.indexOf('- name: Mark terminal candidate obsolete'),
  );
  const phases = [
    'merge-ready-contract',
    'contract-review-binding',
    'publication-provenance',
    'candidate-fingerprint-binding',
    'pull-request-binding',
    'ci-run-validation',
    'protected-path-validation',
    'current-base-snapshot',
    'pull-request-mergeability',
    'exact-object-fetch',
    'prospective-tree-recalculation',
    'merge-commit-construction',
    'atomic-default-branch-push',
    'post-push-pr-merged-confirmation',
  ];

  assert.match(merge, /set -Eeuo pipefail/);
  assert.match(merge, /Trusted Merge failure::phase=%s line=%s command=%q exit=%s/);
  for (const phase of phases) assert.match(merge, new RegExp(`phase=${phase}`));
  assert.match(merge, /for merged_attempt in \$\(seq 1 10\); do/);
  assert.match(merge, /\[ "\$pr_merged" = true \]/);
  assert.doesNotMatch(merge, /npm (?:ci|install|test)|git rebase|gh pr update|self-improvement-review/);
});

test('Trusted Merge authenticates prospective CI by stable execution metadata, not display name', async () => {
  const trusted = await workflow('trusted-merge.yml');
  const validation = trusted.slice(
    trusted.indexOf('phase=ci-run-validation'),
    trusted.indexOf('phase=protected-path-validation'),
  );

  assert.match(validation, /actions\/runs\/\$ci_run_id/);
  assert.match(validation, /\.event == "workflow_dispatch"/);
  assert.match(validation, /\.conclusion == "success"/);
  assert.match(validation, /\.path == "\.github\/workflows\/ci\.yml"/);
  assert.match(validation, /\.head_branch == \$branch/);
  assert.match(validation, /\.head_sha == \$source/);
  assert.match(validation, /\.run_attempt == 1/);
  assert.doesNotMatch(validation, /\.name\s*==|\.display_title\s*==|run-name/);
});

test('Trusted Merge creates ON_HOLD before applying it', async () => {
  const trusted = await workflow('trusted-merge.yml');
  const hold = trusted.slice(trusted.indexOf('- name: Put a changed or unverifiable candidate ON_HOLD'));

  assert.match(hold, /gh label create ON_HOLD[^\n]*--repo "\$GH_REPO"/);
  assert.match(hold, /--description 'Automated merge is paused pending investigation' --force/);
  assert.match(hold, /gh issue edit "\$candidate"[^\n]*--add-label ON_HOLD/);
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

test('Review learns nested CI source from the nonce-matched run without a ref pre-read race', async () => {
  const review = await workflow('review-fix.yml');
  const validation = review.slice(review.indexOf('  validate-test:'), review.indexOf('  ai-review:'));

  assert.doesNotMatch(validation, /git\/ref\/heads\/\$BASE_BRANCH|dispatch_ref_sha/);
  assert.match(validation, /\(\.head_sha \| test\("\^\[0-9a-f\]\{40\}\$"\)\)/);
  assert.match(validation, /ci_workflow_source_sha="\$\(jq -r \.head_sha <<<"\$run"\)"/);
  assert.match(validation, /ciWorkflowSourceSha:\$source/);
  assert.doesNotMatch(validation, /\.head_sha == \$base/);

  // The historical base/head remain immutable workflow inputs authenticated by
  // the exact run title and one-time nonce even when the dispatch ref has moved.
  assert.match(validation, /title="prospective-merge-\$BASE_SHA-\$HEAD_SHA-\$nonce"/);
  assert.match(validation, /-f tested_base_sha="\$BASE_SHA" -f tested_head_sha="\$HEAD_SHA" -f contract_nonce="\$nonce"/);
  assert.match(validation, /\.event == "workflow_dispatch" and \.workflow_id == \$workflow_id and \.path == \$path/);
  assert.match(validation, /\.display_title == \$title and \.head_branch == \$branch/);
  assert.match(validation, /\.run_attempt == 1 and \.created_at >= \$since/);
  assert.match(validation, /\.actor\.login == \$actor and \.actor\.id == \$actor_id/);
  assert.match(validation, /\.triggering_actor\.login == \$actor and \.triggering_actor\.id == \$actor_id/);
  assert.match(validation, /Ambiguous CI dispatch provenance/);
});

test('repository dispatch CI provenance remains bound to the outer trusted actor', async () => {
  const review = await workflow('review-fix.yml');
  const validation = review.slice(review.indexOf('  validate-test:'), review.indexOf('  ai-review:'));

  assert.match(validation, /EXPECTED_ACTOR: \$\{\{ github\.actor \}\}/);
  assert.match(validation, /EXPECTED_ACTOR_ID: \$\{\{ github\.actor_id \}\}/);
  assert.match(validation, /\.actor\.login == \$actor and \.actor\.id == \$actor_id/);
  assert.match(validation, /\.triggering_actor\.login == \$actor and \.triggering_actor\.id == \$actor_id/);
  assert.doesNotMatch(validation, /REVIEW_EVENT_NAME|github-actions\[bot\]|41898282/);
});

test('publication provenance is immutable and authorizes the exact current head', async () => {
  const publication = await workflow('approval-automation.yml');
  const review = await workflow('review-fix.yml');
  const trusted = await workflow('trusted-merge.yml');

  assert.match(publication, /candidate-publication-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(publication, /IMPLEMENTATION_BASE_SHA: \$\{\{ needs\.implement\.outputs\.base_sha \}\}/);
  assert.match(publication, /implementationBaseSha:\$implementationBase,publishedHeadSha:\$head/);
  assert.match(publication, /publishedHeadSha:\$head,publicationWorkflow:\$workflow/);
  assert.match(review, /\.implementationBaseSha \| test\("\^\[0-9a-f\]\{40\}\$"\)/);
  assert.match(trusted, /\.publishedHeadSha==\$head/);
  assert.match(trusted, /\.implementationBaseSha == \$base/);
  assert.match(review, /\.head\.sha == \$head/);
  assert.doesNotMatch(review, /startsWith\(github\.event\.pull_request\.head\.ref/);
  assert.match(trusted, /publication-provenance\.json/);
  assert.match(trusted, /\.publishedHeadSha==\$head/);
});

test('exact publication attempts remain authoritative downstream after a rerun', async () => {
  const review = await workflow('review-fix.yml');
  const trusted = await workflow('trusted-merge.yml');

  for (const contents of [review, trusted]) {
    assert.doesNotMatch(contents, /\.run_attempt == \$attempt/);
    assert.match(contents, /candidate-publication-\$[A-Za-z_]+-\$[A-Za-z_]+/);
    assert.match(contents, /\.expired == false/);
    assert.match(contents, /test "\$\(wc -l <<<"\$[A-Za-z_]+"\)" -eq 1/);
    assert.match(contents, /\.publicationRunAttempt ?== ?\$attempt/);
    assert.match(contents, /\.publicationWorkflow ?== ?\$workflow/);
    assert.match(contents, /\.head_sha == \$sha and \.head_branch == \$ref/);
  }

  assert.match(review, /publicationRunAttempt:\$publicationRunAttempt/);
  assert.match(trusted, /actions\/runs\/\$publication_run_id\/artifacts\?per_page=100/);
});

test('publication workflow authority requires the exact full branch ref', async () => {
  const review = await workflow('review-fix.yml');
  const trusted = await workflow('trusted-merge.yml');
  const repository = 'owner/repository';
  const branch = 'main';
  const expected = `${repository}/.github/workflows/approval-automation.yml@refs/heads/${branch}`;

  assert.equal(expected, 'owner/repository/.github/workflows/approval-automation.yml@refs/heads/main');
  assert.notEqual(expected, 'owner/repository/.github/workflows/approval-automation.yml@main');
  assert.notEqual(expected, 'owner/repository/.github/workflows/approval-automation.yml@refs/heads/release');

  assert.match(review, /expected_workflow="\$GITHUB_REPOSITORY\/.github\/workflows\/approval-automation\.yml@refs\/heads\/\$source_branch"/);
  assert.match(trusted, /expected_publication_workflow="\$GH_REPO\/.github\/workflows\/approval-automation\.yml@refs\/heads\/\$publication_source_branch"/);
  for (const contents of [review, trusted]) {
    assert.match(contents, /\.publicationWorkflow ?== ?\$workflow/);
    assert.doesNotMatch(contents, /publicationWorkflow[^\n]*starts(?:with|With)|publicationWorkflow[^\n]*contains/);
  }
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

test('trusted runner caps and embeds review data, then removes it before AI review', async () => {
  const review = await workflow('review-fix.yml');
  const ai = review.slice(review.indexOf('  ai-review:'), review.indexOf('  merge-ready-contract:'));

  assert.match(ai, /path: candidate-source/);
  assert.doesNotMatch(ai, /diff --binary|candidate\.diff/);
  assert.match(ai, /prompt_cap = 60 \* 1024/);
  assert.match(ai, /requirements_cap = 32 \* 1024/);
  assert.match(ai, /def git_limited\(limit, \*args\)/);
  assert.match(ai, /source\.read\(requirements_cap \+ 1\)/);
  assert.match(ai, /requirements_oversized = len\(requirements\) > requirements_cap/);
  assert.match(ai, /data\.decode\("utf-8"\)/);
  assert.match(ai, /if b"\\0" in data:/);
  assert.doesNotMatch(ai, /decode\("utf-8", "replace"\)/);
  assert.match(ai, /review_input_incomplete = requirements_oversized or requirements_invalid_utf8/);
  assert.match(ai, /binary or file_truncated or patch_invalid_utf8/);
  assert.match(ai, /16 \* 1024, "--literal-pathspecs", "diff"/);
  assert.match(ai, /diff content for \{path!r\} exceeded 16384 bytes/);
  assert.match(ai, /--no-ext-diff.*--no-textconv.*--no-renames/s);
  assert.match(ai, /name_fields\[-1\] != b""/);
  assert.match(ai, /len\(name_fields\) % 2/);
  assert.match(ai, /status, path = name_fields\[offset:offset \+ 2\]/);
  assert.match(ai, /binary=\{'yes' if binary else 'no'\}/);
  assert.match(ai, /patch, file_truncated = \(b"", False\) if binary else git_limited/);
  assert.match(ai, /review_input_incomplete \|= binary or file_truncated/);
  assert.match(ai, /\[TRUNCATED: text diff exceeded the deterministic 61440-byte prompt cap/);
  assert.match(ai, /Omitted \{len\(omitted\)\} file\(s\)/);
  assert.match(ai, /If truncation prevents a meaningful review, fail closed/);
  assert.match(ai, /rm -rf candidate-source/);
  assert.match(ai, /test ! -e candidate-source/);
  assert.match(ai, /open\("trusted-review-input\/candidate-requirements\.md", "rb"\)/);
  assert.match(ai, /REVIEW_PROMPT<<%s/);
  assert.match(ai, /if \[ "\$review_input_incomplete" = false \]; then[\s\S]*REVIEW_PROMPT<<%s/);
  assert.match(ai, />> "\$GITHUB_ENV"/);
  assert.doesNotMatch(ai, /GITHUB_OUTPUT/);
  assert.match(ai, /rm -rf trusted-review-input/);
  assert.match(ai, /test ! -e trusted-review-input/);
  assert.match(ai, /test ! -e "\$RUNNER_TEMP\/review-prompt\.txt"/);
  assert.match(ai, /prompt: \$\{\{ env\.REVIEW_PROMPT \}\}/);
  assert.match(ai, /boundary = "REVIEW_DATA_" \+ secrets\.token_hex\(32\)/);
  assert.match(ai, /boundary not in diff_payload and boundary not in requirements_payload/);
  assert.match(ai, /if: env\.REVIEW_INPUT_INCOMPLETE != 'true'\n\s+uses: openai\/codex-action@v1/);
  assert.doesNotMatch(ai, /if: env\.REVIEW_INPUT_INCOMPLETE == 'true'/);
  assert.match(ai, /test -f "\$RUNNER_TEMP\/final-review\.json"/);
  const action = ai.slice(ai.indexOf('uses: openai/codex-action@v1'));
  assert.doesNotMatch(action, /candidate\.diff|candidate-requirements\.md|working-directory:/);
});

test('AI review allows only the GitHub Actions bot actor', async () => {
  const review = await workflow('review-fix.yml');
  const ai = review.slice(review.indexOf('  ai-review:'), review.indexOf('  merge-ready-contract:'));

  assert.match(ai, /allow-bot-users: github-actions\[bot\]/);
  assert.doesNotMatch(ai, /allow-bots: true/);
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

test('Trusted Merge detects a changed base after authenticating the CI run', async () => {
  const trusted = await workflow('trusted-merge.yml');

  assert.match(trusted, /base_before=.*git\/ref\/heads\/\$DEFAULT_BRANCH/);
  assert.match(trusted, /base_after=.*git\/ref\/heads\/\$DEFAULT_BRANCH/);
  assert.match(trusted, /if \[ "\$current_base" != "\$expected_base" \]; then/);
  assert.match(trusted, /actions\/runs\/\$ci_run_id/);
  assert.match(trusted, /\.head_sha == \$source/);
  assert.doesNotMatch(trusted, /\.head_sha == \$expected_base/);
  assert.match(trusted, /\.path == "\.github\/workflows\/ci\.yml"/);
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

  assert.match(review, /This is review-only:\n\s+do not propose or apply an automated fix/);
  assert.match(review, /Return only the result required by the output schema/);
  assert.doesNotMatch(review, /reviewFixAttempts/);
  assert.doesNotMatch(trusted, /\.reviewFixAttempts/);
});

test('AI review uses an exact structured schema and deterministic PASS validation', async () => {
  const review = await workflow('review-fix.yml');
  const ai = review.slice(review.indexOf('  ai-review:'), review.indexOf('  merge-ready-contract:'));

  assert.match(ai, /output-file: \$\{\{ runner\.temp \}\}\/final-review\.json/);
  assert.match(ai, /output-schema: \|/);
  assert.match(ai, /"additionalProperties": false/);
  assert.match(ai, /"enum": \["PASS", "NON_PASS"\]/);
  assert.match(ai, /"required": \["verdict", "findings"\]/);
  assert.match(ai, /\(keys == \["findings", "verdict"\]\)/);
  assert.match(ai, /all\(\.findings\[\]; type == "string"\)/);
  assert.match(ai, /\.verdict == "PASS"/);
  assert.doesNotMatch(ai, /awk|VERDICT:|last_nonempty|verdict_count/);
});
