#pragma once
#include "deskdear/permissions.hpp"
#include <chrono>
#include <string>
#include <string_view>
namespace deskdear {
using Clock = std::chrono::system_clock;
struct OperationRequest {
    std::string operation_id;
    std::string session_id;
    Capability capability{Capability::Health};
    std::string action;
    Clock::time_point deadline{};
    bool requires_local_approval{false};
    bool local_approval_granted{false};
    std::string target;
    std::string content;
};
enum class PolicyError {
    None,
    MalformedRequest,
    Unauthenticated,
    SessionRevoked,
    SessionExpired,
    DeadlineExceeded,
    CapabilityDenied,
    LocalApprovalRequired
};
std::string_view policy_error_name(PolicyError error) noexcept;
struct PolicyDecision {
    PolicyError error{PolicyError::None};
    std::string reason;
    bool allowed() const noexcept { return error == PolicyError::None; }
};
} // namespace deskdear
