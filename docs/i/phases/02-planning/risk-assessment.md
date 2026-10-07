# Risk Assessment

## Project Information

| Field | Value |
|-------|-------|
| **Project Name** | [Name] |
| **Assessment Date** | [Date] |
| **Assessor** | [Name] |
| **Review Date** | [Date] |

---

## Risk Matrix

```
                         IMPACT
              Low       Medium      High      Critical
         ┌──────────┬──────────┬──────────┬──────────┐
   High  │  Medium  │   High   │ Critical │ Critical │
         ├──────────┼──────────┼──────────┼──────────┤
   Med   │   Low    │  Medium  │   High   │ Critical │
PROB     ├──────────┼──────────┼──────────┼──────────┤
   Low   │   Low    │   Low    │  Medium  │   High   │
         ├──────────┼──────────┼──────────┼──────────┤
   Rare  │   Low    │   Low    │   Low    │  Medium  │
         └──────────┴──────────┴──────────┴──────────┘
```

---

## Risk Register

### Technical Risks

| ID | Risk | Probability | Impact | Score | Status |
|----|------|-------------|--------|-------|--------|
| TR-001 | [Risk description] | High | High | Critical | Open |
| TR-002 | [Risk description] | Medium | Medium | Medium | Open |
| TR-003 | [Risk description] | Low | High | Medium | Mitigated |

### Business Risks

| ID | Risk | Probability | Impact | Score | Status |
|----|------|-------------|--------|-------|--------|
| BR-001 | [Risk description] | Medium | High | High | Open |
| BR-002 | [Risk description] | Low | Medium | Low | Monitoring |

### External Risks

| ID | Risk | Probability | Impact | Score | Status |
|----|------|-------------|--------|-------|--------|
| ER-001 | [Risk description] | Medium | High | High | Open |
| ER-002 | [Risk description] | Low | Medium | Low | Accepted |

---

## Detailed Risk Analysis

### TR-001: [Risk Title]

| Attribute | Value |
|-----------|-------|
| **Category** | Technical |
| **Probability** | High (>70%) |
| **Impact** | High |
| **Risk Score** | Critical |
| **Owner** | [Name] |
| **Status** | Open |

**Description**:
[Detailed description of the risk]

**Root Cause**:
[What could cause this risk to materialize]

**Potential Impact**:
- [Impact 1]
- [Impact 2]
- [Impact 3]

**Early Warning Signs**:
- [Indicator 1]
- [Indicator 2]

**Mitigation Strategy**:
1. [Action 1]
2. [Action 2]
3. [Action 3]

**Contingency Plan**:
[What to do if the risk materializes]

**Cost of Mitigation**: [Estimate]
**Cost if Risk Occurs**: [Estimate]

---

### TR-002: [Risk Title]

| Attribute | Value |
|-----------|-------|
| **Category** | Technical |
| **Probability** | Medium (30-70%) |
| **Impact** | Medium |
| **Risk Score** | Medium |
| **Owner** | [Name] |
| **Status** | Open |

**Description**:
[Detailed description]

**Mitigation Strategy**:
1. [Action 1]
2. [Action 2]

**Contingency Plan**:
[What to do if risk materializes]

---

### BR-001: [Risk Title]

| Attribute | Value |
|-----------|-------|
| **Category** | Business |
| **Probability** | Medium |
| **Impact** | High |
| **Risk Score** | High |
| **Owner** | [Name] |
| **Status** | Open |

**Description**:
[Detailed description]

**Mitigation Strategy**:
1. [Action 1]
2. [Action 2]

---

## Risk Categories

### Technical Risks
- Architecture complexity
- Technology unknowns
- Integration challenges
- Performance issues
- Security vulnerabilities
- Technical debt
- Scalability limitations

### Business Risks
- Scope creep
- Budget constraints
- Timeline pressure
- Stakeholder changes
- Requirement changes
- Market changes
- Competition

### Resource Risks
- Team availability
- Skill gaps
- Key person dependency
- Vendor reliability
- Tool/license availability

### External Risks
- Third-party dependencies
- Regulatory changes
- Economic factors
- Natural disasters
- Pandemic effects

---

## Probability Definitions

| Level | Probability | Description |
|-------|-------------|-------------|
| Rare | < 10% | Very unlikely to occur |
| Low | 10-30% | Could occur occasionally |
| Medium | 30-70% | Likely to occur |
| High | > 70% | Almost certain to occur |

## Impact Definitions

| Level | Description |
|-------|-------------|
| Low | Minor inconvenience, easily recoverable |
| Medium | Noticeable impact, some rework required |
| High | Significant impact on timeline/budget/quality |
| Critical | Project failure, major business impact |

---

## Risk Response Strategies

### Avoid
- Change plan to eliminate the risk
- Use when: High probability + High impact

### Mitigate
- Reduce probability or impact
- Use when: Medium risks worth addressing

### Transfer
- Shift risk to third party (insurance, contracts)
- Use when: Risk can be better managed by others

### Accept
- Acknowledge and monitor
- Use when: Cost of mitigation > potential impact

---

## Mitigation Action Items

| Action | Risk ID | Owner | Due Date | Status |
|--------|---------|-------|----------|--------|
| [Action 1] | TR-001 | [Name] | [Date] | Todo |
| [Action 2] | TR-001 | [Name] | [Date] | In Progress |
| [Action 3] | BR-001 | [Name] | [Date] | Done |
| [Action 4] | TR-002 | [Name] | [Date] | Todo |

---

## Risk Monitoring

### Review Schedule
- Weekly: Review high/critical risks
- Bi-weekly: Full risk register review
- Monthly: Risk report to stakeholders

### Risk Metrics
| Metric | Current | Target |
|--------|---------|--------|
| Critical risks | [N] | 0 |
| High risks | [N] | < 3 |
| Open actions | [N] | < 10 |
| Overdue actions | [N] | 0 |

---

## Risk History

| Date | Risk ID | Event | Action Taken |
|------|---------|-------|--------------|
| [Date] | TR-001 | Risk identified | Mitigation plan created |
| [Date] | TR-002 | Status changed to Mitigated | Actions completed |
| [Date] | BR-001 | Impact increased | Escalated to sponsor |

---

## Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Project Manager | | | |
| Tech Lead | | | |
| Sponsor | | | |
