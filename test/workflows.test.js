import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  assert.match(authorize, /\.state == "open" and \.head\.sha == \$head/);
  assert.match(authorize, /index\("approved"\) != null/);
  assert.match(authorize, /\[ "\$actual" = "\$fingerprint" \]/);
});

test('recovery uses a trusted issues event and discovers the publication coordinates', async () => {
  const dispatcher = await workflow('review-recovery-dispatch.yml');

  assert.match(dispatcher, /issues:\n    types: \[labeled\]/);
  assert.match(dispatcher, /github\.event\.label\.name == 'review-retry'/);
  assert.match(dispatcher, /EVENT_LABEL: \$\{\{ github\.event\.label\.name \}\}/);
  assert.match(dispatcher, /\.state == "open"/);
  assert.match(dispatcher, /index\("approved"\) != null/);
  assert.match(dispatcher, /index\("review-retry"\) != null/);
  assert.match(dispatcher, /codex\/self-improvement-\$CANDIDATE/);
  assert.match(dispatcher, /self-improvement-candidate:\$CANDIDATE/);
  assert.match(dispatcher, /candidate-publication-\$run_id-\$artifact_attempt/);
  assert.match(dispatcher, /\.publicationRunId == \$run/);
  assert.match(dispatcher, /\.publishedHeadSha == \$head/);
  assert.match(dispatcher, /\.requirementsFingerprint == \$fingerprint/);
  assert.match(dispatcher, /current_pr=.*pulls\/\$pr_number/);
  assert.match(dispatcher, /event_type=self-improvement-review/);
  assert.match(dispatcher, /permissions:\n      actions: read\n      contents: write\n      issues: read\n      pull-requests: read/);
  assert.doesNotMatch(dispatcher, /actions\/checkout|OPENAI_API_KEY|secrets\.|SELF_IMPROVEMENT_MERGE_TOKEN|pulls\/[^\n]+\/merge|gh pr merge|git push/);
});

test('no recovery workflow is branch-selectable or executes candidate code', async () => {
  const dispatcher = await workflow('review-recovery-dispatch.yml');
  const review = await workflow('review-fix.yml');

  assert.doesNotMatch(dispatcher, /workflow_dispatch:/);
  assert.doesNotMatch(review, /workflow_dispatch:/);
  assert.doesNotMatch(dispatcher, /actions\/checkout|npm (?:ci|install|test)|openai\/codex-action/);
  assert.doesNotMatch(dispatcher, /secrets\.|OPENAI_API_KEY|MERGE_TOKEN/);
  assert.match(dispatcher, /actions: read/);
  assert.match(dispatcher, /issues: read/);
  assert.match(dispatcher, /pull-requests: read/);
  assert.match(dispatcher, /contents: write/);
});

test('recovery searches retained artifacts from every publication run attempt', async () => {
  const dispatcher = await workflow('review-recovery-dispatch.yml');

  assert.match(dispatcher, /actions\/runs\/\$run_id\/artifacts\?per_page=100/);
  assert.match(dispatcher, /\.expired == false/);
  assert.match(dispatcher, /artifact_attempt="\$\{artifact_name#candidate-publication-\$run_id-\}"/);
  assert.match(dispatcher, /"candidate-publication-\$run_id-\$artifact_attempt"/);
  assert.match(dispatcher, /--argjson attempt "\$artifact_attempt"/);
  assert.match(dispatcher, /\.publicationRunAttempt == \$attempt/);
  assert.match(dispatcher, /found="\$run_id:\$artifact_attempt"/);
  assert.doesNotMatch(dispatcher, /artifact_name="candidate-publication-\$run_id-\$run_attempt"/);
  assert.match(dispatcher, /Ambiguous publication provenance/);
  assert.match(dispatcher, /No retained immutable publication artifact matches/);
  assert.match(dispatcher, /artifact retention period; it is not bypassed/);
});

