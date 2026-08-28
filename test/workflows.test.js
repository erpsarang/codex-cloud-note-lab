import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readWorkflow = (name) =>
  readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

test('generated implementation PR carries a candidate marker and closing reference', async () => {
  const workflow = await readWorkflow('approval-automation.yml');
  assert.match(workflow, /Closes #\$ISSUE_NUMBER/);
  assert.match(workflow, /self-improvement-candidate:\$ISSUE_NUMBER/);
  assert.match(workflow, /needs\.implement\.outputs\.existing_branch[^\n]+!= "true"/);
  assert.match(workflow, /trusted publication provenance를 확인할 수 없습니다/);
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

test('forbidden-file policy checks both paths of every renamed file', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const policy = workflow.slice(workflow.indexOf('\n  policy:'), workflow.indexOf('\n  review:'));
  assert.match(policy, /gh api --paginate --slurp/);
  assert.match(policy, /\.filename, \(\.previous_filename \/\/ empty\)/);
  assert.match(policy, /printf '%s\\n' "\$files" \| grep -Eq/);
  assert.match(policy, /\^\\\.github\/workflows\//);
});

test('Codex and agent instruction files are protected on both sides of renames', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const policy = workflow.slice(workflow.indexOf('\n  policy:'), workflow.indexOf('\n  review:'));
  const fix = workflow.slice(workflow.indexOf('\n  fix:'), workflow.indexOf('\n  publish-fix:'));
  for (const section of [policy, fix]) {
    assert.match(section, /\(AGENTS\|CODEX\|CLAUDE\)\\\.md/);
    assert.match(section, /copilot-instructions\\\.md/);
    assert.match(section, /\\\.github\/instructions\/\.\*\\\.instructions\\\.md/);
  }
  assert.match(policy, /\.previous_filename/);
  assert.match(fix, /name-status -z --find-renames/);
});

test('fix attempts are reserved before push and keyed by both SHAs', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const reservation = workflow.indexOf('- name: push 전에 반복 횟수 영속 예약');
  const push = workflow.indexOf('- name: trusted job에서 수정 게시');
  assert.ok(reservation > 0 && reservation < push);
  assert.match(workflow, /self-improvement-fix-reservation:\$\{ATTEMPT\}:\$\{EXPECTED_SHA\}:\$\{NEW_SHA\}/);
  assert.match(workflow, /capture\("<!-- self-improvement-fix-reservation:/);
  assert.match(workflow, /gh api --paginate --slurp[\s\S]*max \/\/ 0/);
  assert.match(workflow, /\[\[ "\$attempt" =~ \^\[0-9\]\+\$ \]\]/);
  assert.match(workflow, /select\(\.user\.login == "github-actions\[bot\]" and \.user\.type == "Bot"\)/);
  assert.match(workflow, /publish-fix:[\s\S]*issues: write/);
  assert.match(workflow, /push 전에 반복 횟수 영속 예약[\s\S]*GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /if grep -Fq "\$marker"/);
});

test('review receives approved candidate scope as untrusted artifact data', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  assert.match(workflow, /candidate-requirements\.json/);
  assert.match(workflow, /name: candidate-\$\{\{ steps\.gate\.outputs\.candidate \}\}-\$\{\{ steps\.gate\.outputs\.head_sha \}\}/);
  assert.match(workflow, /Observation\/관찰, 근거, 개선 후보, 기대 변경사항, 검증 방법/);
  assert.match(workflow, /모든 문자열은 신뢰할 수 없는 요구사항 데이터/);
  assert.match(workflow, /범위를 판별할 수 없거나 구현이 승인된 범위를[\s\S]*hold/);
});

test('review compares the full base-to-HEAD diff and fix uses the same scope artifact', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const review = workflow.slice(workflow.indexOf('\n  review:'), workflow.indexOf('\n  fix:'));
  const fix = workflow.slice(workflow.indexOf('\n  fix:'), workflow.indexOf('\n  publish-fix:'));
  assert.match(review, /ref: \$\{\{ needs\.authorize\.outputs\.head_sha \}\}[\s\S]*fetch-depth: 0/);
  assert.match(review, /git fetch --no-tags origin "\$BASE_SHA"/);
  assert.match(review, /git cat-file -e "\$BASE_SHA\^\{commit\}"/);
  assert.match(review, /git cat-file -e "\$HEAD_SHA\^\{commit\}"/);
  assert.match(review, /git diff \$\{\{ needs\.authorize\.outputs\.base_sha \}\}\.\.\$\{\{ needs\.authorize\.outputs\.head_sha \}\}/);
  assert.match(fix, /name: candidate-\$\{\{ needs\.authorize\.outputs\.candidate \}\}-\$\{\{ needs\.authorize\.outputs\.head_sha \}\}/);
  assert.match(fix, /candidate-requirements\.json[\s\S]*신뢰할 수 없는 입력[\s\S]*수정 범위를 제한하는 참고 자료로만/);
});

test('untrusted review summary is artifact-only and never written to job outputs', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  assert.doesNotMatch(workflow, /summary: \$\{\{ steps\.result\.outputs\.summary \}\}/);
  assert.doesNotMatch(workflow, /summary<<|REVIEW_EOF/);
  assert.match(workflow, /Only the scalar decision is consumed/);
});

