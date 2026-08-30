# codex-cloud-note-lab
간단한 메모 앱 with 코덱스 클라우드

## Trusted Merge final authority 설정

Trusted Merge는 사용자 PAT가 아니라 전용 GitHub App installation token으로만
`main`을 업데이트한다. App token은 environment protection을 통과한
`self-improvement-trusted-merge` job 안에서 짧게 발급되며 Candidate와 Review
workflow에는 전달되지 않는다.

저장소 관리자는 다음을 설정해야 한다.

1. Trusted Merge 전용 GitHub App을 만들고 이 저장소에만 install한다. App에
   **Actions: read**, **Contents: read and write**, **Issues: read**,
   **Pull requests: read**, **Metadata: read** repository permission만 부여한다.
2. `self-improvement-trusted-merge` environment secret으로 App ID를
   `SELF_IMPROVEMENT_MERGE_APP_ID`, private key를
   `SELF_IMPROVEMENT_MERGE_APP_PRIVATE_KEY`에 저장한다. 기존 사용자 PAT
   `SELF_IMPROVEMENT_MERGE_TOKEN`은 삭제한다.
3. **Settings → Rules → Rulesets**에서 `main`에 적용되는 ruleset을 열고
   **Bypass list**에 위 GitHub App 하나만 추가한다. direct compare-and-swap
   push가 필요하므로 bypass mode는 **Always allow**로 설정한다.
4. repository role, organization admin, team, 사용자 또는 GitHub Actions 전체를
   bypass actor로 추가하지 않는다. pull request/status check/non-fast-forward
   rule 자체도 변경하지 않는다.

Ruleset bypass는 workflow 이름이 아니라 인증 actor에 적용된다. 따라서 사용자
PAT를 bypass하면 같은 사용자의 다른 작업도 구분할 수 없지만, 전용 App은
Trusted Merge final authority만 독립적으로 bypass actor로 지정할 수 있다.
