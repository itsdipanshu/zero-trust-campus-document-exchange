# CampusVault – Security Test Report

**Date:** 2026-11-24  
**Tester:** Abdul (Security Testing Developer)  
**Engine Developer:** Dipanshu (Security Logic Developer)  
**Project:** CampusVault – Zero-Trust Campus Document Exchange  
**Hackathon:** NexHack 2.0

---

## Summary

| Metric        | Value     |
| ------------- | --------- |
| Test Suites   | 5 passed  |
| Total Tests   | 54 passed |
| Failures      | 0         |
| Execution Time| ~3 seconds|

---

## Test Case Results

### Integration Tests (10 Required Test Cases)

| # | Test Case | Expected Result | Actual Result | Status |
|---|-----------|-----------------|---------------|--------|
| TC-01 | Valid user with valid grant accesses authorized document | ALLOW – ACCESS_GRANTED_BY_GRANT | ALLOW – ACCESS_GRANTED_BY_GRANT | ✅ PASS |
| TC-02 | Unauthorized user (no grant) accesses confidential document | DENY – NO_VALID_GRANT | DENY – NO_VALID_GRANT | ✅ PASS |
| TC-03 | Math student accessing CS department internal doc | DENY – DEPARTMENT_MISMATCH | DENY – DEPARTMENT_MISMATCH | ✅ PASS |
| TC-04 | Student with expired grant accesses document | DENY – GRANT_EXPIRED | DENY – GRANT_EXPIRED | ✅ PASS |
| TC-05 | Student with revoked grant accesses document | DENY – GRANT_REVOKED | DENY – GRANT_REVOKED | ✅ PASS |
| TC-06 | Suspended user accesses any document | DENY – USER_SUSPENDED | DENY – USER_SUSPENDED | ✅ PASS |
| TC-07 | User accesses old saved document link after revocation | DENY – GRANT_REVOKED | DENY – GRANT_REVOKED | ✅ PASS |
| TC-08 | Direct API request without permission | DENY – NO_VALID_GRANT | DENY – NO_VALID_GRANT | ✅ PASS |
| TC-09 | User attempts access after revocation while still logged in | DENY – GRANT_REVOKED | DENY – GRANT_REVOKED | ✅ PASS |
| TC-10 | Audit log records all decisions with correct fields | All entries present with required fields | All entries verified | ✅ PASS |

### RBAC Unit Tests

| # | Test Case | Expected | Actual | Status |
|---|-----------|----------|--------|--------|
| 1 | Valid roles are accepted | true | true | ✅ PASS |
| 2 | Invalid roles are rejected | false | false | ✅ PASS |
| 3 | Admin can access all classifications | true for all 4 | true for all 4 | ✅ PASS |
| 4 | Student can only access public | true for public, false for rest | Matches | ✅ PASS |
| 5 | Teacher can access public and internal | true for 2, false for rest | Matches | ✅ PASS |
| 6 | Dept Manager can access up to confidential | true for 3, false for restricted | Matches | ✅ PASS |
| 7 | Admin passes RBAC for restricted doc | passed: true, ACCESS_GRANTED_BY_ROLE | Matches | ✅ PASS |
| 8 | Student passes RBAC for public doc | passed: true, ACCESS_GRANTED_BY_ROLE | Matches | ✅ PASS |
| 9 | Student fails RBAC for confidential doc | passed: false, CLASSIFICATION_NOT_ALLOWED | Matches | ✅ PASS |
| 10 | Teacher fails RBAC for confidential doc | passed: false, CLASSIFICATION_NOT_ALLOWED | Matches | ✅ PASS |
| 11 | Null user fails RBAC | passed: false, INVALID_REQUEST | Matches | ✅ PASS |

### ABAC Unit Tests