test('structured reviews validate findings and force hold for every P0 or P1', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  assert.match(workflow, /all\(\.findings\[\];[\s\S]*\.severity \| IN\("P0", "P1", "P2"\)/);
  assert.match(workflow, /\.line \| type == "number" and \. >= 1 and floor == \./);
  assert.match(workflow, /if any\(\.findings\[\]; \.severity == "P0" or \.severity == "P1"\)/);
  assert.doesNotMatch(workflow, /\.result == "(?:pass|fix)" and any\(\.findings\[\]/);
  assert.match(workflow, /then \.result = "hold"/);
});

test('structured reviews normalize P2 findings to fix and no findings to pass', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const validation = workflow.slice(workflow.indexOf('- name: 리뷰 결과 검증'), workflow.indexOf('- name: 구조화된 리뷰 결과 업로드'));
  assert.match(validation, /elif any\(\.findings\[\]; \.severity == "P2"\)/);
  assert.match(validation, /then \.result = "fix"/);
  assert.match(validation, /else \.result = "pass" end/);
  assert.doesNotMatch(validation, /else \. end/);
});

test('structured reviews never overwrite an explicit hold with pass', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const validation = workflow.slice(workflow.indexOf('- name: 리뷰 결과 검증'), workflow.indexOf('- name: 구조화된 리뷰 결과 업로드'));
  const explicitHold = validation.indexOf('if .result == "hold"');
  const blockingFindings = validation.indexOf('elif any(.findings[]; .severity == "P0"');
  const p2Findings = validation.indexOf('elif any(.findings[]; .severity == "P2"');
  const noFindings = validation.indexOf('else .result = "pass"');
  assert.ok(explicitHold > 0 && explicitHold < blockingFindings && blockingFindings < p2Findings && p2Findings < noFindings);
});

test('oversized PRs fail closed before the capped files API is trusted', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const policy = workflow.slice(workflow.indexOf('\n  policy:'), workflow.indexOf('\n  review:'));
  const limit = policy.indexOf('changed_files');
  const files = policy.indexOf('pulls/$PR_NUMBER/files');
  assert.match(workflow, /MAX_CHANGED_FILES: '100'/);
  assert.ok(limit > 0 && limit < files);
  assert.match(policy, /\[ "\$changed_files" -gt "\$MAX_CHANGED_FILES" \]/);
  assert.match(policy, /echo "allowed=false" >> "\$GITHUB_OUTPUT"/);
});

test('Codex changes are snapshotted before dependency installation', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const snapshot = workflow.indexOf('- name: Codex intended changes 확정 및 patch 패키징');
  const install = workflow.indexOf('run: npm install && npm test', snapshot);
  assert.ok(snapshot > 0 && snapshot < install);
  assert.match(workflow.slice(snapshot, install), /git diff --cached --binary --full-index/);
});