test('Review recovery preserves the read-only boundary and has no merge authority', async () => {
  const review = await workflow('review-fix.yml');

  assert.match(review, /permissions: \{\}/);
  assert.match(review, /allow-bot-users: github-actions\[bot\]/);
  assert.match(review, /permission-profile: ":read-only"/);
  assert.doesNotMatch(review, /allow-bots: true/);
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

  assert.match(review, /git merge-tree --write-tree "\$BASE_SHA" "\$HEAD_SHA"/);
  assert.match(review, /-f tested_base_sha="\$BASE_SHA" -f tested_head_sha="\$HEAD_SHA"/);
  assert.match(review, /ciWorkflowSourceSha:\$source,ciRunId:\$run/);
  assert.match(review, /testedBaseSha:\$t\.testedBaseSha,testedHeadSha:\$t\.testedHeadSha,testedResultTree:\$t\.testedResultTree/);
  assert.match(review, /ciWorkflowSourceSha:\$t\.ciWorkflowSourceSha/);
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

test('recovery learns nested CI source from the nonce-matched run without a ref pre-read race', async () => {
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
  assert.match(publication, /publishedHeadSha:\$head,publicationWorkflow:\$workflow/);
  assert.match(review, /\.head\.sha == \$head/);
  assert.doesNotMatch(review, /startsWith\(github\.event\.pull_request\.head\.ref/);
  assert.match(trusted, /publication-provenance\.json/);
  assert.match(trusted, /\.publishedHeadSha==\$head/);
});

test('recovered publication attempts remain authoritative downstream after a rerun', async () => {
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
  const recovery = await workflow('review-recovery-dispatch.yml');
  const trusted = await workflow('trusted-merge.yml');
  const repository = 'owner/repository';
  const branch = 'main';
  const expected = `${repository}/.github/workflows/approval-automation.yml@refs/heads/${branch}`;

  assert.equal(expected, 'owner/repository/.github/workflows/approval-automation.yml@refs/heads/main');
  assert.notEqual(expected, 'owner/repository/.github/workflows/approval-automation.yml@main');
  assert.notEqual(expected, 'owner/repository/.github/workflows/approval-automation.yml@refs/heads/release');

  assert.match(review, /expected_workflow="\$GITHUB_REPOSITORY\/.github\/workflows\/approval-automation\.yml@refs\/heads\/\$source_branch"/);
  assert.match(recovery, /expected_workflow="\$GH_REPO\/.github\/workflows\/approval-automation\.yml@refs\/heads\/\$DEFAULT_BRANCH"/);
  assert.match(trusted, /expected_publication_workflow="\$GH_REPO\/.github\/workflows\/approval-automation\.yml@refs\/heads\/\$publication_source_branch"/);
  for (const contents of [review, recovery, trusted]) {
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
  assert.match(ai, /16 \* 1024, "--literal-pathspecs", "diff"/);
  assert.match(ai, /diff content for \{path!r\} exceeded 16384 bytes/);
  assert.match(ai, /--no-ext-diff.*--no-textconv.*--no-renames/s);
  assert.match(ai, /name_fields\[-1\] != b""/);
  assert.match(ai, /len\(name_fields\) % 2/);
  assert.match(ai, /status, path = name_fields\[offset:offset \+ 2\]/);
  assert.match(ai, /binary=\{'yes' if binary else 'no'\}/);
  assert.match(ai, /patch, file_truncated = \(b"", False\) if binary else git_limited/);
  assert.match(ai, /\[TRUNCATED: text diff exceeded the deterministic 61440-byte prompt cap/);
  assert.match(ai, /Omitted \{len\(omitted\)\} file\(s\)/);
  assert.match(ai, /If truncation\n\s+prevents a meaningful review, fail closed/);
  assert.match(ai, /rm -rf candidate-source/);
  assert.match(ai, /test ! -e candidate-source/);
  assert.match(ai, /open\("trusted-review-input\/candidate-requirements\.md", "rb"\)/);
  assert.match(ai, /REVIEW_PROMPT<<%s/);
  assert.match(ai, />> "\$GITHUB_ENV"/);
  assert.doesNotMatch(ai, /GITHUB_OUTPUT/);
  assert.match(ai, /rm -rf trusted-review-input/);
  assert.match(ai, /test ! -e trusted-review-input/);
  assert.match(ai, /test ! -e "\$RUNNER_TEMP\/review-prompt\.txt"/);
  assert.match(ai, /prompt: \$\{\{ env\.REVIEW_PROMPT \}\}/);
  assert.match(ai, /if: env\.REVIEW_REQUIREMENTS_OVERSIZED != 'true'\n\s+uses: openai\/codex-action@v1/);
  assert.match(ai, /if: env\.REVIEW_REQUIREMENTS_OVERSIZED == 'true'\n\s+run: printf '%s\\n' 'VERDICT: NON_PASS'/);
  const action = ai.slice(ai.indexOf('uses: openai/codex-action@v1'));
  assert.doesNotMatch(action, /candidate\.diff|candidate-requirements\.md|working-directory:/);
});

test('oversized approved requirements deterministically bypass AI and fail closed', async () => {
  const review = await workflow('review-fix.yml');
  const ai = review.slice(review.indexOf('  ai-review:'), review.indexOf('  merge-ready-contract:'));
  const python = review.match(/          python3 - <<'PY'\n([\s\S]*?)\n          PY/)[1]
    .split('\n').map((line) => line.slice(10)).join('\n');
  const fixture = await mkdtemp(join(tmpdir(), 'review-oversized-requirements-'));
  const candidate = join(fixture, 'candidate-source');
  const trusted = join(fixture, 'trusted-review-input');

  assert.match(ai, /REVIEW_REQUIREMENTS_OVERSIZED=%s/);
  assert.match(ai, /"true\\n" if requirements_oversized else "false\\n"/);
  assert.match(ai, /AI review only \(fail on every non-PASS verdict\)\n\s+if: env\.REVIEW_REQUIREMENTS_OVERSIZED != 'true'/);
  assert.match(ai, /Fail closed when approved requirements exceed the review limit\n\s+if: env\.REVIEW_REQUIREMENTS_OVERSIZED == 'true'/);
  assert.match(ai, /'VERDICT: NON_PASS' > "\$RUNNER_TEMP\/final-review\.md"/);
  assert.match(ai, /last_nonempty != "VERDICT: PASS"/);

  try {
    await mkdir(candidate);
    await mkdir(trusted);
    const run = (...args) => spawnSync('git', args, { cwd: candidate, encoding: 'utf8' });
    assert.equal(run('init', '-q').status, 0);
    assert.equal(run('config', 'user.name', 'Regression Test').status, 0);
    assert.equal(run('config', 'user.email', 'test@example.invalid').status, 0);
    await writeFile(join(candidate, 'baseline.txt'), 'baseline\n');
    assert.equal(run('add', '.').status, 0);
    assert.equal(run('commit', '-qm', 'base').status, 0);
    const revision = run('rev-parse', 'HEAD').stdout.trim();
    await writeFile(join(trusted, 'candidate-requirements.md'), Buffer.alloc(32 * 1024 + 1, 65));

    const result = spawnSync('python3', ['-c', python], {
      cwd: fixture,
      encoding: 'utf8',
      env: { ...process.env, BASE_SHA: revision, HEAD_SHA: revision, RUNNER_TEMP: fixture },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(fixture, 'requirements-oversized'), 'utf8'), 'true\n');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('trusted prompt parses modified, added, deleted, multiple, binary, and empty diffs', async () => {
  const review = await workflow('review-fix.yml');
  const python = review.match(/          python3 - <<'PY'\n([\s\S]*?)\n          PY/)[1]
    .split('\n').map((line) => line.slice(10)).join('\n');
  const fixture = await mkdtemp(join(tmpdir(), 'review-name-status-'));
  const candidate = join(fixture, 'candidate-source');
  const trusted = join(fixture, 'trusted-review-input');
  const run = (...args) => {
    const result = spawnSync('git', args, { cwd: candidate, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };

  try {
    await mkdir(candidate);
    await mkdir(trusted);
    run('init', '-q');
    run('config', 'user.name', 'Regression Test');
    run('config', 'user.email', 'test@example.invalid');
    await writeFile(join(candidate, 'modified.txt'), 'before\n');
    await writeFile(join(candidate, 'deleted.txt'), 'deleted\n');
    run('add', '.');
    run('commit', '-qm', 'base');
    const base = run('rev-parse', 'HEAD');
    await writeFile(join(candidate, 'modified.txt'), 'after\n');
    await writeFile(join(candidate, 'added.txt'), 'added\n');
    await writeFile(join(candidate, 'binary.dat'), Buffer.from([0, 1, 2, 3]));
    await rm(join(candidate, 'deleted.txt'));
    run('add', '-A');
    run('commit', '-qm', 'head');
    const head = run('rev-parse', 'HEAD');
    await writeFile(join(trusted, 'candidate-requirements.md'), 'Review every file.\n');

    const result = spawnSync('python3', ['-c', python], {
      cwd: fixture,
      encoding: 'utf8',
      env: { ...process.env, BASE_SHA: base, HEAD_SHA: head, RUNNER_TEMP: fixture },
    });
    assert.equal(result.status, 0, result.stderr);
    const prompt = await readFile(join(fixture, 'review-prompt.txt'), 'utf8');
    assert.match(prompt, /modified\.txt.*change=M.*binary=no/);
    assert.match(prompt, /added\.txt.*change=A.*binary=no/);
    assert.match(prompt, /deleted\.txt.*change=D.*binary=no/);
    assert.match(prompt, /binary\.dat.*change=A.*binary=yes/);
    assert.equal((prompt.match(/--- FILE /g) || []).length, 4);

    const empty = spawnSync('python3', ['-c', python], {
      cwd: fixture,
      encoding: 'utf8',
      env: { ...process.env, BASE_SHA: head, HEAD_SHA: head, RUNNER_TEMP: fixture },
    });
    assert.equal(empty.status, 0, empty.stderr);
    const emptyPrompt = await readFile(join(fixture, 'review-prompt.txt'), 'utf8');
    assert.doesNotMatch(emptyPrompt, /--- FILE /);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('trusted prompt treats every candidate filename as a literal diff path', async () => {
  const review = await workflow('review-fix.yml');
  const python = review.match(/          python3 - <<'PY'\n([\s\S]*?)\n          PY/)[1]
    .split('\n').map((line) => line.slice(10)).join('\n');
  const fixture = await mkdtemp(join(tmpdir(), 'review-literal-paths-'));
  const candidate = join(fixture, 'candidate-source');
  const trusted = join(fixture, 'trusted-review-input');
  const run = (...args) => {
    const result = spawnSync('git', args, { cwd: candidate, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const files = new Map([
    ['regular.txt', 'LITERAL_REGULAR_CONTENT'],
    [':leading.txt', 'LITERAL_COLON_CONTENT'],
    [':(exclude)**', 'LITERAL_MAGIC_CONTENT'],
    ['wild*card?.[txt', 'LITERAL_WILDCARD_CONTENT'],
    ['companion.txt', 'LITERAL_COMPANION_CONTENT'],
  ]);

  try {
    await mkdir(candidate);
    await mkdir(trusted);
    run('init', '-q');
    run('config', 'user.name', 'Regression Test');
    run('config', 'user.email', 'test@example.invalid');
    await writeFile(join(candidate, 'baseline.txt'), 'baseline\n');
    run('add', '.');
    run('commit', '-qm', 'base');
    const base = run('rev-parse', 'HEAD');
    for (const [name, content] of files) {
      await writeFile(join(candidate, name), `${content}\n`);
    }
    run('add', '-A');
    run('commit', '-qm', 'literal candidate paths');
    const head = run('rev-parse', 'HEAD');
    await writeFile(join(trusted, 'candidate-requirements.md'), 'Review every file.\n');

    const result = spawnSync('python3', ['-c', python], {
      cwd: fixture,
      encoding: 'utf8',
      env: { ...process.env, BASE_SHA: base, HEAD_SHA: head, RUNNER_TEMP: fixture },
    });
    assert.equal(result.status, 0, result.stderr);
    const prompt = await readFile(join(fixture, 'review-prompt.txt'), 'utf8');
    for (const [name, content] of files) {
      assert.ok(prompt.includes(`${name}'; change=A`), `missing metadata for ${name}`);
      assert.match(prompt, new RegExp(`\\+${content}`));
    }
    assert.equal((prompt.match(/--- FILE /g) || []).length, files.size);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
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

test('Trusted Merge rejects a changed base and revalidates the CI run', async () => {
  const trusted = await workflow('trusted-merge.yml');

  assert.match(trusted, /current_base=.*git\/ref\/heads\/\$DEFAULT_BRANCH/);
  assert.match(trusted, /\[ "\$current_base" = "\$expected_base" \]/);
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
  assert.match(review, /VERDICT: PASS\n\s+VERDICT: NON_PASS/);
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