| # | Test Case | Expected | Actual | Status |
|---|-----------|----------|--------|--------|
| 1 | Active user passes status check | passed: true | Matches | ✅ PASS |
| 2 | Suspended user is denied | USER_SUSPENDED | Matches | ✅ PASS |
| 3 | Inactive user is denied | USER_INACTIVE | Matches | ✅ PASS |
| 4 | Null user is denied | USER_NOT_FOUND | Matches | ✅ PASS |
| 5 | Same department passes | passed: true | Matches | ✅ PASS |
| 6 | Different department is denied | DEPARTMENT_MISMATCH | Matches | ✅ PASS |
| 7 | Admin bypasses department restriction | passed: true | Matches | ✅ PASS |
| 8 | Public docs have no dept restriction | passed: true | Matches | ✅ PASS |
| 9 | Valid grant passes | ACCESS_GRANTED_BY_GRANT | Matches | ✅ PASS |
| 10 | Revoked grant is denied | GRANT_REVOKED | Matches | ✅ PASS |
| 11 | Expired grant is denied | GRANT_EXPIRED | Matches | ✅ PASS |
| 12 | Null grant is denied | NO_VALID_GRANT | Matches | ✅ PASS |
| 13 | Grant for wrong user is denied | NO_VALID_GRANT | Matches | ✅ PASS |
| 14 | Grant for wrong document is denied | NO_VALID_GRANT | Matches | ✅ PASS |
| 15 | Combined ABAC: active + same dept + valid grant | passed: true | Matches | ✅ PASS |
| 16 | Combined ABAC: suspended blocks before grant | USER_SUSPENDED | Matches | ✅ PASS |
| 17 | Combined ABAC: cross-dept blocks before grant | DEPARTMENT_MISMATCH | Matches | ✅ PASS |

### Audit Logger Unit Tests

| # | Test Case | Expected | Actual | Status |
|---|-----------|----------|--------|--------|
| 1 | Logs a decision entry with all fields | Entry created with correct fields | Matches | ✅ PASS |
| 2 | Never logs sensitive data (password, token, etc.) | Sensitive fields stripped | Verified stripped | ✅ PASS |
| 3 | queryLogs filters by userId | 1 matching result | 1 result | ✅ PASS |
| 4 | queryLogs filters by decision | Correct filtered count | Matches | ✅ PASS |
| 5 | getAllLogs returns all entries | All entries returned | Matches | ✅ PASS |
| 6 | clearLogs empties the store | 0 entries | 0 entries | ✅ PASS |
| 7 | setStore routes to external persistence | Entry pushed to external | Verified | ✅ PASS |

---

## Attack Simulation Results

### Scenario: Immediate Access Revocation

| Step | Action | Expected | Actual | Status |
|------|--------|----------|--------|--------|
| 1 | Admin grants Student A access | Grant created | Grant object created | ✅ PASS |
| 2 | Student A opens document | ALLOW – ACCESS_GRANTED_BY_GRANT | ALLOW – ACCESS_GRANTED_BY_GRANT | ✅ PASS |
| 3 | Admin revokes Student A's access | Grant marked revoked | Grant.revoked = true | ✅ PASS |
| 4 | Student A tries same old link | DENY – GRANT_REVOKED | DENY – GRANT_REVOKED | ✅ PASS |
| 5 | Student A tries direct API request | DENY – GRANT_REVOKED | DENY – GRANT_REVOKED | ✅ PASS |
| 6 | Verify audit log | 1 ALLOW + 2 DENY entries | 1 ALLOW + 2 DENY entries verified | ✅ PASS |

### Additional Attack Vectors

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Suspended user with valid grant | DENY – USER_SUSPENDED | Matches | ✅ PASS |
| Expired grant (not explicitly revoked) | DENY – GRANT_EXPIRED | Matches | ✅ PASS |
| Cross-department student with grant | DENY – DEPARTMENT_MISMATCH | Matches | ✅ PASS |

---

## Conclusion

**All 54 tests PASSED.** The Zero-Trust Security Engine correctly:

1. ✅ Enforces RBAC (Role-Based Access Control) with 4 role levels
2. ✅ Enforces ABAC (Attribute-Based Access Control) with department, status, and classification checks
3. ✅ Provides immediate access revocation – old links and existing sessions are blocked
4. ✅ Handles grant expiry server-side – no dependence on frontend timers
5. ✅ Returns structured decision reasons for every authorization decision
6. ✅ Records complete audit logs without sensitive data leakage
7. ✅ Blocks all bypass vectors: saved URLs, direct API calls, active sessions

**Zero-Trust Principle Verified:** Every request is re-evaluated against CURRENT permissions at request time. No cached decisions. Never trust, always verify.