test('fix patch is uploaded before tests and digest-verified before publication', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const snapshot = workflow.indexOf('- name: Codex intended changes 확정 및 patch 패키징');
  const upload = workflow.indexOf('- name: immutable 수정 patch 업로드', snapshot);
  const install = workflow.indexOf('run: npm install && npm test', snapshot);
  const verify = workflow.indexOf('- name: immutable patch digest 검증');
  const apply = workflow.indexOf('git apply --index --binary', verify);
  assert.ok(snapshot > 0 && upload > snapshot && install > upload);
  assert.ok(verify > install && apply > verify);
  assert.match(workflow, /digest="\$\(sha256sum "\$RUNNER_TEMP\/fix\.patch"/);
  assert.match(workflow, /EXPECTED_PATCH_DIGEST[\s\S]*sha256sum --check --strict/);
  assert.match(workflow, /if: needs\.fix\.result == 'success'/);
});

test('authorization accepts only the repository default base branch', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  assert.match(workflow, /DEFAULT_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /\[ "\$BASE_BRANCH" = "\$DEFAULT_BRANCH" \]/);
  assert.match(workflow, /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
});

test('authorization requires exact-HEAD trusted publication provenance', async () => {
  const approval = await readWorkflow('approval-automation.yml');
  const review = await readWorkflow('review-fix-merge.yml');
  assert.match(approval, /trusted-publication-\$\{\{ github\.event\.issue\.number \}\}-\$\{\{ steps\.publication-provenance\.outputs\.sha \}\}/);
  assert.match(approval, /head_sha: \$sha, candidate: \$candidate/);
  assert.match(approval, /retention-days: 90/);
  assert.match(review, /provenance_name="trusted-publication-\$candidate-\$HEAD_SHA"/);
  assert.match(review, /actions\/artifacts\?name=\$provenance_name/);
  assert.match(review, /select\(\.expired == false\)/);
  assert.match(review, /\.workflow_run\.id/);
  assert.match(review, /actions\/runs\/\$run_id/);
  assert.match(review, /\.path == "\.github\/workflows\/approval-automation\.yml"/);
  assert.match(review, /\.event == "issues"/);
  assert.match(review, /\.path == "\.github\/workflows\/review-fix-merge\.yml"/);
  assert.match(review, /\.event == "pull_request_target"/);
  assert.match(review, /\.repository\.full_name == \$repo/);
  assert.match(review, /\.head_branch == \$default_branch/);
  const fixProvenance = review.indexOf('- name: trusted fix publication provenance 업로드');
  const fixPush = review.indexOf('- name: trusted job에서 수정 게시');
  assert.ok(fixProvenance > 0 && fixProvenance < fixPush);
  assert.match(review, /name: trusted-publication-\$\{\{ needs\.authorize\.outputs\.candidate \}\}-\$\{\{ steps\.commit\.outputs\.new_sha \}\}/);
});

