# MIZAN Workflows

## Canonical participant lifecycle
`draft → submitted → under_review/approved → checked_in → in_queue → in_session → tested → appealed(optional) → certified`

The canonical lifecycle is a state vocabulary, not a mandatory identical path. `CompetitionPolicy.workflow` determines which stages are enabled, automated or approval-gated for a specific competition.

## Registration
1. Public, invitation, delegation or hybrid registration is selected per competition.
2. Dynamic fields and eligibility conditions belong to the competition.
3. Objective conditions may auto-approve only when `autoApproveEligible=true`.
4. Ambiguous or policy-required cases go to human review.
5. Accepted participant data is reused through gate, judging, result and certificate workflows.

## Competition day
1. Participant checks in using mobile, kiosk or exception desk.
2. Routing selects a compatible non-offline committee and balances the live queue.
3. Participant is called by code by default on public displays.
4. FairDraw creates and commits the question set according to the competition question policy.
5. Each judge evaluates independently until lock.
6. Panel score is calculated only when the configured number of judge submissions exists.
7. Variance can open a review case; AI observations can also open review cases but cannot change a score.

## Results
`calculated → quality_checked → approved → sealed → published`

Visibility is controlled by the competition: immediate, after committee, after round, ceremony-only or private-only.

## Exceptions
Late arrival, missing QR, committee change, audio issue, judge absence, retest, disqualification and emergency events are explicit workflows. Routine paths stay automatic; exceptions are human-visible and audited.

## Competition-owned workflow rule
There is no universal MIZAN competition procedure. Each competition owns a versioned `CompetitionPolicy` covering registration, eligibility, workflow automation, operations, question selection, judging, results, appeals, certificates and privacy. Category-level RuleSets can further vary judging criteria and panel rules inside the same competition.
