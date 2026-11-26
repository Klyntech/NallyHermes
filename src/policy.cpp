#include "deskdear/policy.hpp"
namespace deskdear {
std::string_view policy_error_name(PolicyError error) noexcept {
    switch (error) {
        case PolicyError::None: return "none";
        case PolicyError::MalformedRequest: return "malformed_request";
        case PolicyError::Unauthenticated: return "unauthenticated";
        case PolicyError::SessionRevoked: return "session_revoked";
        case PolicyError::SessionExpired: return "session_expired";
        case PolicyError::DeadlineExceeded: return "deadline_exceeded";
        case PolicyError::CapabilityDenied: return "capability_denied";
        case PolicyError::LocalApprovalRequired: return "local_approval_required";
    }
    return "unknown";
}
PolicyDecision PolicyEvaluator::evaluate(const SessionPolicy& session,
                                         const OperationRequest& request,
                                         Clock::time_point now) noexcept {
    if (request.operation_id.empty() || request.session_id.empty() || request.action.empty() ||
        request.deadline == Clock::time_point{}) {
        return {PolicyError::MalformedRequest, "operation identity, action, and deadline are required"};
    }
    if (!session.authenticated) {
        return {PolicyError::Unauthenticated, "an authenticated session is required"};
    }
    if (session.revoked) {
        return {PolicyError::SessionRevoked, "the session has been revoked"};
    }
    if (session.expires_at == Clock::time_point{} || now >= session.expires_at) {
        return {PolicyError::SessionExpired, "the session has expired"};
    }
    if (request.deadline <= now || request.deadline > session.expires_at) {
        return {PolicyError::DeadlineExceeded, "the operation deadline is invalid for this session"};
    }
    if (!session.permissions.allows(request.capability)) {
        return {PolicyError::CapabilityDenied, "the capability is not granted for this session"};
    }
    if (request.requires_local_approval && !request.local_approval_granted) {
        return {PolicyError::LocalApprovalRequired, "local user approval is required"};
    }
    return {};
}
} // namespace deskdear