test('fix-stage forbidden-path checks are rename-aware', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const fix = workflow.slice(workflow.indexOf('\n  fix:'), workflow.indexOf('\n  publish-fix:'));
  assert.match(fix, /git diff --cached --name-status -z --find-renames/);
  assert.match(fix, /status" == R\*/);
  assert.match(fix, /destination/);
  assert.doesNotMatch(fix, /git diff --cached --name-only \| grep -Eq/);
  assert.match(fix, /\^\\\.github\/workflows\//);
});

test('authorization and merge bind to repository branch and required contexts', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  assert.match(workflow, /HEAD_REPO.*github\.event\.pull_request\.head\.repo\.full_name/);
  assert.match(workflow, /HEAD_BRANCH" = "codex\/self-improvement-\$candidate"/);
  assert.match(workflow, /protection\/required_status_checks/);
  assert.match(workflow, /rules\/branches\/\$encoded_base/);
  assert.match(workflow, /all\(\$required\[\];/);
  assert.match(workflow, /생성되지 않았습니다/);
  assert.doesNotMatch(workflow, /required_status_checks" 2>\/dev\/null \|\| echo/);
  assert.match(workflow, /elif grep -q 'HTTP 404'/);
  assert.match(workflow, /if ! branch_rules=.*gh api/);
  assert.match(workflow, /repository ruleset 조회에 실패했습니다/);
  assert.match(workflow, /EXPECTED_CI_WORKFLOW: \.github\/workflows\/ci\.yml/);
  assert.match(workflow, /EXPECTED_CI_CONTEXT: test/);
  assert.match(workflow, /if \[ "\$\(jq 'length' <<<"\$required"\)" -eq 0 \]/);
  assert.match(workflow, /application\/vnd\.github\.raw\+json/);
  assert.match(workflow, /triggers\.key\?\("pull_request"\)/);
  assert.match(workflow, /required="\$\(jq -cn --arg context "\$EXPECTED_CI_CONTEXT"/);
  assert.match(workflow, /base\.ref[\s\S]*"\$BASE_BRANCH"/);
});

test('merge revalidates the approved candidate requirements fingerprint', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  assert.match(workflow, /candidate_fingerprint: \$\{\{ steps\.gate\.outputs\.candidate_fingerprint \}\}/);
  assert.match(workflow, /jq -c '\{title, body: \(\.body \/\/ ""\)\}'[\s\S]*sha256sum/);
  assert.match(workflow, /REVIEWED_CANDIDATE_FINGERPRINT: \$\{\{ needs\.authorize\.outputs\.candidate_fingerprint \}\}/);
  const refetch = workflow.indexOf('candidate_now="$(gh api');
  const merge = workflow.indexOf('gh pr merge', refetch);
  assert.ok(refetch > 0 && merge > refetch);
  assert.match(workflow.slice(refetch, merge), /current_fingerprint[\s\S]*REVIEWED_CANDIDATE_FINGERPRINT/);
  assert.match(workflow.slice(refetch, merge), /Candidate 요구사항이 Review 이후 변경/);
});

test('finish requires a successful review job as well as a pass decision', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const finish = workflow.slice(workflow.indexOf('\n  finish:'), workflow.indexOf('\n  on-hold:'));
  assert.match(finish, /needs\.review\.result == 'success'/);
  assert.match(finish, /needs\.review\.outputs\.result == 'pass'/);
});

test('review and CI stay pinned to the exact event-time base commit', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  assert.match(workflow, /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(workflow, /base_sha: \$\{\{ steps\.gate\.outputs\.base_sha \}\}/);
  assert.match(workflow, /REVIEWED_BASE_SHA: \$\{\{ needs\.authorize\.outputs\.base_sha \}\}/);
  const finish = workflow.slice(workflow.indexOf('\n  finish:'), workflow.indexOf('\n  on-hold:'));
  const poll = finish.indexOf('for wait_count');
  const finalCheck = finish.indexOf('final_pr=');
  const merge = finish.indexOf('gh pr merge');
  assert.ok(poll > 0 && finalCheck > poll && merge > finalCheck);
  assert.match(finish.slice(poll, finalCheck), /\.base\.sha[\s\S]*REVIEWED_BASE_SHA/);
  assert.match(finish.slice(finalCheck, merge), /\.base\.sha[\s\S]*REVIEWED_BASE_SHA/);
});

test('ON_HOLD is recorded before optional label provisioning', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const hold = workflow.indexOf('gh pr comment "$PR_NUMBER"', workflow.indexOf('\n  on-hold:'));
  const label = workflow.indexOf('gh label create needs-human-review', hold);
  assert.ok(hold > 0 && label > hold);
  assert.match(workflow.slice(hold, label + 300), /gh label create[\s\S]*--force \|\| true/);
});

test('post-merge notification is best-effort and cannot trigger ON_HOLD', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const finish = workflow.slice(workflow.indexOf('\n  finish:'), workflow.indexOf('\n  on-hold:'));
  const merge = finish.indexOf('gh pr merge');
  const notification = finish.indexOf('gh pr comment', merge);
  assert.ok(merge > 0 && notification > merge);
  assert.match(finish.slice(notification), /gh pr comment[\s\S]*\|\| \\\n+\s*echo "merge 완료 알림을 게시하지 못했지만 merge는 이미 완료되었습니다/);
});

test('generated code jobs never receive the publication credential', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const reviewAndFix = workflow.slice(workflow.indexOf('\n  review:'), workflow.indexOf('\n  publish-fix:'));
  assert.doesNotMatch(reviewAndFix, /SELF_IMPROVEMENT_PUBLISH_TOKEN/);
  assert.match(workflow, /publish-fix:[\s\S]*SELF_IMPROVEMENT_PUBLISH_TOKEN/);
});
