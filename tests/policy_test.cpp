#include "deskdear/policy.hpp"
#include <cassert>
using namespace std::chrono_literals;
int main() {
    const auto now = deskdear::Clock::time_point{} + 100s;
    deskdear::OperationRequest request{
        "op-1", "session-1", deskdear::Capability::Health, "health.status",
        now + 10s, false, false, {}, {}};
    deskdear::SessionPolicy session{true, false, now + 60s, {}};
    assert(deskdear::PolicyEvaluator::evaluate(session, request, now).error ==
           deskdear::PolicyError::CapabilityDenied);
    session.permissions.grant_for_session(deskdear::Capability::Health);
    assert(deskdear::PolicyEvaluator::evaluate(session, request, now).allowed());
    session.authenticated = false;
    assert(deskdear::PolicyEvaluator::evaluate(session, request, now).error ==
           deskdear::PolicyError::Unauthenticated);
    session.authenticated = true;
    session.revoked = true;
    assert(deskdear::PolicyEvaluator::evaluate(session, request, now).error ==
           deskdear::PolicyError::SessionRevoked);
    session.revoked = false;
    session.expires_at = now;
    assert(deskdear::PolicyEvaluator::evaluate(session, request, now).error ==
           deskdear::PolicyError::SessionExpired);
    session.expires_at = now + 60s;
    request.requires_local_approval = true;
    assert(deskdear::PolicyEvaluator::evaluate(session, request, now).error ==
           deskdear::PolicyError::LocalApprovalRequired);
    request.local_approval_granted = true;
    assert(deskdear::PolicyEvaluator::evaluate(session, request, now).allowed());
    request.operation_id.clear();
    assert(deskdear::PolicyEvaluator::evaluate(session, request, now).error ==
           deskdear::PolicyError::MalformedRequest);
}
