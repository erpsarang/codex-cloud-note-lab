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

test('fix attempts are reserved before push and keyed by both SHAs', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const reservation = workflow.indexOf('- name: push 전에 반복 횟수 영속 예약');
  const push = workflow.indexOf('- name: trusted job에서 수정 게시');
  assert.ok(reservation > 0 && reservation < push);
  assert.match(workflow, /self-improvement-fix-reservation:\$\{ATTEMPT\}:\$\{EXPECTED_SHA\}:\$\{NEW_SHA\}/);
  assert.match(workflow, /capture\("<!-- self-improvement-fix-reservation:/);
  assert.match(workflow, /gh api --paginate --slurp[\s\S]*max \/\/ 0/);
  assert.match(workflow, /\[\[ "\$attempt" =~ \^\[0-9\]\+\$ \]\]/);
});

test('structured reviews validate findings and force hold for every P0 or P1', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  assert.match(workflow, /all\(\.findings\[\];[\s\S]*\.severity \| IN\("P0", "P1", "P2"\)/);
  assert.match(workflow, /\.line \| type == "number" and \. >= 1 and floor == \./);
  assert.match(workflow, /if any\(\.findings\[\]; \.severity == "P0" or \.severity == "P1"\)/);
  assert.doesNotMatch(workflow, /\.result == "(?:pass|fix)" and any\(\.findings\[\]/);
  assert.match(workflow, /then \.result = "hold"/);
});

test('Codex changes are snapshotted before dependency installation', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const snapshot = workflow.indexOf('- name: Codex intended changes 확정 및 patch 패키징');
  const install = workflow.indexOf('run: npm install && npm test', snapshot);
  assert.ok(snapshot > 0 && snapshot < install);
  assert.match(workflow.slice(snapshot, install), /git diff --cached --binary --full-index/);
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
});

test('ON_HOLD is recorded before optional label provisioning', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const hold = workflow.indexOf('gh pr comment "$PR_NUMBER"', workflow.indexOf('\n  on-hold:'));
  const label = workflow.indexOf('gh label create needs-human-review', hold);
  assert.ok(hold > 0 && label > hold);
  assert.match(workflow.slice(hold, label + 300), /gh label create[\s\S]*--force \|\| true/);
});

test('generated code jobs never receive the publication credential', async () => {
  const workflow = await readWorkflow('review-fix-merge.yml');
  const reviewAndFix = workflow.slice(workflow.indexOf('\n  review:'), workflow.indexOf('\n  publish-fix:'));
  assert.doesNotMatch(reviewAndFix, /SELF_IMPROVEMENT_PUBLISH_TOKEN/);
  assert.match(workflow, /publish-fix:[\s\S]*SELF_IMPROVEMENT_PUBLISH_TOKEN/);
});
